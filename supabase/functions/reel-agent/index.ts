/* 🎬 reel-agent — 릴스 실행 에이전트 오케스트레이터 (사장님 확정 구조: 자체 렌더러 완주)
   유저 원본 클립 + 대본(갈비스 gen_reel_script) + 음성(본인 녹음 or AI TTS)을 받아
   STT 정렬 → 클립 비전 분석 → AI 내용 매칭(클립↔구간) → 렌더 큐 투입까지 서버가 자율 실행.
   실제 렌더는 렌더 워커(로컬 맥/컨테이너, ffmpeg)가 큐를 폴링해 수행한다.

   ops(유저 JWT):
     create  {script, clips:[{url,kind,thumb,dur}], voice_url | voice_mode:"ai"} → 잡 생성+정렬·매칭 실행 → render_queued
     status  {id} → 잡 상태(진행 로그 포함)
   ops(워커, x-worker-key):
     pick     → render_queued 1건 클레임(→rendering) + 렌더 스펙 반환
     progress {id, msg}
     presign  {id} → 결과 mp4 업로드용 R2 presigned PUT URL
     done     {id, key} → artifacts.video_url 확정, state done
     fail     {id, error} */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPA_URL, SVC_KEY);
const WORKER_KEY = Deno.env.get("REEL_WORKER_KEY") || "";
const OPENAI_KEY = Deno.env.get("STT_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
const DS_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const LLM_URL = DS_KEY ? "https://api.deepseek.com" : "https://api.openai.com/v1";
const LLM_KEY = DS_KEY || OPENAI_KEY;
const LLM_MODEL = DS_KEY ? "deepseek-chat" : "gpt-4o-mini";
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const CF_AI_TOKEN = Deno.env.get("CF_AI_TOKEN") || Deno.env.get("CF_WORKERS_AI_TOKEN") || "";
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const r2 = new AwsClient({ accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!, secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!, service: "s3", region: "auto" });

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info, x-worker-key" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

type Word = { w: string; s: number; e: number };

async function setJob(id: string, patch: Record<string, unknown>) {
  await sb.from("agent_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}
async function pushProgress(id: string, uid: string, msg: string) {
  try {
    const { data } = await sb.from("agent_jobs").select("progress").eq("id", id).single();
    const p = Array.isArray(data?.progress) ? data.progress : [];
    p.push({ at: new Date().toISOString(), msg });
    await setJob(id, { progress: p.slice(-40) });
    // 갈비스 진행줄(기존 frwork 채널)로도 라이브 전송
    await fetch(`${SUPA_URL}/realtime/v1/api/broadcast`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ messages: [{ topic: `frwork:${uid}`, event: "step", payload: { text: "🎬 " + msg, dock: false } }] }),
    });
  } catch (_) { /* 진행 표시는 실패해도 잡은 계속 */ }
}

// ── STT: CF whisper(단어 타임스탬프) → OpenAI verbose_json 폴백 (galla-stt와 동일 전략) ──
function b64(bytes: Uint8Array): string {
  let bin = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(bin);
}
async function sttWords(audioUrl: string): Promise<{ text: string; words: Word[] } | null> {
  const res = await fetch(audioUrl);
  if (!res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (CF_AI_TOKEN && CF_ACCOUNT) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/openai/whisper-large-v3-turbo`, {
        method: "POST", headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio: b64(bytes), task: "transcribe", language: "ko" }),
      });
      const d = await r.json().catch(() => null);
      const raw: any[] = Array.isArray(d?.result?.words) ? d.result.words
        : Array.isArray(d?.result?.segments) ? d.result.segments.flatMap((s: any) => Array.isArray(s?.words) ? s.words : []) : [];
      const words = raw.map((w: any) => ({ w: String(w?.word ?? w?.text ?? "").trim(), s: Number(w?.start), e: Number(w?.end) }))
        .filter((w) => w.w && isFinite(w.s) && isFinite(w.e));
      if (r.ok && d?.result?.text && words.length) return { text: String(d.result.text).trim(), words };
    } catch (_) { /* 폴백 */ }
  }
  if (!OPENAI_KEY) return null;
  const ext = /\.(m4a|mp4)(\?|$)/.test(audioUrl) ? "m4a" : /\.mp3(\?|$)/.test(audioUrl) ? "mp3" : "webm";
  const form = new FormData();
  form.append("file", new Blob([bytes]), "a." + ext);
  form.append("model", "whisper-1");
  form.append("language", "ko");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}` }, body: form });
  if (!r.ok) return null;
  const d = await r.json();
  const words = (Array.isArray(d?.words) ? d.words : []).map((w: any) => ({ w: String(w?.word || "").trim(), s: Number(w?.start), e: Number(w?.end) }))
    .filter((w: Word) => w.w && isFinite(w.s) && isFinite(w.e));
  return words.length ? { text: String(d?.text || "").trim(), words } : null;
}

// ── AI 음성(TTS) → R2 저장 → 공개 URL (본인 녹음 대신 선택 가능 — 사장님 '둘 다')
//    1순위 Gemini TTS(키 살아있음), 폴백 OpenAI(⚠️ 2026-08-14 현재 billing_not_active로 죽어있음 — 사장님 결제 필요) ──
function pcmToWav(pcm: Uint8Array, rate = 24000, ch = 1, bits = 16): Uint8Array {
  const ba = ch * bits / 8, br = rate * ba;
  const buf = new ArrayBuffer(44 + pcm.length); const v = new DataView(buf);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, "RIFF"); v.setUint32(4, 36 + pcm.length, true); ws(8, "WAVE"); ws(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true);
  v.setUint32(24, rate, true); v.setUint32(28, br, true); v.setUint16(32, ba, true); v.setUint16(34, bits, true);
  ws(36, "data"); v.setUint32(40, pcm.length, true);
  new Uint8Array(buf).set(pcm, 44);
  return new Uint8Array(buf);
}
async function ttsToR2(uid: string, script: string): Promise<string | null> {
  let bytes: Uint8Array | null = null, ext = "wav", ctype = "audio/wav";
  if (GEMINI_KEY) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${GEMINI_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `차분하고 신뢰감 있는 30대 한국 남성 맛집 내레이션 톤으로, 또박또박 읽어라:\n${script.slice(0, 1500)}` }] }],
          generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Charon" } } } },
        }),
      });
      const d = await r.json().catch(() => null);
      const b64 = d?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (r.ok && b64) {
        const pcm = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        bytes = pcmToWav(pcm);   // Gemini TTS = 24kHz s16le mono PCM
      } else console.error("[reel] gemini tts", r.status, JSON.stringify(d?.error || "").slice(0, 200));
    } catch (e) { console.error("[reel] gemini tts ex", String(e).slice(0, 120)); }
  }
  if (!bytes && OPENAI_KEY) {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini-tts", voice: "ash", input: script.slice(0, 1500), response_format: "mp3",
        instructions: "한국 맛집 릴스 내레이션. 30대 남성, 차분하고 신뢰감 있게, 또박또박 정보 전달. 과장 없이 담백하게, 존댓말.",
      }),
    });
    if (r.ok) { bytes = new Uint8Array(await r.arrayBuffer()); ext = "mp3"; ctype = "audio/mpeg"; }
  }
  if (!bytes) return null;
  const key = `audios/${uid}/reel-tts-${crypto.randomUUID()}.${ext}`;
  const put = await r2.fetch(`https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: "PUT", headers: { "content-type": ctype, "cache-control": "public, max-age=31536000, immutable" }, body: bytes,
  });
  if (!put.ok) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}

// ── 단어 → Vrew식 구절 자막(2~4어절) — 대본 의미분할 실패 시 폴백 ──
function chunkWords(words: Word[]) {
  const subs: { text: string; start: number; len: number }[] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length >= 3 || (cur[cur.length - 1].e - cur[0].s) >= 0.9) {
      subs.push({ text: cur.map((x) => x.w).join(" "), start: cur[0].s, len: Math.max(0.3, cur[cur.length - 1].e - cur[0].s + 0.12) });
      cur = [];
    }
  }
  if (cur.length) subs.push({ text: cur.map((x) => x.w).join(" "), start: cur[0].s, len: Math.max(0.3, cur[cur.length - 1].e - cur[0].s + 0.12) });
  clampOverlap(subs);
  return subs;
}

/* ── 자막 '의미 단위' 분할(사장님 지적: 기계적 3단어 컷은 구절이 깨진다) ──
   대본을 LLM으로 Vrew식 구절(1~4어절, 조사·의미 경계 보존)로 나누고,
   각 구절의 어절 수만큼 STT 단어를 순서대로 소비해 타임스탬프를 입힌다.
   (녹음이 대본과 어긋나 어절 수가 크게 다르면 null → chunkWords 폴백) */
async function splitScriptUnits(script: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${LLM_URL}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL, temperature: 0, max_tokens: 800,
        messages: [
          { role: "system", content: `릴스 자막 컷 편집기다. 대본을 '자막 한 장'씩 나눠라 — **한 장 = 1~2어절**(기본은 1어절, "안쪽 골목"처럼 떼면 어색한 것만 2어절). 실제 히트 릴스 예: ["대치동","철수네","포장마차입니다","할아버지 혼자","운영하시는"]. 원문 어절을 더하거나 빼거나 바꾸지 마라(문장부호는 빼도 됨). JSON 문자열 배열만 출력.` },
          { role: "user", content: script.slice(0, 1500) },
        ],
      }),
    });
    const d = await r.json();
    const m = /\[[\s\S]*\]/.exec(d?.choices?.[0]?.message?.content || "");
    if (!m) return null;
    const arr = JSON.parse(m[0]).map((s: any) => String(s).trim()).filter(Boolean);
    return arr.length >= 3 ? arr : null;
  } catch { return null; }
}
function alignUnits(units: string[], words: Word[]) {
  const unitCounts = units.map((u) => u.split(/\s+/).filter(Boolean).length);
  const total = unitCounts.reduce((a, b) => a + b, 0);
  if (!total || Math.abs(total - words.length) > Math.max(4, total * 0.25)) return null;   // 대본↔녹음 어긋남 크면 폴백
  const subs: { text: string; start: number; len: number }[] = [];
  let wi = 0;
  for (let i = 0; i < units.length; i++) {
    // 남은 단어를 남은 구절에 비례 배분(누적 오차 방지) — 기본은 구절의 어절 수만큼
    const remainUnits = unitCounts.slice(i).reduce((a, b) => a + b, 0);
    const take = Math.max(1, Math.min(Math.round(unitCounts[i] * (words.length - wi) / Math.max(1, remainUnits)), words.length - wi - (units.length - 1 - i)));
    const grp = words.slice(wi, wi + take);
    if (!grp.length) break;
    subs.push({ text: units[i].replace(/[.,!?…]/g, ""), start: grp[0].s, len: Math.max(0.25, grp[grp.length - 1].e - grp[0].s + 0.12) });
    wi += take;
  }
  clampOverlap(subs);
  return subs.length >= 3 ? subs : null;
}
/* ⚠️ 자막은 '빈틈없이 이어붙인다' — 원본(Vrew fcpxml) 실측: 카드가 연속이라 박스가 항상 떠있고 글자만 바뀐다.
   v4 실사고 2건이 다 여기서 났다: ①겹침(+0.12s 끝여유 → 두 문장 포개져 깨진 글자) ②공백(카드 사이 0.8s 무자막 → 박스가 꺼졌다 켜지는 깜빡임).
   각 장 = 정확히 다음 장 시작까지. 마지막 장만 제 길이 유지. */
function clampOverlap(subs: { text: string; start: number; len: number }[]) {
  for (let i = 0; i < subs.length - 1; i++) {
    subs[i].len = +(subs[i + 1].start - subs[i].start).toFixed(2);
  }
}

/* ── 클립 비전 분석: 대표 프레임 → [장면 설명 + 역할 + 쓸모 점수] ──
   역할(role)이 편집의 핵심이다: food/cook/eat = 릴스의 본체, place = 맥락(양념), junk = 버릴 컷.
   사장님 지적("쓸데없는 컷이 초반에 몰림")의 해법은 여기서 시작한다 — 캡션만으론 컷을 못 버린다.
   1순위 Gemini(이미지 바이트 인라인), 폴백 OpenAI, 최후 폴백(전부 food 취급 → 순서 배치로 강등). */
type ClipInfo = { cap: string; role: string; score: number; key: string };
let _capDbg = "";   // 🔬 진단: 마지막 캡션 실패 원인(create 응답에 노출)
function parseClipInfo(txt: string, n: number): ClipInfo[] {
  let arr: any[] = [];
  const m = /\[[\s\S]*\]/.exec(txt);
  try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
  // 절단 복구(MAX_TOKENS로 배열이 안 닫히는 실사고) — 객체 단위로 긁는다
  if (!arr.length) arr = [...txt.matchAll(/\{[^{}]*\}/g)].map((x) => { try { return JSON.parse(x[0]); } catch { return null; } }).filter(Boolean);
  return arr.slice(0, n).map((o: any, i: number) => ({
    cap: String(o?.c ?? o?.caption ?? o ?? "").slice(0, 40),
    role: ["food", "cook", "eat", "place", "junk"].includes(String(o?.r)) ? String(o.r) : "food",
    score: Math.max(1, Math.min(5, Number(o?.s) || 3)),
    key: String(o?.k || o?.c || `k${i}`).slice(0, 20),   // 소재 키(같은 음식·같은 장면 묶음) — 장면 중복 제거용
  }));
}
async function captionClips(clips: any[]): Promise<ClipInfo[]> {
  _capDbg = "";
  const thumbs = clips.map((c) => c.thumb || (c.kind === "image" ? c.url : null));
  const fallback: ClipInfo[] = clips.map((_, i) => ({ cap: `클립 ${i + 1}`, role: "food", score: 3, key: `k${i}` }));
  if (!thumbs.some(Boolean)) return fallback;
  const ask = `맛집 릴스 소스 클립들의 대표 프레임이다. 각 이미지를 순서대로 판정해 JSON 배열로만 답해라(이미지 개수와 같은 길이).
원소 형식: {"c":"장면 6~14자","k":"소재키","r":"food|cook|eat|place|junk","s":1~5}
k = **소재 키**: 무엇을 찍었는지 한 단어로 통일해서 붙여라. 같은 음식·같은 대상을 찍은 프레임은 각도·동작이 달라도 **반드시 똑같은 키**를 써야 한다(예: 빈대떡 클로즈업도 빈대떡 자르는 것도 전부 "빈대떡", 물냉면 여러 컷은 전부 "물냉면", 간판·외관은 "외관"). 이 키로 중복 장면을 골라낸다.
r = food(음식 클로즈업·완성된 상차림) / cook(붓기·비비기·자르기·굽기 등 손동작) / eat(먹는 장면·리액션) / place(외관·간판·거리·계단·내부·벽·메뉴판 등 맥락샷) / junk(흔들림·초점나감·의미 없는 이동샷)
s = 릴스에 쓸 만한 정도(5=군침 도는 결정적 컷, 1=버릴 컷)
설명 문장 금지, 배열만.`;
  if (GEMINI_KEY) {
    try {
      const parts: any[] = [{ text: ask }];
      for (const t of thumbs) {
        if (!t) continue;
        const res = await fetch(t);
        if (!res.ok) continue;
        const b = new Uint8Array(await res.arrayBuffer());
        let bin = ""; const CH = 0x8000;
        for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode(...b.subarray(i, i + CH));
        parts.push({ inlineData: { mimeType: "image/jpeg", data: btoa(bin) } });
      }
      /* 🔁 재시도·모델 폴백 — 비전이 죽으면 큐레이션이 통째로 무력화되고(전부 food 취급) 쓰레기 컷이 화면에 오른다.
         실사고: gemini-flash-latest 503 "high demand" 1회로 큐레이션 0건. 과부하는 대개 일시적이라 붙잡는다. */
      let r: Response | null = null, d: any = null, txt = "";
      const models = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-flash-lite-latest"];
      for (let attempt = 0; attempt < 4 && !txt; attempt++) {
        const mdl = models[Math.min(attempt, models.length - 1)];
        if (attempt) await new Promise((res) => setTimeout(res, 1200 * attempt));
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mdl}:generateContent?key=${GEMINI_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          // ⚠️ Gemini 3.x는 기본 thinking이 maxOutputTokens를 먹어치움(실측: 600 전부 사고에 소진→빈 출력) → 명시적으로 끈다
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } } }),
        });
        d = await r.json().catch(() => null);
        txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      }
      const info = parseClipInfo(txt, thumbs.filter(Boolean).length);
      if (info.length) {
        const out: ClipInfo[] = []; let k = 0;
        for (let i = 0; i < clips.length; i++) out.push(thumbs[i] ? (info[k++] || fallback[i]) : fallback[i]);
        return out;
      }
      _capDbg = `empty s=${r?.status} err=${JSON.stringify(d?.error || "").slice(0, 200)} fin=${d?.candidates?.[0]?.finishReason} txt=${txt.slice(0, 120)}`;
      console.error("[reel] gemini vision", _capDbg);
    } catch (e) { _capDbg = "ex " + String(e).slice(0, 200); console.error("[reel] gemini vision ex", _capDbg); }
  }
  if (OPENAI_KEY) {
    try {
      const content: any[] = [{ type: "text", text: ask }];
      for (const t of thumbs) if (t) content.push({ type: "image_url", image_url: { url: t, detail: "low" } });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 900, temperature: 0.2, messages: [{ role: "user", content }] }),
      });
      const d = await r.json();
      const info = parseClipInfo(d?.choices?.[0]?.message?.content || "", thumbs.filter(Boolean).length);
      if (info.length) {
        const out: ClipInfo[] = []; let k = 0;
        for (let i = 0; i < clips.length; i++) out.push(thumbs[i] ? (info[k++] || fallback[i]) : fallback[i]);
        return out;
      }
    } catch { /* 아래 폴백 */ }
  }
  return fallback;
}

/* ── 글자 대조 매칭(1순위) — "빈대떡" 말할 때 빈대떡 화면. ──
   LLM 배치는 실측에서 계속 한 접시씩 밀렸다(빈대떡 구간에 제육무침). 대본 자막과 클립 장면 설명을
   한글 2-gram으로 직접 대조하면 이 종류의 매칭은 결정적으로 맞출 수 있다 — 모델 편차도 없고 비용도 0.
   컷 경계는 자막 경계에만 둔다(말 중간에 안 끊긴다). */
const bigramsOf = (s: string) => {
  const t = String(s).replace(/\s+/g, "");
  const out = new Set<string>();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
};
const sharedBigrams = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
let _matchDbg = "";   // 🔬 진단: 어떤 경로로 구간을 만들었는지 + 구간별 배정(create 응답에 노출)
function textMatchTimeline(subs: any[], info: ClipInfo[], clips: any[], voiceDur: number, script = "") {
  _matchDbg = "";
  if (!subs.length || clips.length < 2) { _matchDbg = `skip subs=${subs.length} clips=${clips.length}`; return null; }
  const target = Math.max(2.8, Math.min(4.6, voiceDur / Math.max(4, Math.min(clips.length, 9))));
  /* ① 컷 구간 = '문장' 단위. 한 문장이 곧 한 소재다("빈대떡은 겉은 바삭…" = 빈대떡 컷).
     문장을 가로질러 4초씩 끊으면 "…돕니다 / 빈대떡은"이 한 구간에 섞여 매칭이 뭉개진다(실사고).
     문장이 길면(>5.5s) 안에서만 쪼갠다. 대본이 없으면 종전처럼 시간 기준. */
  const wins: { start: number; end: number; text: string }[] = [];
  const sentences = script.split(/[.!?\n]+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 2);
  let built = false;
  if (sentences.length >= 2) {
    let si = 0;   // 소비한 자막 인덱스
    /* ⚠️ 문장 경계는 '길이 세기'로 잡으면 밀린다(어절 수·글자 수 둘 다 실패 — 자막이 대본과 1:1이 아닐 수 있다).
       각 문장의 첫 단어를 자막 스트림에서 직접 찾아 그 시각을 경계로 쓴다. 못 찾으면 길이 추정으로 폴백. */
    const norm = (s: string) => s.replace(/[^가-힣0-9a-zA-Z]/g, "");
    const starts: number[] = [];
    for (let s = 0; s < sentences.length; s++) {
      const head = norm(sentences[s].split(/\s+/)[0]).slice(0, 3);
      let found = -1;
      for (let k = si; k < subs.length; k++) {
        if (head && norm(subs[k].text).startsWith(head)) { found = k; break; }
      }
      if (found < 0) {   // 폴백 — 남은 문장 길이 비례로 추정
        const need = norm(sentences[s]).length;
        let got = 0; found = si;
        while (si < subs.length && got < need * 0.9) { got += norm(subs[si].text).length; si++; }
        starts.push(found);
        continue;
      }
      starts.push(found);
      si = found + 1;
    }
    si = 0;
    for (let s = 0; s < sentences.length; s++) {
      const sent = sentences[s];
      const from = starts[s];
      if (from === undefined || from >= subs.length) break;
      const start = subs[from].start;
      const nextIdx = starts[s + 1];
      const end = (nextIdx !== undefined && nextIdx < subs.length) ? subs[nextIdx].start : voiceDur;
      if (end - start < 0.8) continue;
      // 긴 문장은 안에서만 균등 분할(소재는 그대로 유지 — 뒤쪽엔 같은 소재 예비 컷이 붙는다)
      const parts = Math.max(1, Math.min(3, Math.round((end - start) / Math.max(target, 3.2))));
      for (let p = 0; p < parts; p++) {
        wins.push({
          start: +(start + (end - start) * p / parts).toFixed(2),
          end: +(start + (end - start) * (p + 1) / parts).toFixed(2),
          text: sent,
        });
      }
      built = true;
    }
  }
  if (!built) {
    let curStart = 0, curText: string[] = [];
    for (let i = 0; i < subs.length; i++) {
      curText.push(subs[i].text);
      const end = (i + 1 < subs.length) ? subs[i + 1].start : voiceDur;
      if (end - curStart >= target || i === subs.length - 1) {
        wins.push({ start: curStart, end, text: curText.join(" ") });
        curStart = end; curText = [];
      }
    }
  }
  _matchDbg = `${built ? "sentence" : "time"} wins=${wins.length} [${wins.slice(0, 8).map((w) => `${w.start.toFixed(1)}-${w.end.toFixed(1)}:${w.text.slice(0, 10)}`).join(" | ")}]`;
  if (wins.length < 2) return null;
  // ② 구간별로 '말한 내용'과 장면 설명이 가장 겹치는 클립 배정(같은 클립 재사용 없음)
  const sigs = info.map((c) => bigramsOf(`${c.cap} ${c.key}`));
  const sigsAll = sigs, foodishRole = (r: string) => r === "food" || r === "cook" || r === "eat";
  const foodish = foodishRole;
  /* ⚠️ 왼쪽부터 순서대로 배정하면 앞 구간이 뒤 구간의 짝을 먼저 써버린다 —
     실사고: 초반 구간이 물냉면 컷을 가져가서 정작 "물냉면은 슴슴한 육수에" 구간엔 가게 외관이 남았다.
     → **내용이 확실히 겹치는 쌍(강한 매칭)부터 전역으로 배정**하고, 남은 구간을 나중에 채운다. */
  const used = new Set<number>();
  const assign: number[] = new Array(wins.length).fill(-1);
  const pairs: { w: number; i: number; sc: number }[] = [];
  for (let w = 0; w < wins.length; w++) {
    const wsig = bigramsOf(wins[w].text);
    for (let i = 0; i < clips.length; i++) {
      const sh = sharedBigrams(sigs[i], wsig);
      if (sh >= 2) pairs.push({ w, i, sc: sh * 3 + info[i].score + (foodish(info[i].role) ? 1 : 0) });
    }
  }
  pairs.sort((a, b) => b.sc - a.sc);
  for (const p of pairs) {
    if (assign[p.w] >= 0 || used.has(p.i)) continue;
    if (p.w === 0 && !foodish(info[p.i].role)) continue;   // 훅(첫 컷)은 반드시 음식
    assign[p.w] = p.i; used.add(p.i);
  }
  for (let w = 0; w < wins.length; w++) {                  // 짝이 없던 구간 — 남은 컷 중 음식 우선
    if (assign[w] >= 0) continue;
    let best = -1, bestScore = -1;
    for (let i = 0; i < clips.length; i++) {
      if (used.has(i)) continue;
      const sc = info[i].score + (foodish(info[i].role) ? 2 : (w === 0 ? -6 : -1));
      if (sc > bestScore) { bestScore = sc; best = i; }
    }
    if (best < 0) continue;
    assign[w] = best; used.add(best);
  }
  const segs: { clip: number; start: number; end: number }[] = [];
  for (let w = 0; w < wins.length; w++) {
    if (assign[w] < 0) continue;
    segs.push({ clip: assign[w], start: wins[w].start, end: wins[w].end });
  }
  if (segs.length < 2) return null;
  /* 🛡 긴 구간 강제 분할 — 문장 앵커가 실패해 여러 문장이 한 구간으로 묶이면 13초짜리 정지화면이 된다(실사고).
     경로와 무관하게 5.5초를 넘는 구간은 균등 분할하고, 조각마다 다른(같은 소재 우선) 클립을 배정한다. */
  const out: { clip: number; start: number; end: number }[] = [];
  const usedAll = new Set<number>(segs.map((s) => s.clip));
  for (const s of segs) {
    const span = s.end - s.start;
    const parts = Math.max(1, Math.ceil(span / 5.5));
    for (let p = 0; p < parts; p++) {
      const st = +(s.start + span * p / parts).toFixed(2);
      const en = +(s.start + span * (p + 1) / parts).toFixed(2);
      let clip = s.clip;
      if (p > 0) {   // 조각 2번째부터는 아직 안 쓴 클립 중 이 구간 소재와 가장 가까운 것
        let best = -1, bestScore = -1;
        const wsig = bigramsOf(subs.filter((x: any) => x.start >= st - 0.05 && x.start < en).map((x: any) => x.text).join(" "));
        for (let i = 0; i < clips.length; i++) {
          if (usedAll.has(i)) continue;
          const sc = sharedBigrams(sigsAll[i], wsig) * 3 + sharedBigrams(sigsAll[i], sigsAll[s.clip]) * 2 + info[i].score
            + (foodishRole(info[i].role) ? 2 : -2);
          if (sc > bestScore) { bestScore = sc; best = i; }
        }
        if (best >= 0) { clip = best; usedAll.add(best); }
      }
      out.push({ clip, start: st, end: en });
    }
  }
  return out;
}

// ── AI 내용 매칭(2순위 폴백): 자막 타임라인 × 클립 장면 → 세그먼트 배치 ──
async function matchTimeline(subs: any[], info: ClipInfo[], clips: any[], voiceDur: number): Promise<{ clip: number; start: number; end: number }[] | null> {
  try {
    const sys = `너는 맛집 릴스 편집 PD다. 내레이션 자막 타임라인과 소스 클립 목록을 보고, 각 시간 구간에 올릴 클립을 배치해라.

🎯 **제1원칙 — 화면은 대본을 문자 그대로 그리지 않는다.**
릴스의 본체는 '음식'이다. food/cook/eat 클립이 전체 화면 시간의 80% 이상을 차지해야 한다.
place(외관·간판·거리·계단·벽·내부)는 양념이라 **통틀어 최대 1~2컷, 각각 3초 이하**.
가게 소개·역사·위치 내레이션이 나온다고 place 컷을 줄줄이 깔지 마라 — 초반이 맥락샷으로 채워지면 3초 만에 이탈한다.
설명 문장 구간에는 **뒤에 나올 음식·조리 장면을 미리 깔아라**(실제 히트 릴스가 그렇게 한다).

규칙: ①**0초 첫 컷은 무조건 가장 군침 도는 컷**(food/cook/eat 중 점수 최고) — 훅이다 ②구간은 0초부터 ${voiceDur.toFixed(1)}초까지 빈틈없이, 구간당 2.5~5.5초(총 ${Math.round(voiceDur / 3.2)}컷 안팎) ③내용 연결은 '음식 종류' 수준으로 맞춰라(냉면 얘기=냉면 컷, 빈대떡 얘기=빈대떡 컷) ④같은 클립 반복 금지(모자랄 때만, 연속 금지) ⑤클립 길이(dur) 초과 금지 ⑥점수 낮은 컷은 아예 쓰지 마라(전부 쓸 필요 없다).
JSON만 출력: {"segments":[{"clip":클립번호(0부터),"start":초,"end":초},...]}`;
    const user = `내레이션 자막(시각순):\n${subs.map((s: any) => `${s.start.toFixed(1)}s "${s.text}"`).join("\n")}\n\n쓸 수 있는 클립(이미 중복·버릴 컷은 걸러진 목록이다):\n${info.map((c, i) => `${i}: [${c.role}/${c.score}점] ${c.cap} (길이 ${Number(clips[i]?.dur || 8).toFixed(1)}s)`).join("\n")}\n\n끝 구간까지 내용이 맞는지 스스로 검증해라 — 냉면 얘기에 빈대떡 화면이 나오면 실패다.`;
    // 지시 이행이 좋은 Gemini 우선(실사고: 딥시크가 앞 클립만 순서대로 깔고 끝냄 — 후반 내용 불일치), 실패 시 딥시크
    let txt = "";
    if (GEMINI_KEY) {
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: sys + "\n\n" + user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 1500, thinkingConfig: { thinkingBudget: 0 } } }),
        });
        const d = await r.json().catch(() => null);
        txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      } catch { /* 딥시크 폴백 */ }
    }
    if (!/\{[\s\S]*\}/.test(txt)) {
      const r = await fetch(`${LLM_URL}/chat/completions`, {
        method: "POST", headers: { Authorization: `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: LLM_MODEL, temperature: 0.2, max_tokens: 900, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
      });
      const d = await r.json();
      txt = d?.choices?.[0]?.message?.content || "";
    }
    const m = /\{[\s\S]*\}/.exec(txt);
    if (!m) return null;
    const segs = (JSON.parse(m[0])?.segments || [])
      .map((s: any) => ({ clip: Math.max(0, Math.min(clips.length - 1, Number(s.clip) || 0)), start: Number(s.start) || 0, end: Number(s.end) || 0 }))
      .filter((s: any) => s.end > s.start);
    return segs.length ? segs : null;
  } catch { return null; }
}
// 매칭 실패 폴백 — 촬영 순서 균등 배치(그래도 완성은 시킨다)
function orderTimeline(clips: any[], voiceDur: number) {
  const K = clips.length, segs = [];
  let t = 0, gi = 0;
  const ideal = Math.max(1.5, voiceDur / K);
  while (t < voiceDur - 0.05 && segs.length < 30) {
    const idx = gi % K;
    const take = Math.min(Math.max(ideal, 1.5), Math.max(1.0, Number(clips[idx]?.dur || 8) - 0.1), voiceDur - t);
    segs.push({ clip: idx, start: +t.toFixed(2), end: +(t + take).toFixed(2) });
    t += take; gi++;
  }
  return segs;
}

// ── create: 정렬~매칭까지 실행 후 렌더 큐 투입 ──
async function runCreate(uid: string, body: any): Promise<Response> {
  const script = String(body?.script || "").slice(0, 2000);
  const clips = (Array.isArray(body?.clips) ? body.clips : [])
    .map((c: any) => ({ url: String(c?.url || ""), kind: String(c?.kind || "video"), thumb: c?.thumb ? String(c.thumb) : null, dur: Number(c?.dur) || 8 }))
    .filter((c: any) => /^https?:\/\//.test(c.url)).slice(0, 15);
  if (!clips.length) return j({ error: "no_clips" }, 400);
  const voiceMode = body?.voice_mode === "ai" ? "ai" : "self";
  let voiceUrl = String(body?.voice_url || "");
  if (voiceMode === "self" && !/^https?:\/\//.test(voiceUrl)) return j({ error: "no_voice" }, 400);

  const { data: job, error } = await sb.from("agent_jobs")
    .insert({ user_id: uid, kind: "reel", state: "aligning", inputs: { script, clips, voice_mode: voiceMode, voice_url: voiceUrl || null } })
    .select("id").single();
  if (error || !job) return j({ error: "job_insert" }, 500);
  const id = job.id as string;

  try {
    if (voiceMode === "ai") {
      await pushProgress(id, uid, "AI 목소리 만드는 중");
      const u = await ttsToR2(uid, script);
      if (!u) throw new Error("tts_failed");
      voiceUrl = u;
      await setJob(id, { inputs: { script, clips, voice_mode: voiceMode, voice_url: voiceUrl } });
    }
    await pushProgress(id, uid, "녹음 받아쓰는 중(자막 타이밍)");
    const stt = await sttWords(voiceUrl);
    if (!stt) throw new Error("stt_failed");
    // 🎬 자막은 '의미 단위'로(사장님 지적) — 대본 구절 분할→타임스탬프 정렬, 실패 시 기계 분할 폴백
    let subs = null as any;
    if (script) {
      const units = await splitScriptUnits(script);
      if (units) subs = alignUnits(units, stt.words);
    }
    if (!subs) subs = chunkWords(stt.words);
    let voiceDur = stt.words[stt.words.length - 1].e + 0.6;

    // ⏱ 30초 타겟 — 내레이션이 길면 오디오 템포를 올리고(캡 1.25배) 모든 타이밍을 같은 비율로 압축
    let tempo = 1;
    if (voiceDur > 32) {
      tempo = +Math.min(1.25, voiceDur / 30).toFixed(3);
      subs = subs.map((s: any) => ({ text: s.text, start: +(s.start / tempo).toFixed(2), len: +(s.len / tempo).toFixed(2) }));
      voiceDur = +(voiceDur / tempo).toFixed(2);
    }

    await pushProgress(id, uid, "클립 장면 분석 중");
    const info = await captionClips(clips);

    /* 🗑 컷 큐레이션 — 사장님 지적 2건의 해법(“쓸데없는 컷이 초반에 몰림”, “같은 장면 중복 절대 금지”).
       ①junk·저점수 컷은 아예 후보에서 뺀다(전부 쓸 필요 없다)
       ②**소재(key) 중복 제거** — 빈대떡 4컷·냉면 3컷이 있어도 소재당 '최고 점수 한 컷'만 남긴다(파일이 달라도 화면엔 같은 음식이면 중복이다)
       ③place(외관·거리·계단·벽)는 통틀어 최대 2컷 — 초반 몰림의 주범
       ④너무 적게 남으면 단계적으로 완화(완성은 시킨다) */
    const foodish = (r: string) => r === "food" || r === "cook" || r === "eat";
    const groupByKey = (idxs: number[]) => {   // 소재별 그룹(점수 내림차순) — 1등만 본편, 나머지는 예비
      const m = new Map<string, number[]>();
      for (const i of idxs) {
        const k = info[i].key || `k${i}`;
        m.set(k, [...(m.get(k) || []), i]);
      }
      for (const [k, v] of m) m.set(k, v.sort((a, b) => info[b].score - info[a].score));
      return m;
    };
    const bestByKey = (idxs: number[]) => [...groupByKey(idxs).values()].map((v) => v[0]);
    /* 🔁 같은 대상 판정 — 모델이 주는 key가 "제육무침에 식초 뿌리기"/"겨자와 제육무침 섞기"처럼 갈라지면
       중복이 그대로 통과한다(실사고). 캡션 글자 2-gram이 2개 이상 겹치면 같은 대상으로 본다.
       ⚠️ 전이 병합(물냉면–한상–비빔냉면이 한 덩어리로 붙는 것)을 피하려고 union이 아니라 '점수 높은 순 그리디'로 고른다. */
    const shared = sharedBigrams;
    const sigOf = (i: number) => bigramsOf(`${info[i].cap} ${info[i].key}`);
    const dedupGreedy = (idxs: number[]) => {
      const sorted = [...idxs].sort((a, b) => info[b].score - info[a].score || a - b);
      const kept: number[] = [], keptSig: Set<string>[] = [], keptKeys = new Set<string>();
      for (const i of sorted) {
        if (keptKeys.has(info[i].key)) continue;
        const sig = sigOf(i);
        if (keptSig.some((s) => shared(sig, s) >= 2)) continue;
        kept.push(i); keptSig.push(sig); keptKeys.add(info[i].key);
      }
      return kept.sort((a, b) => a - b);
    };
    const all = clips.map((_: any, i: number) => i);
    let cand = all.filter((i) => info[i].role !== "junk" && info[i].score >= 3);
    if (cand.length < 5) cand = all.filter((i) => info[i].role !== "junk");
    if (cand.length < 3) cand = all;
    const foods = dedupGreedy(cand.filter((i) => foodish(info[i].role)));
    /* 맥락샷(place)은 기본 1컷만 — 초반 몰림의 주범이라 대부분 버린다.
       ⚠️ 단, **대본이 그 장면을 직접 말하면 지킨다**: "2층 입구가 좁아서"라고 말하는데 계단 컷을 버려놔서
          그 구간에 냉면이 나오는 사고가 있었다(사장님 지적). 대본 글자와 겹치는 맥락샷은 최대 3컷까지 남긴다. */
    const scriptSig = bigramsOf(script);
    const placeAll = dedupGreedy(cand.filter((i) => info[i].role === "place"))
      .sort((a, b) => info[b].score - info[a].score);
    const placeNamed = placeAll.filter((i) => sharedBigrams(sigOf(i), scriptSig) >= 2).slice(0, 3);
    const places = placeNamed.length ? [...new Set([...placeNamed, placeAll[0]])].filter((i) => i !== undefined) : placeAll.slice(0, 1);
    let keep = [...foods, ...places].sort((a, b) => a - b);
    if (keep.length < 3) keep = cand;
    const pool = keep.map((i) => clips[i]);
    const poolInfo = keep.map((i) => info[i]);
    // 🎞 예비 컷 — 같은 소재의 2등 컷들. 본편만으론 시간을 못 채울 때 '같은 소재 바로 뒤'에만 붙인다
    //    (떨어져서 다시 나오면 중복이지만, 붙여 쓰면 그 음식을 이어 보여주는 자연스러운 편집이다).
    const backups = cand.filter((i) => foodish(info[i].role) && !foods.includes(i) && info[i].score >= 3);
    const dropped = clips.length - pool.length;
    if (dropped > 0) await pushProgress(id, uid, `쓸 컷 고르는 중 — ${pool.length}컷 채택, ${dropped}컷 제외(중복·맥락샷)`);

    await pushProgress(id, uid, "장면·내레이션 매칭 중");
    // 1순위 글자 대조(결정적·정확), 2순위 LLM, 최후 촬영 순서
    let segs = textMatchTimeline(subs, poolInfo, pool, voiceDur, script);
    if (!segs) segs = await matchTimeline(subs, poolInfo, pool, voiceDur);
    if (!segs) segs = orderTimeline(pool, voiceDur);
    /* 타임라인 무결성:
       - 컷 최소 2.2초(깜빡임 방지) — 짧으면 앞 컷에 흡수
       - 큐레이션을 통과한 클립은 각각 한 번씩만(소재 중복은 이미 제거됨)
       - 채울 게 없으면 컷을 늘려서 메운다(같은 장면 재등장보다 낫다) */
    /* 🧱 타임라인 조립 — **구간(문장) 경계는 절대 시각으로 고정한다.**
       ⚠️ 예전 방식(컷 길이를 이어붙이는 방식)은 클립이 구간보다 짧으면 뒤 구간이 통째로 당겨져
          "빈대떡" 말할 때 무침이 나오는 밀림을 만들었다(실사고 3회). 구간이 안 채워지면 컷을 줄이는 게 아니라
          **그 구간 안을 같은 소재의 다른 앵글로 이어 채운다**(그래서 뒤 구간 시작 시각은 절대 안 밀린다). */
    segs.sort((a, b) => a.start - b.start);
    const CUT_MAX = 5.5, CUT_MIN = 1.6;
    // 본편(pool) + 예비 컷(같은 소재 다른 앵글)을 한 배열로 — 채우기는 예비까지 쓴다
    const fillIdx = [...keep, ...backups.filter((i) => !keep.includes(i))];
    const fClips = fillIdx.map((i) => clips[i]);
    const fInfo = fillIdx.map((i) => info[i]);
    const fSig = fInfo.map((c: ClipInfo) => bigramsOf(`${c.cap} ${c.key}`));
    const poolPos = new Map<number, number>(keep.map((ci, pi) => [pi, fillIdx.indexOf(ci)]));   // segs의 pool 인덱스 → fill 인덱스
    const usedSec = new Map<number, number>();
    const availOf = (i: number) => Math.max(0, (Number(fClips[i].dur) || 8) - 0.15 - (usedSec.get(i) || 0));
    const timeline: { src: string; in: number; dur: number }[] = [];
    const take = (i: number, want: number) => {
      const off = usedSec.get(i) || 0;
      const dur = +Math.min(want, availOf(i), CUT_MAX).toFixed(2);
      if (dur < 0.8) return 0;
      timeline.push({ src: fClips[i].url, in: +off.toFixed(2), dur });
      usedSec.set(i, off + dur);
      return dur;
    };
    /* ⚠️ t는 '실제로 만든 영상 길이'다. 예전 코드는 채우지 못한 구간도 t = segEnd로 넘겨버려
       (영상은 안 늘고 시간만 소비) 뒤 구간이 통째로 밀리고 7구간이 4컷으로 뭉갰다 — 실사고. */
    const idxByUrl = new Map<string, number>(fClips.map((c: any, i: number) => [c.url, i]));
    const extendLast = (want: number) => {   // 마지막 컷 연장(클립에 실제 남은 분량 안에서만)
      if (!timeline.length || want <= 0.01) return 0;
      const last = timeline[timeline.length - 1];
      const li = idxByUrl.get(last.src);
      const room = (Number(durOfAll.get(last.src)) || 8) - 0.15 - last.in - last.dur;
      const add = +Math.min(want, Math.max(0, room), Math.max(0, CUT_MAX - last.dur)).toFixed(2);
      if (add <= 0.01) return 0;
      last.dur = +(last.dur + add).toFixed(2);
      if (li !== undefined) usedSec.set(li, (usedSec.get(li) || 0) + add);
      return add;
    };
    let t = 0;
    for (const s of segs) {
      const segEnd = Math.min(s.end, voiceDur);
      if (segEnd - t < 0.25) continue;   // 이미 채운 구간
      const main = poolPos.get(s.clip) ?? -1;
      let firstInWindow = true;
      while (segEnd - t > 0.15) {
        const need = +(segEnd - t).toFixed(2);
        // 자투리(1.6초 미만)는 새 컷을 만들지 않고 직전 컷을 늘려 흡수한다(1초짜리 컷 = 깜빡임)
        if (need < CUT_MIN && timeline.length) {
          t = +(t + extendLast(need)).toFixed(2);
          break;
        }
        let pick = -1;
        if (firstInWindow && main >= 0 && availOf(main) >= Math.min(need, CUT_MIN)) pick = main;
        if (pick < 0) {
          /* 미사용 컷이 절대 우선(같은 클립 재등장 = 중복). 남은 게 없을 때만 이미 쓴 클립의 '뒷부분'을 쓴다
             (같은 파일이어도 다른 구간이라 화면은 다르다). 그 안에서는 같은 소재·고품질·음식 순. */
          const ranked = fClips.map((_: any, i: number) => i)
            .filter((i) => availOf(i) >= Math.min(need, CUT_MIN))
            .map((i) => ({
              i,
              sc: (usedSec.has(i) ? 0 : 100)
                + (main >= 0 ? sharedBigrams(fSig[i], fSig[main]) * 3 : 0)
                + fInfo[i].score + (foodish(fInfo[i].role) ? 2 : -2),
            }))
            .sort((a, b) => b.sc - a.sc);
          if (!ranked.length) break;
          pick = ranked[0].i;
        }
        const got = take(pick, need);
        if (!got) break;
        t += got;
        firstInWindow = false;
      }
      /* 쓸 컷이 동났는데 구간이 남았다 — 마지막 컷을 길게 늘이면 13초짜리 정지화면이 된다(실사고).
         대신 가장 긴 클립들의 앞부분을 다시 열어 5.5초 이하 컷으로 이어 채운다(구간 경계는 그대로 지킨다). */
      /* 쓸 컷이 동났는데 구간이 남았다 — 클립들의 앞부분을 다시 열어 5.5초 이하 컷으로 이어 채운다.
         ⚠️ 마지막 컷을 늘려 때우면 13~18초짜리 정지화면이 된다(실사고 2회) — 반드시 여기서 끝낸다. */
      let guard = 0;
      while (segEnd - t > 0.15 && guard++ < 12) {
        const need = +(segEnd - t).toFixed(2);
        if (need < CUT_MIN && timeline.length) {
          const added = extendLast(need);
          t = +(t + added).toFixed(2);
          if (added <= 0.01) { /* 연장 불가 — 아래에서 새 컷으로 채운다 */ } else break;
        }
        const lastSrc = timeline.length ? timeline[timeline.length - 1].src : "";
        let best = -1, bestRoom = -1;
        for (let i = 0; i < fClips.length; i++) {
          if (fClips[i].url === lastSrc) continue;              // 바로 앞 컷과 같은 파일은 제외(정지화면처럼 보인다)
          const room = Math.max(availOf(i), (Number(fClips[i].dur) || 8) - 0.15);
          if (room > bestRoom) { best = i; bestRoom = room; }
        }
        if (best < 0) {                                        // 후보가 하나뿐 — 그 클립의 앞부분을 다시 연다
          const only = fClips.findIndex((c: any) => c.url !== lastSrc);
          if (only < 0) break;
          usedSec.set(only, 0);
          const got0 = take(only, need);
          if (!got0) break;
          t += got0;
          continue;
        }
        if (availOf(best) < CUT_MIN) usedSec.set(best, 0);      // 다 쓴 클립이면 앞부분부터 다시(사이에 다른 컷이 낀 상태)
        const got = take(best, Math.min(need, CUT_MAX));
        if (!got) break;
        t += got;
      }
      if (t < segEnd - 0.15) t = +(t + extendLast(segEnd - t)).toFixed(2);   // 남은 자투리는 '실제로 늘린 만큼만' 반영
    }
    const durOfAll = new Map<string, number>(clips.map((c: any) => [c.url, Number(c.dur) || 8]));

    /* 🛡 최종 컷 상한(경로 무관 안전망) — 매칭이 어느 경로로 오든 5.5초 넘는 컷은 여기서 쪼갠다.
       미사용 클립이 있으면 그걸 넣고, 없으면 같은 클립의 '다음 구간'을 이어 쓴다(정지화면 방지). */
    for (let i = 0; i < timeline.length && timeline.length < 24; i++) {
      while (timeline[i].dur > 5.6) {
        const rest = +(timeline[i].dur - 5.5).toFixed(2);
        timeline[i].dur = 5.5;
        const inUse = new Set(timeline.map((s) => s.src));
        let best = -1, bestRoom = 0;
        for (let k = 0; k < fClips.length; k++) {
          if (inUse.has(fClips[k].url)) continue;
          const room = (Number(fClips[k].dur) || 8) - 0.15;
          if (room > bestRoom) { best = k; bestRoom = room; }
        }
        const nextIn = +(timeline[i].in + timeline[i].dur).toFixed(2);
        const sameRoom = (durOfAll.get(timeline[i].src) || 8) - 0.15 - nextIn;
        // ①미사용 클립 → ②같은 클립의 다음 구간 → ③아무 다른 클립의 앞부분(최후). 셋 다 없을 때만 원복.
        let seg = (best >= 0 && bestRoom >= Math.min(rest, 1.6))
          ? { src: fClips[best].url, in: 0, dur: +Math.min(rest, bestRoom, 5.5).toFixed(2) }
          : (sameRoom >= Math.min(rest, 1.0)
            ? { src: timeline[i].src, in: nextIn, dur: +Math.min(rest, sameRoom, 5.5).toFixed(2) }
            : null);
        if (!seg) {
          const alt = fClips.findIndex((c: any) => c.url !== timeline[i].src && (Number(c.dur) || 8) > 1.6);
          if (alt >= 0) seg = { src: fClips[alt].url, in: 0, dur: +Math.min(rest, (Number(fClips[alt].dur) || 8) - 0.15, 5.5).toFixed(2) };
        }
        if (!seg) { timeline[i].dur = +(timeline[i].dur + rest).toFixed(2); break; }
        timeline.splice(i + 1, 0, seg);
        if (seg.dur < rest) timeline[i + 1].dur = +(seg.dur).toFixed(2);
        const covered = seg.dur;
        if (covered < rest) {   // 남은 건 다음 루프에서 계속 쪼갠다
          timeline.splice(i + 2, 0, { src: seg.src, in: +(seg.in + seg.dur).toFixed(2), dur: +(rest - covered).toFixed(2) });
        }
        i++;
      }
    }

    /* 🪝 훅 보정 — 첫 컷이 맥락샷(place)이면 가장 군침 도는 음식 컷과 자리를 바꾼다.
       실제 히트 릴스는 인트로 내레이션 중에도 화면은 음식이다(수현이네 실측: 2초·6초·20초 전부 음식). */
    if (timeline.length > 1) {
      const roleOf = new Map<string, string>(clips.map((c: any, i: number) => [c.url, info[i].role]));
      const isPlace = (s: any) => roleOf.get(s.src) === "place";
      const isFood = (s: any) => foodish(String(roleOf.get(s.src)));
      const swap = (i: number, j: number) => {   // 길이가 서로를 감당할 때만 교체
        const a = timeline[i], b = timeline[j];
        if ((durOfAll.get(b.src) || 8) - 0.1 < a.dur || (durOfAll.get(a.src) || 8) - 0.1 < b.dur) return false;
        const s = a.src; a.src = b.src; b.src = s; a.in = 0; b.in = 0;
        return true;
      };
      if (isPlace(timeline[0])) {   // 첫 컷은 무조건 군침 컷
        const fi = timeline.findIndex((s, i) => i > 0 && isFood(s));
        if (fi > 0) swap(0, fi);
      }
      /* 맥락샷은 오프닝 '두 번째~' 자리에만 — 뒤쪽(40% 이후) place는 앞쪽 음식 컷과 교체.
         ⚠️ 0번(훅)과는 절대 교체하지 않는다 — 위에서 앞으로 보낸 음식 컷을 되돌려놔 무한 핑퐁이 된다(실사고). */
      const cutoff = Math.max(2, Math.floor(timeline.length * 0.4));
      for (let i = timeline.length - 1; i >= cutoff; i--) {
        if (!isPlace(timeline[i])) continue;
        const fj = timeline.findIndex((s, j) => j >= 1 && j < cutoff && isFood(s));
        if (fj >= 1) swap(i, fj);
      }
    }
    /* 남은 공백 마감 — ⚠️ 예전엔 여기서 부족분을 통째로 마지막 컷에 얹었다.
       그 결과 8초가 한 컷에 실려 13~16초짜리 정지화면이 됐다(사장님 지적의 진범).
       이제는 5.5초 이하 컷으로 클립을 돌려가며 채운다. */
    {
      let guard = 0;
      while (voiceDur - t > 0.15 && guard < 12) {
        const want = +(voiceDur - t).toFixed(2);
        const lastSrc = timeline.length ? timeline[timeline.length - 1].src : "";
        let best = -1, bestRoom = -1;
        for (let i = 0; i < fClips.length; i++) {
          if (fClips[i].url === lastSrc) continue;
          const room = Math.max(availOf(i), (Number(fClips[i].dur) || 8) - 0.15);
          if (room > bestRoom) { best = i; bestRoom = room; }
        }
        if (best < 0) break;
        if (availOf(best) < Math.min(want, 1.0)) usedSec.set(best, 0);
        const got = take(best, Math.min(want, CUT_MAX));
        if (!got) break;
        t += got;
        guard++;
      }
      if (voiceDur - t > 0.15) t = +(t + extendLast(voiceDur - t)).toFixed(2);
    }
    // 🔚 2.2초 미만 꼬리 컷은 앞 컷에 흡수(끝에서 깜빡 — 실검수에서 1.4s 꼬리 발견)
    while (timeline.length >= 2 && timeline[timeline.length - 1].dur < 2.2) {
      const tail = timeline.pop()!;
      timeline[timeline.length - 1].dur = +(timeline[timeline.length - 1].dur + tail.dur).toFixed(2);
    }

    await setJob(id, { state: "render_queued", artifacts: { transcript: stt.text, subtitles: subs, clip_info: info, pool_info: poolInfo, timeline, voice_dur: +voiceDur.toFixed(2), voice_tempo: tempo } });
    await pushProgress(id, uid, "렌더 대기열 진입");
    return j({ ok: true, id, state: "render_queued", used: poolInfo.map((c) => `${c.cap}[${c.role}]`), dropped, segments: timeline.length, cap_dbg: _capDbg || undefined, match_dbg: _matchDbg || undefined });
  } catch (e) {
    await setJob(id, { state: "failed", error: String(e).slice(0, 200) });
    await pushProgress(id, uid, "실패 — " + String(e).slice(0, 80));
    return j({ ok: false, id, error: String(e).slice(0, 120) }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const op = String(body?.op || "");

  // ── 워커 경로(x-worker-key) ──
  if ((req.headers.get("x-worker-key") || "") === WORKER_KEY && WORKER_KEY) {
    if (op === "gcaps") {   // 🔬 captionClips 배치 호출 원문 진단(워커키 보호)
      const clips = (Array.isArray(body.clips) ? body.clips : []).slice(0, 15);
      try {
        const parts: any[] = [{ text: "각 이미지가 어떤 장면인지 한 줄씩, 이미지 개수 길이의 JSON 배열로만." }];
        for (const c of clips) {
          const res = await fetch(String(c.thumb));
          if (!res.ok) { parts.push({ text: `(fetch ${res.status})` }); continue; }
          const b = new Uint8Array(await res.arrayBuffer());
          let bin = ""; const CH = 0x8000;
          for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode(...b.subarray(i, i + CH));
          parts.push({ inlineData: { mimeType: "image/jpeg", data: btoa(bin) } });
        }
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } } }),
        });
        const t = await r.text();
        return j({ n: parts.length - 1, status: r.status, out: t.slice(0, 900) });
      } catch (e) { return j({ ex: String(e).slice(0, 300) }); }
    }
    if (op === "gvision") {   // 🔬 Gemini 비전 단건 진단(워커키 보호)
      try {
        const res = await fetch(String(body.img || "https://cdn.galla.im/test/buwon/t8554.jpg"));
        const b = new Uint8Array(await res.arrayBuffer());
        let bin = ""; const CH = 0x8000;
        for (let i = 0; i < b.length; i += CH) bin += String.fromCharCode(...b.subarray(i, i + CH));
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: "이 이미지 뭐야 한 줄로" }, { inlineData: { mimeType: "image/jpeg", data: btoa(bin) } }] }], generationConfig: { maxOutputTokens: 100 } }),
        });
        const d = await r.json().catch(() => null);
        return j({ img_fetch: res.status, bytes: b.length, status: r.status, out: JSON.stringify(d).slice(0, 800) });
      } catch (e) { return j({ ex: String(e).slice(0, 300) }); }
    }
    if (op === "gmodels") {   // 🔬 Gemini 모델 목록(워커키 보호)
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}&pageSize=50`);
      const d = await r.json().catch(() => null);
      return j({ status: r.status, models: (d?.models || []).map((m: any) => m.name) });
    }
    if (op === "probe") {   // 🔬 진단용 — OpenAI TTS/비전 상태를 원문 그대로(워커키 보호)
      const out: Record<string, unknown> = { openai_key: !!OPENAI_KEY };
      try {
        const r = await fetch("https://api.openai.com/v1/audio/speech", {
          method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini-tts", voice: "ash", input: "테스트", response_format: "mp3" }),
        });
        out.tts_status = r.status;
        if (!r.ok) out.tts_err = (await r.text()).slice(0, 300);
      } catch (e) { out.tts_ex = String(e).slice(0, 200); }
      try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 20, messages: [{ role: "user", content: [{ type: "text", text: "이 이미지 뭐야 한 단어로" }, { type: "image_url", image_url: { url: String(body.img || "https://cdn.galla.im/test/buwon/t8554.jpg"), detail: "low" } }] }] }),
        });
        out.vision_status = r.status;
        const d = await r.json().catch(() => null);
        out.vision_out = r.ok ? d?.choices?.[0]?.message?.content : JSON.stringify(d).slice(0, 300);
      } catch (e) { out.vision_ex = String(e).slice(0, 200); }
      return j(out);
    }
    if (op === "pick") {
      const { data: rows } = await sb.from("agent_jobs").select("id,user_id,inputs,artifacts").eq("state", "render_queued").order("created_at").limit(1);
      const job = rows?.[0];
      if (!job) return j({ ok: true, job: null });
      const { data: claimed } = await sb.from("agent_jobs").update({ state: "rendering", updated_at: new Date().toISOString() })
        .eq("id", job.id).eq("state", "render_queued").select("id").single();
      if (!claimed) return j({ ok: true, job: null });   // 다른 워커가 선점
      const a = job.artifacts as any;
      return j({ ok: true, job: { id: job.id, user_id: job.user_id, spec: {
        segments: a.timeline, voice: (job.inputs as any).voice_url, subtitles: a.subtitles,
        voice_tempo: Number(a.voice_tempo) || 1, width: 1080, height: 1920, fps: 30 } } });
    }
    if (op === "progress") { const { data } = await sb.from("agent_jobs").select("user_id").eq("id", body.id).single();
      if (data) await pushProgress(body.id, data.user_id, String(body.msg || "").slice(0, 120)); return j({ ok: true }); }
    if (op === "presign") {
      const { data } = await sb.from("agent_jobs").select("user_id").eq("id", body.id).single();
      if (!data) return j({ error: "no_job" }, 404);
      const key = `videos/${data.user_id}/reel-${body.id}.mp4`;
      const url = new URL(`https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`);
      url.searchParams.set("X-Amz-Expires", "3600");
      const signed = await r2.sign(new Request(url, { method: "PUT", headers: { "content-type": "video/mp4" } }), { aws: { signQuery: true } });
      return j({ ok: true, url: signed.url, key, headers: { "content-type": "video/mp4" } });
    }
    if (op === "done") {
      const { data } = await sb.from("agent_jobs").select("user_id,artifacts").eq("id", body.id).single();
      if (!data) return j({ error: "no_job" }, 404);
      const videoUrl = `${R2_PUBLIC_URL}/${String(body.key)}`;
      await setJob(body.id, { state: "done", artifacts: { ...(data.artifacts as any), video_url: videoUrl } });
      await pushProgress(body.id, data.user_id, "완성!");
      return j({ ok: true, video_url: videoUrl });
    }
    if (op === "fail") {
      const { data } = await sb.from("agent_jobs").select("user_id").eq("id", body.id).single();
      await setJob(body.id, { state: "failed", error: String(body.error || "").slice(0, 300) });
      if (data) await pushProgress(body.id, data.user_id, "렌더 실패");
      return j({ ok: true });
    }
    return j({ error: "bad_op" }, 400);
  }

  // ── 유저 경로(JWT) ──
  const auth = req.headers.get("Authorization") || "";
  const { data: u } = await sb.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (!u?.user) return j({ error: "auth" }, 401);
  const uid = u.user.id;

  if (op === "create") return await runCreate(uid, body);
  if (op === "status") {
    const { data } = await sb.from("agent_jobs").select("id,state,artifacts,progress,error,created_at").eq("id", String(body.id)).eq("user_id", uid).single();
    if (!data) return j({ error: "no_job" }, 404);
    return j({ ok: true, job: data });
  }
  if (op === "list") {
    const { data } = await sb.from("agent_jobs").select("id,state,created_at,artifacts").eq("user_id", uid).order("created_at", { ascending: false }).limit(10);
    return j({ ok: true, jobs: data || [] });
  }
  return j({ error: "bad_op" }, 400);
});
