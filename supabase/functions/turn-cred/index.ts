/* 📡 turn-cred — Cloudflare TURN 단기 자격증명 발급
   왜 서버에서: TURN 키(장기 비밀)는 절대 클라이언트로 내려가면 안 된다.
   여기서 1시간짜리 임시 자격증명만 만들어 준다(만료되면 무용지물).
   최초 1회 TURN 키가 없으면 CF API로 만들어 app_private_kv에 보관한다(부트스트랩).
   CF 토큰에 Calls 권한이 없으면 STUN 전용으로 우아하게 후퇴 — 통화는 여전히 된다. */
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });
const STUN_ONLY = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

let lastErr = "";   // 진단용 — 시크릿 없는 에러 요약만
async function getTurnKey(): Promise<{ key_id: string; api_token: string } | null> {
  // 0) 대시보드에서 직접 만든 TURN 키가 시크릿에 있으면 그걸 쓴다(API 부트스트랩 불필요)
  const envId = Deno.env.get("CF_TURN_KEY_ID"), envTok = Deno.env.get("CF_TURN_API_TOKEN");
  if (envId && envTok) return { key_id: envId.trim(), api_token: envTok.trim() };
  const { data } = await sb.from("app_private_kv").select("v").eq("k", "cf_turn_key").maybeSingle();
  if (data?.v?.key_id) return data.v as { key_id: string; api_token: string };
  // 부트스트랩: TURN 키 생성 시도
  // CF_CALLS_TOKEN(전용, 권장)이 있으면 우선 — 없으면 Stream 토큰으로 시도
  const acc = Deno.env.get("CF_ACCOUNT_ID"), tok = Deno.env.get("CF_CALLS_TOKEN") || Deno.env.get("CF_STREAM_TOKEN");
  if (!acc || !tok) { lastErr = "no env: acc=" + !!acc + " tok=" + !!tok + " calls=" + !!Deno.env.get("CF_CALLS_TOKEN"); return null; }
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/calls/turn_keys`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "galla-voice-turn" }),
    });
    const body = await r.json();
    const uid = body?.result?.uid, key = body?.result?.key;
    if (!body?.success || !uid || !key) {
      lastErr = "cf: " + JSON.stringify(body?.errors || body?.messages || {}).slice(0, 200);
      console.error("[turn] key create failed", lastErr);
      return null;
    }
    const v = { key_id: uid, api_token: key };
    await sb.from("app_private_kv").upsert({ k: "cf_turn_key", v, updated_at: new Date().toISOString() });
    return v;
  } catch (e) { lastErr = "ex: " + String(e).slice(0, 150); console.error("[turn] bootstrap", e); return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  // 진단: TURN 준비 여부만 답한다(자격증명 없음) — anon 허용, 모니터링용
  if (new URL(req.url).searchParams.get("diag")) {
    const key = await getTurnKey();
    // 키가 있으면 발급까지 실제 시험 — 자격증명은 반환하지 않고 성사 여부만
    if (key) {
      const probe: Record<string, unknown> = { idLen: key.key_id.length };
      for (const path of ["credentials/generate-ice-servers", "credentials/generate"]) {
        try {
          const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${key.key_id}/${path}`, {
            method: "POST", headers: { Authorization: `Bearer ${key.api_token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 300 }) });
          let n = 0;
          try { const b = await r.json();
            const arr = Array.isArray(b?.iceServers) ? b.iceServers : (b?.iceServers ? [b.iceServers] : []);
            n = arr.flatMap((x: { urls?: string | string[] }) => x.urls ? [].concat(x.urls as never) : []).length;
          } catch (_) { /* empty */ }
          probe[path] = { status: r.status, servers: n };
        } catch (e) { probe[path] = { ex: String(e).slice(0, 80) }; }
      }
      // 계정 API로 실제 TURN 키 목록 조회(제품 활성화 후엔 될 수 있다) — id 앞 6자만 비교
      let list = null;
      try {
        const acc = Deno.env.get("CF_ACCOUNT_ID"), tok = (Deno.env.get("CF_CALLS_TOKEN") || "").trim();
        const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/calls/turn_keys`, {
          headers: { Authorization: `Bearer ${tok}` } });
        const b = await r.json();
        list = { status: r.status,
                 ids: (b?.result || []).map((k: { uid: string; name?: string }) => ({ id: (k.uid || "").slice(0, 6) + "…", name: k.name })),
                 envId: key.key_id.slice(0, 6) + "…" };
      } catch (e) { list = { ex: String(e).slice(0, 80) }; }
      return j({ turn: true, probe, list });
    }
    let readTest = null;
    if (!key) {
      // 읽기 권한이라도 있는지 구분 — GET이 되면 '편집' 권한만 빠진 것
      try {
        const acc = Deno.env.get("CF_ACCOUNT_ID"), tok = Deno.env.get("CF_CALLS_TOKEN") || Deno.env.get("CF_STREAM_TOKEN");
        const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acc}/calls/turn_keys`, {
          headers: { Authorization: `Bearer ${tok}` } });
        const b = await r.json();
        readTest = { status: r.status, success: b?.success, err: JSON.stringify(b?.errors || {}).slice(0, 150) };
      } catch (e) { readTest = { ex: String(e).slice(0, 100) }; }
    }
    // 토큰 자체가 유효한 CF 토큰인지(값 오염·공백 여부 구분)
    let tokenValid = null;
    if (!key) {
      try {
        const tok = (Deno.env.get("CF_CALLS_TOKEN") || "").trim();
        const r = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
          headers: { Authorization: `Bearer ${tok}` } });
        const b = await r.json();
        tokenValid = { status: r.status, success: b?.success, tokStatus: b?.result?.status || null,
                       rawLen: (Deno.env.get("CF_CALLS_TOKEN") || "").length, trimLen: tok.length };
      } catch (e) { tokenValid = { ex: String(e).slice(0, 100) }; }
    }
    // 토큰이 보는 계정 vs 시크릿의 CF_ACCOUNT_ID 대조(마스킹)
    let accounts = null;
    if (!key) {
      try {
        const tok = (Deno.env.get("CF_CALLS_TOKEN") || "").trim();
        const r = await fetch("https://api.cloudflare.com/client/v4/accounts", {
          headers: { Authorization: `Bearer ${tok}` } });
        const b = await r.json();
        const mask = (x: string) => (x || "").slice(0, 6) + "…";
        accounts = {
          visible: (b?.result || []).map((a: { id: string; name: string }) => ({ id: mask(a.id), name: a.name })),
          envAcc: mask(Deno.env.get("CF_ACCOUNT_ID") || ""),
          match: (b?.result || []).some((a: { id: string }) => a.id === Deno.env.get("CF_ACCOUNT_ID")),
        };
      } catch (e) { accounts = { ex: String(e).slice(0, 100) }; }
    }
    // 계정 ID 후보 대조: CF_ACCOUNT_ID vs CF_STREAM_ACCOUNT — 어느 쪽이 진짜 계정인가
    let accProbe = null;
    if (!key) {
      const tok = (Deno.env.get("CF_CALLS_TOKEN") || "").trim();
      const cand = { CF_ACCOUNT_ID: Deno.env.get("CF_ACCOUNT_ID"), CF_STREAM_ACCOUNT: Deno.env.get("CF_STREAM_ACCOUNT") };
      accProbe = {};
      for (const [name, id] of Object.entries(cand)) {
        if (!id) { accProbe[name] = "unset"; continue; }
        try {
          const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${id}/calls/turn_keys`, {
            headers: { Authorization: `Bearer ${tok}` } });
          accProbe[name] = { status: r.status, len: String(id).length };
        } catch (e) { accProbe[name] = { ex: String(e).slice(0, 80) }; }
      }
    }
    return j({ turn: !!key, err: key ? undefined : lastErr, readTest, tokenValid, accounts, accProbe });
  }
  if (!callerUid(req)) return j({ error: "auth" }, 401);   // 로그인 유저만 — 무료 릴레이 남용 방지
  const key = await getTurnKey();
  if (!key) return j(STUN_ONLY);
  try {
    const r = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${key.key_id}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key.api_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ttl: 3600 }),
      },
    );
    const body = await r.json();
    if (body?.iceServers) {
      const list = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
      return j({ iceServers: [...STUN_ONLY.iceServers, ...list] });
    }
    return j(STUN_ONLY);
  } catch (_) { return j(STUN_ONLY); }
});
