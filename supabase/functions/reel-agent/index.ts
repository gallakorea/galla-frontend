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
async function ttsCacheKey(script: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(script));
  return "tts:" + [...new Uint8Array(buf)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function ttsToR2(uid: string, script: string): Promise<string | null> {
  /* 🔁 같은 대본이면 같은 음성을 재사용 — 음성이 매번 바뀌면 STT 타이밍이 바뀌고 자막·컷이 통째로 달라진다.
     "돌릴 때마다 딴 영상"의 큰 축이었다. */
  const ck = await ttsCacheKey(script);
  try {
    const { data } = await sb.from("clip_analysis").select("analysis").eq("url", ck).maybeSingle();
    const u = (data?.analysis as any)?.url;
    if (typeof u === "string" && /^https?:\/\//.test(u)) return u;
  } catch (_) { /* 캐시 없으면 생성 */ }
  const made = await ttsToR2Inner(uid, script);
  if (made) { try { await sb.from("clip_analysis").upsert([{ url: ck, analysis: { url: made } }], { onConflict: "url" }); } catch (_) {} }
  return made;
}
async function ttsToR2Inner(uid: string, script: string): Promise<string | null> {
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
type ClipInfo = { cap: string; role: string; score: number; key: string; act?: string; shot?: string };
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
    act: String(o?.a || "").slice(0, 12),                // 동작(붓기·자르기·들기…) — 같은 음식이라도 그림이 달라진다
    shot: ["close", "mid", "wide"].includes(String(o?.sh)) ? String(o.sh) : "",
  }));
}
/* 🧠 캐시 — 같은 클립은 항상 같은 판정을 쓴다.
   회차마다 라벨이 "식당 입구"↔"올라가는 계단"으로 바뀌어 계단 컷이 나왔다 안 나왔다 했다(사장님 반복 지적). */
async function loadCachedAnalysis(urls: string[]): Promise<Map<string, ClipInfo>> {
  const out = new Map<string, ClipInfo>();
  try {
    const { data } = await sb.from("clip_analysis").select("url,analysis").in("url", urls);
    for (const r of data || []) out.set(r.url as string, (r as any).analysis as ClipInfo);
  } catch (_) { /* 캐시는 있으면 좋고 없으면 그만 */ }
  return out;
}
async function saveAnalysis(rows: { url: string; analysis: ClipInfo }[]) {
  if (!rows.length) return;
  try { await sb.from("clip_analysis").upsert(rows, { onConflict: "url" }); } catch (_) { /* */ }
}

async function captionClips(clips: any[]): Promise<ClipInfo[]> {
  _capDbg = "";
  const thumbs = clips.map((c) => c.thumb || (c.kind === "image" ? c.url : null));
  const fallback: ClipInfo[] = clips.map((_, i) => ({ cap: `클립 ${i + 1}`, role: "food", score: 3, key: `k${i}` }));
  if (!thumbs.some(Boolean)) return fallback;
  const ask = `맛집 릴스 소스 클립들의 대표 프레임이다. 각 이미지를 순서대로 판정해 JSON 배열로만 답해라(이미지 개수와 같은 길이).
원소 형식: {"c":"장면 6~14자","k":"소재키","r":"food|cook|eat|place|junk","s":1~5,"a":"동작","sh":"close|mid|wide"}
a = 화면에서 벌어지는 동작 한 단어(붓기/비비기/자르기/들기/먹기/걷기/정적 등). 정지된 상차림이면 "정적".
sh = 샷 크기(close=음식 꽉 찬 클로즈업, mid=한 상 정도, wide=공간·거리)
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
/* 🧠 개념 매칭 — 글자만 대조하면 "2층 입구가 좁아서"에 '계단' 컷을 못 붙인다(대본에 '계단'이란 글자가 없다).
   맛집 릴스에서 반복되는 개념 묶음을 두고, 대본 구절과 장면 설명이 같은 묶음을 건드리면 짝으로 본다. */
const CONCEPTS: string[][] = [
  ["입구", "계단", "올라", "2층", "이층", "지나", "좁", "문"],          // 진입(들어가는 길) — '계단' 컷이 붙어야 하는 자리
  ["골목", "시장", "거리", "외관", "건물", "간판", "위치", "역", "동"],   // 거리·외관(위치 소개)
  ["노포", "오래", "전통", "역사", "세월", "기사", "벽", "메뉴판", "내부", "자리", "테이블", "년"],
  ["냉면", "면발", "육수", "물냉", "비빔", "면", "계란", "편육", "슴슴", "동치미"],
  ["빈대떡", "전", "부침", "바삭", "노릇", "기름", "촉촉"],
  ["무침", "제육", "닭", "양념", "매콤", "소스", "식초", "겨자", "비비", "새콤"],
  ["먹", "한입", "젓가락", "리액션", "맛있", "입맛"],
];
const conceptHits = (a: string, b: string) => {
  let n = 0;
  for (const g of CONCEPTS) {
    if (g.some((w) => a.includes(w)) && g.some((w) => b.includes(w))) n++;
  }
  return n;
};
const SUBJ_TABLE: [string, RegExp][] = [
  ["홍보물", /벽면|홍보|방송|기사|인증|액자|상패|현판/],
  ["계단", /계단|올라가/], ["입구", /입구|현관/], ["간판", /간판|외관|건물/], ["거리", /골목|시장|거리/],
  ["빈대떡", /빈대떡|부침/], ["물냉면", /물냉면|육수|계란/], ["비빔냉면", /비빔/], ["무침", /무침|제육/],
  ["내부", /내부|손님|테이블|메뉴판/],
];
const FOOD_GROUPS = [3, 4, 5];   // CONCEPTS 인덱스: 3=냉면류 4=빈대떡류 5=무침류
const groupProfile = (text: string) => CONCEPTS.map((g) => g.filter((w) => text.includes(w)).length);
/* 🍜 음식 종류까지 구분하는 매칭 점수.
   ⚠️ 단순 글자 겹침은 "매콤한 무침에"와 "매콤한 비빔냉면"을 같은 것으로 본다(실사고: 무침 구간에 냉면).
   그룹별로 몇 단어가 겹치는지 세고, 서로 다른 음식 그룹이 주인공이면 감점한다. */
const profileScore = (clipText: string, winText: string) => {
  const a = groupProfile(clipText), b = groupProfile(winText);
  let s = 0;
  for (let g = 0; g < a.length; g++) s += Math.min(a[g], b[g]) * 3;
  const dom = (p: number[]) => FOOD_GROUPS.reduce((best, g) => (p[g] > p[best] ? g : best), FOOD_GROUPS[0]);
  const da = dom(a), db = dom(b);
  if (a[da] > 0 && b[db] > 0 && da !== db) s -= 7;   // 냉면 얘기에 무침 컷 = 오답
  return s;
};
/* 🧠 의미(임베딩) 매칭 — 키워드 규칙의 천장을 넘는다.
   규칙 방식은 "2층 입구가"와 "올라가는 계단"을 못 잇고(글자가 하나도 안 겹친다), 업종이 바뀌면 손으로 단어를 또 넣어야 했다.
   문장과 장면 설명을 같은 의미 공간에 넣고 코사인 유사도로 붙이면 그 두 문제가 함께 사라진다.
   실패하면 기존 규칙(profileScore)으로 조용히 되돌아간다. */
let _embedDbg = "";
async function embedAll(texts: string[]): Promise<number[][] | null> {
  if (!GEMINI_KEY || !texts.length) return null;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:batchEmbedContents?key=${GEMINI_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // ⚠️ taskType은 이 엔드포인트에서 거부된다(실측: "taskType ... is not supported for embedContent")
        requests: texts.map((t) => ({
          model: "models/gemini-embedding-001",
          content: { parts: [{ text: t.slice(0, 500) }] },
        })),
      }),
    });
    const d = await r.json().catch(() => null);
    const vs = (d?.embeddings || []).map((e: any) => e?.values).filter(Array.isArray);
    if (vs.length !== texts.length) { _embedDbg = `embed ${r.status} got=${vs.length}/${texts.length} ${JSON.stringify(d?.error || "").slice(0, 120)}`; return null; }
    return vs;
  } catch (e) { _embedDbg = "embed ex " + String(e).slice(0, 100); return null; }
}
const cosine = (a: number[], b: number[]) => {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
};

/* 🏅 최적 배정(헝가리안 알고리즘) — 탐욕 배정의 근본 한계를 없앤다.
   "강한 짝부터 먼저 가져가기"는 뒤 문장이 앞 문장의 컷을 뺏는 걸 막지 못한다(실사고 반복:
   마지막 문장이 골목 컷을, 다른 문장이 빈대떡 컷을 채감). 전체 조합의 총점을 한 번에 최대화하면
   "누가 먼저 가져가느냐"가 사라지고 전역 최적 배치가 나온다. O(n³)이고 컷은 20개 안팎이라 즉시 끝난다. */
function hungarian(cost: number[][]): number[] {
  const n = cost.length, m = cost[0]?.length || 0;
  if (!n || !m) return new Array(n).fill(-1);
  const INF = 1e9;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0);
  const p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF);
    const used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] > 0 && p[j] <= n) ans[p[j] - 1] = j - 1;
  return ans;
}

/* 🎬 샷 리스트(감독 관점) — 클립을 보기 '전에' 대본만으로 "이 문장엔 어떤 그림이 필요한가"를 정한다.
   자막 조각("속은 촉촉하고요")은 단서가 거의 없어서 글자·의미 매칭만으로는 한계가 있다.
   감독이 콘티를 먼저 그리듯 문장별 요구 샷을 만들어두면, 그 요구문과 장면 설명을 맞추면 되므로 정확해진다. */
async function shotList(script: string, sentences: string[]): Promise<string[] | null> {
  if (!GEMINI_KEY || sentences.length < 2) return null;
  try {
    const sys = `너는 맛집 릴스 감독이다. 아래 내레이션의 각 문장에 '어떤 그림이 필요한지' 한 줄씩 적어라.
- 그 문장을 들을 때 화면에 무엇이 보여야 하는가를 구체적으로(예: "가게 간판과 골목 입구", "제육무침에 소스 붓는 손", "물냉면 육수와 고명 클로즈업").
- 문장이 음식을 말하면 그 음식 이름을 반드시 포함해라.
- 문장이 위치·역사·규칙을 말하면 그에 맞는 공간 샷을 적어라.
JSON 문자열 배열만 출력(문장 개수와 같은 길이).`;
    const user = sentences.map((s, i) => `${i}: ${s}`).join("\n");
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: sys + "\n\n" + user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 900, thinkingConfig: { thinkingBudget: 0 } } }),
    });
    const d = await r.json().catch(() => null);
    const txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    const m = /\[[\s\S]*\]/.exec(txt);
    let arr: string[] = [];
    try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
    if (!arr.length) arr = [...txt.matchAll(/"([^"\n]{4,60})"/g)].map((x) => x[1]);
    return arr.length >= 2 ? arr.map((x) => String(x).slice(0, 80)) : null;
  } catch { return null; }
}

let _matchDbg = "";   // 🔬 진단: 어떤 경로로 구간을 만들었는지 + 구간별 배정(create 응답에 노출)
async function textMatchTimeline(subs: any[], info: ClipInfo[], clips: any[], voiceDur: number, script = "", isSpare: boolean[] = []) {
  _matchDbg = "";
  if (!subs.length || clips.length < 2) { _matchDbg = `skip subs=${subs.length} clips=${clips.length}`; return null; }
  const target = Math.max(2.2, Math.min(3.2, voiceDur / Math.max(6, Math.min(clips.length, 12))));
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
      // 긴 문장은 안에서만 분할(소재는 그대로 유지 — 뒤쪽엔 같은 소재 예비 컷이 붙는다)
      const parts = Math.max(1, Math.min(3, Math.round((end - start) / Math.max(target, 3.2))));
      /* ✂️ 분할 지점은 **반드시 자막 카드 경계에 스냅**한다(균등 시간 분할 금지).
         ⚠️ 실사고: "1960년부터 이어온 평양냉면 노포인데, 2층 입구가 좁아서…" 문장을 7.96초에서 반으로 자르니
            7.36초에 시작한 "2층 입구가"가 앞 조각에 끌려 들어가, 앞 조각이 '계단'으로 판정됐다.
            → 1960년 구간에 계단, 정작 입구 얘기엔 간판이 나갔다(정답표 2·3행 동시 오답).
            말 중간을 자르면 그 조각의 소재가 통째로 오염된다. */
      const bounds: number[] = [start];
      for (let p = 1; p < parts; p++) {
        const ideal = start + (end - start) * p / parts;
        let bt = ideal, bd = Infinity;
        for (const x of subs as any[]) {
          if (x.start <= bounds[p - 1] + 0.6 || x.start >= end - 0.6) continue;
          const d = Math.abs(x.start - ideal);
          if (d < bd) { bd = d; bt = x.start; }
        }
        bounds.push(+bt.toFixed(2));
      }
      bounds.push(end);
      for (let p = 0; p < parts; p++) {
        const ws = +bounds[p].toFixed(2);
        const we = +bounds[p + 1].toFixed(2);
        if (we - ws < 0.6) continue;
        /* ⚠️ 조각마다 '그 순간 실제로 말하는 자막'을 텍스트로 쓴다.
           문장 전체를 세 조각이 공유하면 첫 조각이 그 문장의 짝을 다 가져간다 —
           실사고: "2층 입구가" 자리의 계단 컷이 "1960년부터 이어온 평양냉면" 조각에 붙었다. */
        const spoken = subs.filter((x: any) => x.start >= ws - 0.05 && x.start < we - 0.05).map((x: any) => x.text).join(" ");
        wins.push({ start: ws, end: we, text: spoken.trim() || sent, sent: s, sentText: sent });   // 문장 번호·문장 전체(문장 단위 배분용)
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

  /* 🧠 의미 매칭 준비 — 클립 설명 / 조각 텍스트 / 문장 텍스트를 한 번에 임베딩. */
  const clipTexts = info.map((c) => `맛집 영상 장면: ${c.cap}. 소재: ${c.key}.${c.act ? ` 동작: ${c.act}.` : ""}${c.shot ? ` 샷: ${c.shot}.` : ""}`);
  /* 🎬 샷 리스트를 문장 텍스트에 합쳐서 임베딩 — "속은 촉촉하고요"만으론 못 맞추지만
     "빈대떡 단면과 김이 나는 촉촉한 속살" 같은 요구 샷이 붙으면 정확히 붙는다. */
  const uniqSents = [...new Set(wins.map((w: any) => w.sentText || w.text))];
  const shots = await shotList(script, uniqSents);
  const shotOf = new Map<string, string>();
  if (shots) uniqSents.forEach((s, i) => shotOf.set(s, shots[i] || ""));
  const enrich = (t: string) => {
    const st = shotOf.get(t);
    return st ? `${t} (필요한 그림: ${st})` : t;
  };
  const winTexts = wins.map((w: any) => `내레이션: ${enrich(w.sentText || w.text)} / 지금 말: ${w.text}`);
  const sentTexts = uniqSents.map((t) => `내레이션: ${enrich(t)}`);
  _matchDbg += shots ? " | shotlist:on" : " | shotlist:off";
  const emb = await embedAll([...clipTexts, ...winTexts, ...sentTexts]);
  const eClip = emb ? emb.slice(0, clipTexts.length) : null;
  // ⚠️ 조회 키는 '원문 텍스트'로 둔다(임베딩에 넣는 문장은 샷리스트가 붙어 달라지므로 키로 쓰면 안 된다)
  const eText = new Map<string, number[]>();
  if (emb) {
    wins.forEach((w: any, k: number) => eText.set(w.text, emb[clipTexts.length + k]));
    uniqSents.forEach((t, k) => eText.set(t, emb[clipTexts.length + winTexts.length + k]));
  }
  const simOf = (i: number, text: string) => {
    if (!eClip) return null;
    const v = eText.get(text);
    return v ? cosine(eClip[i], v) : null;
  };
  _matchDbg += emb ? " | embed:on" : ` | embed:off(${_embedDbg})`;

  /* 🏅 최적 배정 — 구간(행) × 클립(열) 점수표를 만들고 헝가리안으로 총점 최대 조합을 한 번에 찾는다.
     점수 = 그 조각이 실제로 말하는 내용과의 의미 유사도(0.62) + 그 문장 전체와의 유사도(0.38)
            + 클립 품질 보너스. 문장 전체 항이 있어 한 문장의 조각들이 같은 소재로 모인다. */
  const sentTextOf = (w: number) => (wins[w] as any).sentText || wins[w].text;
  const scorePair = (w: number, i: number) => {
    const simP = simOf(i, wins[w].text);
    const simS = simOf(i, sentTextOf(w));
    if (simP !== null || simS !== null) {
      /* 🧭 개념 일치 보너스 — "2층 입구가"에는 계단/입구 컷이 반드시 이겨야 한다.
         임베딩만으로는 '평양냉면'이 들어간 문장이 냉면 컷을 다 끌어가 계단이 통째로 빠졌다(실측). */
      const cc = conceptHits(`${info[i].cap} ${info[i].key}`, wins[w].text) * 10;
      return (simP ?? 0) * 78 + (simS ?? 0) * 22 + cc + info[i].score * 0.8 + (foodish(info[i].role) ? 1.5 : 0)
        - (isSpare[i] ? 1.5 : 0);
    }
    // 임베딩 불가 시 규칙 점수로 대체
    const ct = `${info[i].cap} ${info[i].key}`;
    return (sharedBigrams(sigs[i], bigramsOf(wins[w].text)) * 2 + profileScore(ct, wins[w].text)) * 2
      + (sharedBigrams(sigs[i], bigramsOf(sentTextOf(w))) * 2 + profileScore(ct, sentTextOf(w)))
      + info[i].score * 0.8 + (foodish(info[i].role) ? 1.5 : 0) - (isSpare[i] ? 1.5 : 0);
  };
  /* 🎯 배정 — **한 곳에서만 결정한다**(2026-08-15 재설계, docs/reel-matching-redesign.md).
     예전엔 규칙→임베딩→헝가리안→편집장 검수→핀 다섯 겹이 서로 덮어써서, 매칭이 맞아도 화면은 달랐다.
     순서는 하나다: ①그 구간이 '직접 말하는 소재' → ②문장이 말하는 소재 → ③의미 유사도 → ④이웃 승계. */
  const SUBJECTS: [string, RegExp, RegExp][] = [
    // [소재, 대본이 이 소재를 말하는 표현, 클립 설명이 이 소재인 표현]  ※ 구체적인 것부터
    ["홍보물", /백년가게|선정|인증|수상|방송|출연|미슐랭|맛집으로/, /벽면|홍보|방송|기사|인증|액자|상패|현판/],
    ["계단", /계단|올라가|2층|이층/, /계단|올라가/],
    ["입구", /입구|들어가|현관|지나칩/, /입구|현관/],
    ["간판", /간판|외관|건물|노포|년부터|이어온/, /간판|외관|건물/],
    ["거리", /골목|시장|거리|남대문|안쪽/, /골목|시장|거리/],
    ["빈대떡", /빈대떡|부침|바삭|촉촉/, /빈대떡|부침/],
    ["물냉면", /물냉면|육수|편육|슴슴|동치미|계란/, /물냉면|육수|계란/],
    ["비빔냉면", /비빔|양념장/, /비빔/],
    ["무침", /무침|제육|겨자|식초|매콤|소스|비비/, /무침|제육/],
    ["내부", /분위기|자리|손님|테이블/, /내부|손님|테이블|메뉴판/],
  ];
  /* 한 컷이 여러 소재를 겸할 수 있다(외관 컷 = 간판이자 입구).
     ⚠️ 첫 일치 하나만 잡으면(예전 방식) "부원면옥 가게 입구"가 '입구' 전용이 되어,
        "1960년부터 이어온 노포인데"(=간판)가 그 컷을 못 찾고 엉뚱한 내부 컷을 받았다(실측). */
  const clipSubjs = info.map((c) => {
    const t = `${c.cap} ${c.key}`;
    return SUBJECTS.filter(([, , reCap]) => reCap.test(t)).map(([n]) => n);
  });
  const clipSubj = clipSubjs.map((v) => v[0] || "");
  const subjOfText = (t: string) => SUBJECTS.filter(([, reT]) => reT.test(t)).map(([n]) => n);
  const pickBy = (subj: string, text: string) => {
    let best = -1, bs = -Infinity;
    for (let i = 0; i < clips.length; i++) {
      if (used.has(i) || !clipSubjs[i].includes(subj)) continue;
      const sc = (simOf(i, text) ?? 0) * 50 + info[i].score + (foodish(info[i].role) ? 1 : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  };
  for (let w = 0; w < wins.length; w++) {          // ① 그 구간이 직접 말하는 소재
    if (assign[w] >= 0) continue;
    for (const subj of subjOfText(wins[w].text)) {
      const i = pickBy(subj, wins[w].text);
      if (i >= 0) { assign[w] = i; used.add(i); break; }
    }
  }
  for (let w = 0; w < wins.length; w++) {          // ② 문장이 말하는 소재
    if (assign[w] >= 0) continue;
    const st = (wins[w] as any).sentText || wins[w].text;
    for (const subj of subjOfText(st)) {
      const i = pickBy(subj, wins[w].text);
      if (i >= 0) { assign[w] = i; used.add(i); break; }
    }
  }
  /* ②-b 같은 '계열' 대체 — 말한 소재의 컷이 이미 다 쓰였을 때, 아무 컷이나 주지 말고 같은 계열에서 고른다.
     ⚠️ 실사고: 마무리 "남대문 오면 무조건 저장입니다"에서 거리 컷이 도입부에 소진돼 물냉면이 나갔다.
     사장님 지시로 **수미상관(도입부 컷 재사용) 금지** → 재사용 대신 같은 계열의 '아직 안 쓴' 컷으로 채운다. */
  const FAMILY: Record<string, string> = {
    거리: "장소", 간판: "장소", 입구: "장소", 계단: "장소", 내부: "장소", 홍보물: "장소",
    빈대떡: "음식", 물냉면: "음식", 비빔냉면: "음식", 무침: "음식",
  };
  /* 🍜 마무리 컷은 '군침 도는 컷'으로 — 릴스 관습. 마지막은 "저장하세요" 같은 CTA라 화면이 자유롭다.
     여기에 벽·간판을 또 깔면 밋밋하게 끝난다(실측: 벽면 홍보물 다음에 또 벽 가득한 내부 컷). */
  {
    const lw = wins.length - 1;
    if (lw >= 0 && assign[lw] < 0) {
      let best = -1, bs = -Infinity;
      for (let i = 0; i < clips.length; i++) {
        if (used.has(i) || !foodish(info[i].role)) continue;
        const sc = info[i].score + (simOf(i, wins[lw].text) ?? 0) * 20;
        if (sc > bs) { bs = sc; best = i; }
      }
      if (best >= 0) { assign[lw] = best; used.add(best); }
    }
  }
  for (let w = 0; w < wins.length; w++) {
    if (assign[w] >= 0) continue;
    const st = (wins[w] as any).sentText || wins[w].text;
    const fams = new Set([...subjOfText(wins[w].text), ...subjOfText(st)].map((s) => FAMILY[s]).filter(Boolean));
    if (!fams.size) continue;
    let best = -1, bs = -Infinity;
    for (let i = 0; i < clips.length; i++) {
      if (used.has(i) || !fams.has(FAMILY[clipSubj[i]] || "")) continue;
      const sc = (simOf(i, wins[w].text) ?? 0) * 50 + info[i].score;
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0) { assign[w] = best; used.add(best); }
  }
  for (let w = 0; w < wins.length; w++) {          // ③ 의미 유사도(남은 컷 중 최선, 음식 우선)
    if (assign[w] >= 0) continue;
    let best = -1, bs = -Infinity;
    for (let i = 0; i < clips.length; i++) {
      if (used.has(i)) continue;
      const sc = (simOf(i, wins[w].text) ?? 0) * 50 + info[i].score + (foodish(info[i].role) ? 2 : -1);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0) { assign[w] = best; used.add(best); }
  }
  for (let w = 0; w < wins.length; w++) {          // ④ 클립이 모자라면 같은 문장 이웃을 이어 쓴다
    if (assign[w] >= 0) continue;
    const sid = (wins[w] as any).sent;
    let nb = -1;
    for (let k = 0; k < wins.length; k++) if ((wins[k] as any).sent === sid && assign[k] >= 0) { nb = assign[k]; break; }
    assign[w] = nb >= 0 ? nb : (w > 0 ? assign[w - 1] : 0);
  }
  _matchDbg += " | assign:subject-first";


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
    /* 쪼갤지 말지 — 같은 소재의 '다른 앵글'이 있을 때만 쪼갠다.
       대안이 없는데 쪼개면 같은 화면이 두 번 연속 나온다(사장님 지적: "장면이 두 번씩 나온다").
       그럴 땐 한 컷으로 길게 간다 — 사람 편집자도 그렇게 한다. */
    const subjOf2 = (i: number) => {
      const t = `${info[i].cap} ${info[i].key}`;
      const hit = SUBJ_TABLE.find(([, re]) => re.test(t));
      return hit ? hit[0] : "";
    };
    const wantSubj = subjOf2(s.clip);
    const hasAlt = clips.some((_: any, i: number) =>
      i !== s.clip && !usedAll.has(i) && (!wantSubj || subjOf2(i) === wantSubj));
    const parts = hasAlt ? Math.max(1, Math.ceil(span / 3.0)) : 1;   // 릴스 템포: 3초 단위(대안 있을 때만)
    for (let p = 0; p < parts; p++) {
      const st = +(s.start + span * p / parts).toFixed(2);
      const en = +(s.start + span * (p + 1) / parts).toFixed(2);
      let clip = s.clip;
      /* 쪼갠 조각은 **같은 소재의 '다른 앵글'**을 쓴다.
         ⚠️ 같은 클립을 그대로 두면 모든 장면이 두 번씩 연속으로 나온다(실사고: 골목/골목, 계단/계단…).
            반대로 아무 클립이나 고르면 소재가 튄다. 그래서 '같은 소재 + 미사용'만 후보로 둔다. */
      if (p > 0) {
        const subjOf = (i: number) => {
          const t = `${info[i].cap} ${info[i].key}`;
          const hit = SUBJ_TABLE.find(([, re]) => re.test(t));
          return hit ? hit[0] : "";
        };
        const want = subjOf(s.clip);
        let alt = -1, as_ = -Infinity;
        for (let i = 0; i < clips.length; i++) {
          if (usedAll.has(i) || i === s.clip) continue;
          if (want && subjOf(i) !== want) continue;
          const sc = info[i].score + (simOf(i, wins.find((w: any) => w.start <= st && st < w.end)?.text || "") ?? 0) * 20;
          if (sc > as_) { as_ = sc; alt = i; }
        }
        if (alt >= 0) { clip = alt; usedAll.add(alt); }
      }
      if (false) {   // (비활성) 조각마다 '아무' 미사용 클립을 고르던 로직 — 소재가 튀는 원인이었다
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
  // (핀 겹 제거 — 배정 단계가 유일한 결정자다. docs/reel-matching-redesign.md)
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

규칙: ①**0초 첫 컷은 무조건 가장 군침 도는 컷**(food/cook/eat 중 점수 최고) — 훅이다 ②구간은 0초부터 ${voiceDur.toFixed(1)}초까지 빈틈없이, 구간당 1.5~3.5초(총 ${Math.round(voiceDur / 2.6)}컷 안팎 — 릴스는 빠른 전환이 생명) ③내용 연결은 '음식 종류' 수준으로 맞춰라(냉면 얘기=냉면 컷, 빈대떡 얘기=빈대떡 컷) ④같은 클립 반복 금지(모자랄 때만, 연속 금지) ⑤클립 길이(dur) 초과 금지 ⑥점수 낮은 컷은 아예 쓰지 마라(전부 쓸 필요 없다).
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

/* 👀 미리보기 카드 — 컷마다 [썸네일 + 그 순간 내레이션 + 현재 클립]을 클라이언트가 그릴 수 있게 만든다. */
function cutCards(timeline: any[], subs: any[], clips: any[], info: ClipInfo[]) {
  const idxOf = new Map<string, number>(clips.map((c: any, i: number) => [c.url, i]));
  const out: any[] = [];
  let t = 0;
  for (let k = 0; k < timeline.length; k++) {
    const seg = timeline[k];
    const end = t + seg.dur;
    const text = subs.filter((s: any) => s.start >= t - 0.05 && s.start < end - 0.05).map((s: any) => s.text).join(" ");
    const ci = idxOf.get(seg.src) ?? -1;
    out.push({
      cut: k, at: +t.toFixed(1), dur: seg.dur, text: text.trim(),
      clip: ci, thumb: ci >= 0 ? (clips[ci].thumb || null) : null,
      cap: ci >= 0 ? info[ci].cap : "",
    });
    t = end;
  }
  return out;
}
function clipCards(clips: any[], info: ClipInfo[]) {
  return clips.map((c: any, i: number) => ({ clip: i, thumb: c.thumb || null, cap: info[i].cap, role: info[i].role }));
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

  /* ⏱ 무거운 처리는 백그라운드로 — TTS+STT+비전+임베딩+검수를 한 요청에 담으면 엣지 150초 한도를 넘는다(실사고).
     잡 시스템이므로 즉시 id를 돌려주고 상태는 폴링으로 따라가면 된다. */
  const heavy = (async () => {
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
    /* ⚠️ 비전이 죽으면 큐레이션·매칭이 통째로 무력화돼 '아무 컷이나 순서대로'가 된다(실사고).
       조용히 엉터리 영상을 만들지 말고 한 번 더 시도하고, 그래도 안 되면 잡을 실패시킨다. */
    // 캐시된 판정이 있으면 그대로 쓴다(라벨 안정화). 없으면 분석 후 저장.
    const cached = await loadCachedAnalysis(clips.map((c: any) => c.url));
    let info: ClipInfo[];
    if (clips.every((c: any) => cached.has(c.url))) {
      info = clips.map((c: any) => cached.get(c.url)!);
      await pushProgress(id, uid, `클립 분석 재사용(${info.length}컷)`);
    } else {
      info = await captionClips(clips);
      const visionDead = () => info.every((c) => /^클립 \d+/.test(c.cap));
      if (visionDead()) {
        await pushProgress(id, uid, "장면 분석 재시도 중");
        await new Promise((r) => setTimeout(r, 4000));
        info = await captionClips(clips);
        if (visionDead()) throw new Error("vision_failed: " + (_capDbg || "unknown"));
      }
      await saveAnalysis(clips.map((c: any, i: number) => ({ url: c.url, analysis: info[i] })));
    }

    /* 🗑 컷 큐레이션 — 사장님 지적 2건의 해법(“쓸데없는 컷이 초반에 몰림”, “같은 장면 중복 절대 금지”).
       ①junk·저점수 컷은 아예 후보에서 뺀다(전부 쓸 필요 없다)
       ②**소재(key) 중복 제거** — 빈대떡 4컷·냉면 3컷이 있어도 소재당 '최고 점수 한 컷'만 남긴다(파일이 달라도 화면엔 같은 음식이면 중복이다)
       ③place(외관·거리·계단·벽)는 통틀어 최대 2컷 — 초반 몰림의 주범
       ④너무 적게 남으면 단계적으로 완화(완성은 시킨다) */
    const foodish = (r: string) => r === "food" || r === "cook" || r === "eat";
    /* 📄 '읽을거리' 컷(벽면 기사 스크랩·메뉴판·간판 텍스트)은 릴스에서 거의 쓸모없다.
       대본이 그걸 직접 말할 때(예: 백년가게 선정)만 의미가 있으므로 기본적으로 후보에서 제외한다. */
    const READY = ["기사", "스크랩", "메뉴판", "벽면", "신문", "잡지", "안내문", "가격표"];
    const isReadable = (i: number) => READY.some((w) => `${info[i].cap} ${info[i].key}`.includes(w));
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
        const sig = sigOf(i);
        /* ⚠️ 소재 키만 같다고 버리면 안 된다 — 비전이 계단 컷에 key="외관"을 붙여(캡션은 "가게 올라가는 계단")
           간판 컷과 한 소재로 묶여 매번 탈락했다(계단이 끝내 안 나오던 진짜 원인).
           중복 판정은 '캡션이 실제로 비슷한가'로만 한다(빈대떡 2컷·물냉면 3컷은 캡션이 겹쳐 정상 병합된다). */
        if (keptSig.some((s) => shared(sig, s) >= 2)) continue;
        kept.push(i); keptSig.push(sig); keptKeys.add(info[i].key);
      }
      return kept.sort((a, b) => a - b);
    };
    const all = clips.map((_: any, i: number) => i);
    /* 대본 관련성 — 비전 점수가 낮아도 '대본이 직접 말하는 장면'은 살린다.
       ⚠️ 실사고: 계단 컷이 "쓸모 2점"으로 매겨져 점수 필터에서 잘려, "2층 입구가 좁아서" 구간에 냉면이 나왔다. */
    const scriptSig0 = bigramsOf(script);
    const relOf = (i: number) =>
      sharedBigrams(bigramsOf(`${info[i].cap} ${info[i].key}`), scriptSig0) + conceptHits(`${info[i].cap} ${info[i].key}`, script) * 2;
    /* 🏅 예외 — 대본이 수상·방송을 직접 말하면(백년가게 선정된 집…) 벽면 홍보물은 그 순간의 '증거 컷'이다.
       사람 편집자도 그 한 문장에만 붙인다. 그 외에는 종전대로 읽을거리 컷을 통째 버린다. */
    const wantsWall = /백년가게|선정|인증|수상|방송|출연|미슐랭/.test(script);
    let cand = all.filter((i) => info[i].role !== "junk" && (info[i].score >= 3 || relOf(i) >= 2))
      .filter((i) => !isReadable(i) || (wantsWall && info[i].role === "place"));   // 읽을거리 컷(벽면 기사·메뉴판)은 기본 제외 — 사장님 반복 지적
    if (cand.length < 5) cand = all.filter((i) => info[i].role !== "junk");
    if (cand.length < 3) cand = all;
    const foods = dedupGreedy(cand.filter((i) => foodish(info[i].role)));
    /* 맥락샷(place)은 기본 1컷만 — 초반 몰림의 주범이라 대부분 버린다.
       ⚠️ 단, **대본이 그 장면을 직접 말하면 지킨다**: "2층 입구가 좁아서"라고 말하는데 계단 컷을 버려놔서
          그 구간에 냉면이 나오는 사고가 있었다(사장님 지적). 대본 글자와 겹치는 맥락샷은 최대 3컷까지 남긴다. */
    /* ⚠️ 읽을거리 컷(벽면 홍보물)은 일반 맥락샷 정원 싸움에 끼우지 않는다 —
       실사고: 벽면 컷을 살렸더니 place 정원 4를 밀어내 '계단' 컷이 통째로 빠졌다(정답표 3행 오답).
       벽면은 아래에서 정원과 무관하게 따로 한 컷 추가한다. */
    const placeAll = dedupGreedy(cand.filter((i) => info[i].role === "place" && !isReadable(i)))
      .sort((a, b) => info[b].score - info[a].score);
    // 대본이 말하는 장면일수록 먼저 지킨다(점수보다 '대본 관련성' 우선 — 계단 컷이 점수에 밀려 빠지던 문제)
    const placeNamed = placeAll
      .map((i) => ({ i, rel: relOf(i) }))
      .filter((x) => x.rel >= 2)
      .sort((a, b) => b.rel - a.rel || info[b.i].score - info[a.i].score)
      .slice(0, 5).map((x) => x.i);
    const places = placeNamed.length ? [...new Set([...placeNamed, placeAll[0]])].filter((i) => i !== undefined) : placeAll.slice(0, 1);
    if (wantsWall) {   // 수상·방송 문장이 있으면 벽면 홍보물 1컷은 반드시 후보에 남긴다(위 예외와 한 쌍)
      const wall = cand.filter((i) => isReadable(i) && info[i].role === "place")
        .sort((a, b) => info[b].score - info[a].score)[0];
      if (wall !== undefined && !places.includes(wall)) places.push(wall);
    }
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
    /* 매칭 대상 = 본편(소재당 1컷) + 예비(같은 소재 다른 앵글).
       예비를 포함해야 한 문장이 두 컷으로 쪼개질 때 '같은 클립 확대 재사용' 대신 다른 앵글이 붙는다(사장님 지적). */
    const matchIdx = [...keep, ...backups.filter((i) => !keep.includes(i))];
    const matchClips = matchIdx.map((i) => clips[i]);
    const matchInfo = matchIdx.map((i) => info[i]);
    const isSpare = matchIdx.map((i) => !keep.includes(i));
    // 1순위 글자·개념 대조(결정적·정확), 2순위 LLM, 최후 촬영 순서
    let segs = await textMatchTimeline(subs, matchInfo, matchClips, voiceDur, script, isSpare);
    if (!segs) segs = await matchTimeline(subs, matchInfo, matchClips, voiceDur);
    if (!segs) segs = orderTimeline(matchClips, voiceDur);
    /* 타임라인 무결성:
       - 컷 최소 2.2초(깜빡임 방지) — 짧으면 앞 컷에 흡수
       - 큐레이션을 통과한 클립은 각각 한 번씩만(소재 중복은 이미 제거됨)
       - 채울 게 없으면 컷을 늘려서 메운다(같은 장면 재등장보다 낫다) */
    /* 🧱 타임라인 조립 — **매칭 결과를 그대로 따른다(이번 수정의 핵심).**
       ⚠️ 지금까지는 조립부가 자체 판단으로 컷을 쪼개고 다른 클립으로 채워서, 매칭이 "2층 입구가=계단"으로
          정해놔도 화면엔 냉면이 나왔다 — 사장님이 지적한 불일치 전부가 이 원인이었다.
          이제 조립은 재배치를 일절 하지 않는다: 컷 1개 = 매칭 구간 1개, 클립 교체 금지.
          클립이 짧으면 '같은 클립'을 이어 붙여 채운다(붙어 있으므로 중복으로 보이지 않는다). */
    segs.sort((a, b) => a.start - b.start);
    const CUT_MAX = 3.6;
    const fillIdx = matchIdx;
    const fClips = matchClips;
    const fInfo = matchInfo;
    const durOfAll = new Map<string, number>(clips.map((c: any) => [c.url, Number(c.dur) || 8]));
    const timeline: { src: string; in: number; dur: number; role?: string; zoom?: number }[] = [];
    let t = 0;
    for (const sg of segs) {
      const segEnd = Math.min(sg.end, voiceDur);
      let need = +(segEnd - t).toFixed(2);
      if (need <= 0.05) continue;
      const ci = Math.max(0, Math.min(fClips.length - 1, sg.clip));
      const c = fClips[ci];
      const clipDur = Number(c.dur) || 8;
      let off = 0, guard = 0;
      while (need > 0.05 && guard++ < 8) {
        let take = Math.min(need, CUT_MAX, Math.max(0, clipDur - 0.15 - off));
        if (take < 0.5) { off = 0; take = Math.min(need, CUT_MAX, Math.max(0, clipDur - 0.15)); }
        /* 🧷 자투리 흡수 — 남는 0.7초짜리를 굳이 한 컷으로 만들지 않는다.
           ⚠️ 실사고: 4.26초 구간이 3.6+0.66으로 쪼개져 '같은 장면이 두 번 연속' 나왔다(0.66초 깜빡).
              같은 클립을 이어 붙이는 것이므로 흡수해도 화면은 그냥 계속 재생될 뿐이다. */
        const rest = +(need - take).toFixed(2);
        if (rest > 0.05 && rest < 0.9 && clipDur - 0.15 - off - take >= rest) take = +(take + rest).toFixed(2);
        if (take < 0.4) {
          /* ⏱ 남은 자투리를 '버리면' 이후 모든 컷이 그만큼 앞으로 당겨져 대본과 어긋난다(누적 드리프트).
             실측: 이 누락 때문에 영상 총길이가 음성보다 0.2초 짧아지고 뒷부분 매칭이 반 컷씩 밀렸다. */
          if (timeline.length) {
            timeline[timeline.length - 1].dur = +(timeline[timeline.length - 1].dur + need).toFixed(2);
            t += need;
          }
          break;
        }
        timeline.push({
          src: c.url, in: +off.toFixed(2), dur: +take.toFixed(2), role: fInfo[ci]?.role,
          ...(off > 0 ? { zoom: 1.18 } : {}),
        });
        off += take; need = +(need - take).toFixed(2); t += take;
        if (off >= clipDur - 0.3) off = 0;
      }
      t = segEnd;
    }

    /* 🔍 재사용 컷은 '확대'로 다른 그림 만들기(사장님: 쓴 클립은 음식을 확대해서 쓰자).
       같은 파일이 두 번째로 나오면 1.3배, 세 번째부터 1.55배로 크롭 인 → 같은 장면이 반복되는 느낌이 사라진다. */
    {
      const seen = new Map<string, number>();
      for (const seg of timeline as any[]) {
        const n = (seen.get(seg.src) || 0) + 1;
        seen.set(seg.src, n);
        if (n >= 2) seg.zoom = n === 2 ? 1.3 : 1.55;
      }
    }
    // 🔚 1.4초 미만 꼬리 컷은 앞 컷에 흡수(끝에서 깜빡)
    while (timeline.length >= 2 && timeline[timeline.length - 1].dur < 1.4) {
      const tail = timeline.pop()!;
      timeline[timeline.length - 1].dur = +(timeline[timeline.length - 1].dur + tail.dur).toFixed(2);
    }

    /* 👀 미리보기 모드 — 렌더 전에 '컷 목록'을 사람이 보고 2탭으로 바꾼다.
       AI가 아무리 좋아져도 마지막 한두 컷은 취향이다. 여기서 손보면 바로 완성품이 된다. */
    const wantPreview = body?.preview !== false;
    await setJob(id, {
      state: wantPreview ? "preview" : "render_queued",
      artifacts: { transcript: stt.text, subtitles: subs, clip_info: info, pool_info: poolInfo, timeline, voice_dur: +voiceDur.toFixed(2), voice_tempo: tempo },
    });
    if (wantPreview) {
      await pushProgress(id, uid, "미리보기 준비 완료 — 컷 확인하고 바꿔줘");
      return;
    }
    await pushProgress(id, uid, "렌더 대기열 진입");
    return;
  } catch (e) {
    await setJob(id, { state: "failed", error: String(e).slice(0, 200) });
    await pushProgress(id, uid, "실패 — " + String(e).slice(0, 80));
  }
  })();
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(heavy); } catch (_) { /* 로컬 실행 등 */ }
  return j({ ok: true, id, state: "processing" });
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
        segments: a.timeline, voice: (job.inputs as any).voice_url, subtitles: a.subtitles,   // segments[].zoom 포함(재사용 컷 확대)
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

  /* 👀 미리보기 컷 교체 — 사람이 2탭으로 고친다. AI 100%를 기다리는 대신 사람이 즉시 완성시킨다.
     교체 기록(swap_log)은 나중에 "이런 문장엔 이런 컷" 학습 데이터가 된다. */
  if (op === "cuts" || op === "swap" || op === "approve") {
    const { data: job } = await sb.from("agent_jobs").select("id,state,inputs,artifacts").eq("id", String(body.id)).eq("user_id", uid).single();
    if (!job) return j({ error: "no_job" }, 404);
    const a: any = job.artifacts || {};
    const clips: any[] = (job.inputs as any)?.clips || [];
    const info: ClipInfo[] = a.clip_info || [];
    const timeline: any[] = a.timeline || [];

    if (op === "cuts") return j({ ok: true, state: job.state, cuts: cutCards(timeline, a.subtitles || [], clips, info), clips: clipCards(clips, info) });

    if (op === "swap") {
      const k = Number(body.cut), ci = Number(body.clip);
      if (!Number.isInteger(k) || k < 0 || k >= timeline.length) return j({ error: "bad_cut" }, 400);
      if (!Number.isInteger(ci) || ci < 0 || ci >= clips.length) return j({ error: "bad_clip" }, 400);
      const prev = timeline[k].src;
      timeline[k] = { ...timeline[k], src: clips[ci].url, in: 0 };
      // 같은 클립이 다른 자리에도 있으면 이번 컷은 확대해 다른 그림으로
      const dup = timeline.some((s: any, i: number) => i !== k && s.src === clips[ci].url);
      if (dup) timeline[k].zoom = 1.3; else delete timeline[k].zoom;
      const log = Array.isArray(a.swap_log) ? a.swap_log : [];
      log.push({ cut: k, from: prev, to: clips[ci].url, at: new Date().toISOString() });
      await setJob(String(body.id), { artifacts: { ...a, timeline, swap_log: log.slice(-50) } });
      return j({ ok: true, cuts: cutCards(timeline, a.subtitles || [], clips, info) });
    }

    if (op === "approve") {
      if (job.state !== "preview") return j({ error: "not_preview", state: job.state }, 409);
      await setJob(String(body.id), { state: "render_queued" });
      await pushProgress(String(body.id), uid, "렌더 대기열 진입");
      return j({ ok: true, state: "render_queued" });
    }
  }
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
