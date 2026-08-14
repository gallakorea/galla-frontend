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

// ── 단어 → Vrew식 구절 자막(2~4어절, 실제 완성본 리듬) ──
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
  return subs;
}

// ── 클립 비전 분석: 썸네일 프레임들을 한 번에 보고 클립별 장면 설명 ──
//    1순위 Gemini(이미지는 바이트로 인라인 — 외부 URL fetch를 모델이 못 하므로 서버가 받아서 넣는다),
//    폴백 OpenAI(billing_not_active로 현재 죽어있음), 최후 폴백 "클립 N"(순서 배치로 강등).
let _capDbg = "";   // 🔬 진단: 마지막 캡션 실패 원인(create 응답에 노출)
async function captionClips(clips: any[]): Promise<string[]> {
  _capDbg = "";
  const thumbs = clips.map((c) => c.thumb || (c.kind === "image" ? c.url : null));
  const fallback = clips.map((_, i) => `클립 ${i + 1}`);
  if (!thumbs.some(Boolean)) return fallback;
  const ask = `맛집 릴스 소스 클립들의 대표 프레임이다. 각 이미지가 어떤 장면인지 '아주 짧게(6~14자)' 순서대로, 이미지 개수와 똑같은 길이의 JSON 문자열 배열로만 답해라. 예: ["가게 간판 외관","물냉면 클로즈업","시장 골목"]. 설명 문장 금지, 배열만.`;
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
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEMINI_KEY}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        // ⚠️ Gemini 3.x는 기본 thinking이 maxOutputTokens를 먹어치움(실측: 600 전부 사고에 소진→빈 출력) → 명시적으로 끈다
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } } }),
      });
      const d = await r.json().catch(() => null);
      const txt = d?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      // 정상 파스 → 실패 시 절단 복구(따옴표 문자열만 긁기 — MAX_TOKENS로 배열이 안 닫힌 실사고 대응)
      let arr: string[] = [];
      const m = /\[[\s\S]*\]/.exec(txt);
      try { arr = m ? JSON.parse(m[0]) : []; } catch { arr = []; }
      if (!arr.length) arr = [...txt.matchAll(/"([^"\n]{2,40})"/g)].map((x) => x[1]);
      if (arr.length) {
        const out: string[] = []; let k = 0;
        for (let i = 0; i < clips.length; i++) out.push(thumbs[i] ? String(arr[k++] || `클립 ${i + 1}`) : `클립 ${i + 1}(프레임 없음)`);
        return out;
      }
      _capDbg = `empty s=${r.status} err=${JSON.stringify(d?.error || "").slice(0, 200)} fin=${d?.candidates?.[0]?.finishReason} txt=${txt.slice(0, 120)}`;
      console.error("[reel] gemini vision", _capDbg);
    } catch (e) { _capDbg = "ex " + String(e).slice(0, 200); console.error("[reel] gemini vision ex", _capDbg); }
  }
  if (OPENAI_KEY) {
    try {
      const content: any[] = [{ type: "text", text: ask }];
      for (const t of thumbs) if (t) content.push({ type: "image_url", image_url: { url: t, detail: "low" } });
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o-mini", max_tokens: 500, temperature: 0.2, messages: [{ role: "user", content }] }),
      });
      const d = await r.json();
      const m = /\[[\s\S]*\]/.exec(d?.choices?.[0]?.message?.content || "");
      const arr = m ? JSON.parse(m[0]) : [];
      if (arr.length) {
        const out: string[] = []; let k = 0;
        for (let i = 0; i < clips.length; i++) out.push(thumbs[i] ? String(arr[k++] || `클립 ${i + 1}`) : `클립 ${i + 1}(프레임 없음)`);
        return out;
      }
    } catch { /* 아래 폴백 */ }
  }
  return fallback;
}

// ── AI 내용 매칭: 자막 타임라인 × 클립 장면 → 세그먼트 배치(사장님 확정: 순서 아닌 '내용' 매칭) ──
async function matchTimeline(subs: any[], captions: string[], clips: any[], voiceDur: number): Promise<{ clip: number; start: number; end: number }[] | null> {
  try {
    const sys = `너는 맛집 릴스 편집 PD다. 내레이션 자막 타임라인과 소스 클립 목록을 보고, 각 시간 구간에 '내용이 맞는' 클립을 배치해라.
규칙: ①구간은 0초부터 ${voiceDur.toFixed(1)}초까지 빈틈없이 이어져야 한다 ②구간당 1.5~5초 ③말하는 내용과 장면이 맞는 클립 선택(가게 소개=외관/간판, 메뉴 설명=그 음식 클로즈업, 먹는 얘기=먹방/리액션) ④같은 클립 재사용 가능하되 연속 반복은 피해라 ⑤클립의 길이(dur)를 넘는 구간을 그 클립에 주지 마라.
JSON만 출력: {"segments":[{"clip":클립번호(0부터),"start":초,"end":초},...]}`;
    const user = `내레이션 자막(시각순):\n${subs.map((s: any) => `${s.start.toFixed(1)}s "${s.text}"`).join("\n")}\n\n클립 목록:\n${captions.map((c, i) => `${i}: ${c} (길이 ${Number(clips[i]?.dur || 8).toFixed(1)}s)`).join("\n")}`;
    const r = await fetch(`${LLM_URL}/chat/completions`, {
      method: "POST", headers: { Authorization: `Bearer ${LLM_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: LLM_MODEL, temperature: 0.2, max_tokens: 900, messages: [{ role: "system", content: sys }, { role: "user", content: user }] }),
    });
    const d = await r.json();
    const m = /\{[\s\S]*\}/.exec(d?.choices?.[0]?.message?.content || "");
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
    const subs = chunkWords(stt.words);
    const voiceDur = stt.words[stt.words.length - 1].e + 0.6;

    await pushProgress(id, uid, "클립 장면 분석 중");
    const captions = await captionClips(clips);

    await pushProgress(id, uid, "장면·내레이션 매칭 중");
    let segs = await matchTimeline(subs, captions, clips, voiceDur);
    if (!segs) segs = orderTimeline(clips, voiceDur);
    // 타임라인 무결성 보정: 시간순 정렬 + 빈틈/겹침 제거 + 총합을 음성 길이에 맞춤
    segs.sort((a, b) => a.start - b.start);
    const timeline: { src: string; in: number; dur: number }[] = [];
    let t = 0;
    for (const s of segs) {
      const dur = Math.min(Math.max(0.8, s.end - Math.max(s.start, t)), 6);
      if (t >= voiceDur - 0.05) break;
      const c = clips[s.clip];
      timeline.push({ src: c.url, in: 0, dur: +Math.min(dur, Math.max(1.0, c.dur - 0.1), voiceDur - t).toFixed(2) });
      t += timeline[timeline.length - 1].dur;
    }
    while (t < voiceDur - 0.1 && timeline.length < 30) {   // 매칭이 못 덮은 꼬리는 순서 폴백으로 채움
      const c = clips[timeline.length % clips.length];
      const take = +Math.min(3, Math.max(1.0, c.dur - 0.1), voiceDur - t).toFixed(2);
      timeline.push({ src: c.url, in: 0, dur: take });
      t += take;
    }

    await setJob(id, { state: "render_queued", artifacts: { transcript: stt.text, subtitles: subs, clip_captions: captions, timeline, voice_dur: +voiceDur.toFixed(2) } });
    await pushProgress(id, uid, "렌더 대기열 진입");
    return j({ ok: true, id, state: "render_queued", captions, segments: timeline.length, cap_dbg: _capDbg || undefined });
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
        segments: a.timeline, voice: (job.inputs as any).voice_url, subtitles: a.subtitles, width: 1080, height: 1920, fps: 30 } } });
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
