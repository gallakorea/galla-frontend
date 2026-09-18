// 📱 출금 전 휴대폰 확인 — 문자 인증번호(26.9.18 사장님: 네이버·카카오 동의는 복잡 → 문자.
//    출금은 20만원 이상부터라 그때는 이미 수익이 난 사람이다 — 건당 10원대 문자비는 감당된다).
//
//   POST {action:"send",  phone}        → 6자리 번호 문자 발송(5분 유효)
//   POST {action:"check", phone, code}  → 맞으면 user_profiles.phone_verified = true
//
// 남용 방지: 한 사람 1시간 5통 · 한 번호 하루 5통 · 번호당 오답 5번이면 그 번호 폐기 · 60초 안 재발송 금지.
// 한 번호 = 한 계정(user_profiles_phone_verified_uniq) — 이미 다른 계정이 확인한 번호면 보내지도 않는다.
// 발송 = 솔라피(SOLAPI_API_KEY·SOLAPI_API_SECRET·SOLAPI_SENDER, 발신번호는 솔라피에 사전 등록된 번호).
//        키가 없으면 not_configured — 화면은 '준비 중'.
// 코드는 SHA-256(코드+uid+번호+비밀값) 해시로만 저장한다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const KEY = Deno.env.get("SOLAPI_API_KEY") || "";
const SECRET = Deno.env.get("SOLAPI_API_SECRET") || "";
const SENDER = (Deno.env.get("SOLAPI_SENDER") || "").replace(/\D/g, "");
const PEPPER = Deno.env.get("PV_STATE_SECRET") || "galla";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function sha(s: string) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
async function hmacHex(key: string, s: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(s)));
}
function normPhone(s: string) {
  let d = String(s || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+82")) d = "0" + d.slice(3);
  d = d.replace(/\D/g, "");
  return /^01\d{8,9}$/.test(d) ? d : "";
}

async function sendSms(to: string, text: string) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const sig = await hmacHex(SECRET, date + salt);
  const r = await fetch("https://api.solapi.com/messages/v4/send", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `HMAC-SHA256 apiKey=${KEY}, date=${date}, salt=${salt}, signature=${sig}`,
    },
    body: JSON.stringify({ message: { to, from: SENDER, text } }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("[sms-verify] solapi", r.status, t.slice(0, 300));
    return false;
  }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const userClient = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("authorization") || "" } },
  });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return j({ ok: false, reason: "auth" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const phone = normPhone(body?.phone);
  if (!phone) return j({ ok: false, reason: "bad_phone" });
  const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  /* 이미 다른 계정이 확인한 번호? */
  const { data: taken } = await admin.from("user_profiles").select("user_id")
    .eq("phone", phone).eq("phone_verified", true).neq("user_id", uid).limit(1);
  if (taken && taken.length) return j({ ok: false, reason: "phone_taken" });

  if (body?.action === "send") {
    if (!KEY || !SECRET || !SENDER) return j({ ok: false, reason: "not_configured" });   // 200 — invoke 는 비2xx면 본문을 버려 화면이 '준비 중'을 못 띄운다
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86400_000).toISOString();
    const { data: mine } = await admin.from("phone_otps").select("created_at").eq("user_id", uid)
      .gte("created_at", hourAgo).order("created_at", { ascending: false });
    if ((mine || []).length >= 5) return j({ ok: false, reason: "too_many" });
    if (mine && mine[0] && Date.now() - new Date(mine[0].created_at).getTime() < 60_000) return j({ ok: false, reason: "wait", wait: 60 });
    const { count: perPhone } = await admin.from("phone_otps").select("id", { count: "exact", head: true })
      .eq("phone", phone).gte("created_at", dayAgo);
    if ((perPhone || 0) >= 5) return j({ ok: false, reason: "too_many" });

    const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
    const { error } = await admin.from("phone_otps").insert({
      user_id: uid, phone, code_hash: await sha(code + uid + phone + PEPPER),
      expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
    if (error) return j({ ok: false, reason: "save" });
    const sent = await sendSms(phone, `[갈라] 인증번호 ${code} — 5분 안에 입력해 주세요. 타인에게 알려주지 마세요.`);
    if (!sent) return j({ ok: false, reason: "send_fail" });
    return j({ ok: true, ttl: 300 });
  }

  if (body?.action === "check") {
    const code = String(body?.code || "").replace(/\D/g, "");
    if (code.length !== 6) return j({ ok: false, reason: "bad_code" });
    const { data: rows } = await admin.from("phone_otps").select("id, code_hash, attempts, expires_at, used_at")
      .eq("user_id", uid).eq("phone", phone).is("used_at", null).order("created_at", { ascending: false }).limit(1);
    const o = rows && rows[0];
    if (!o) return j({ ok: false, reason: "no_code" });
    if (new Date(o.expires_at).getTime() < Date.now()) return j({ ok: false, reason: "expired" });
    if (o.attempts >= 5) return j({ ok: false, reason: "too_many" });
    if ((await sha(code + uid + phone + PEPPER)) !== o.code_hash) {
      await admin.from("phone_otps").update({ attempts: o.attempts + 1 }).eq("id", o.id);
      return j({ ok: false, reason: "wrong", left: Math.max(0, 4 - o.attempts) });
    }
    await admin.from("phone_otps").update({ used_at: new Date().toISOString() }).eq("id", o.id);
    const { error } = await admin.from("user_profiles").update({
      phone_verified: true, phone, identity_verified_at: new Date().toISOString(),
    }).eq("user_id", uid);
    if (error) return j({ ok: false, reason: /duplicate|unique/i.test(error.message) ? "phone_taken" : "save" });
    await admin.from("users").update({ phone }).eq("id", uid);
    return j({ ok: true });
  }

  return j({ ok: false, reason: "action" }, 400);
});
