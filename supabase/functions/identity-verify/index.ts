// 📱 휴대폰 본인인증 확인(포트원 V2) — 수익화(출금) 3단계 관문(26.9.18 사장님: 단계별 가입).
//
// 흐름: 앱이 PortOne.requestIdentityVerification 으로 인증창을 띄운다 → 끝나면 identityVerificationId 를 여기로.
//       여기서 **포트원 API 에 직접 되물어** VERIFIED 인지 확인한 뒤에만 user_profiles 에 적는다.
//       (클라가 보낸 이름·번호는 믿지 않는다 — 결제 웹훅과 같은 원칙)
// 저장: phone_verified·phone·real_name·ci·identity_verified_at. ci 는 유니크 인덱스 — 같은 사람이 여러 계정 인증 불가.
// 필요: PORTONE_API_SECRET(이미 결제용으로 있음) + 포트원 콘솔의 본인인증 채널(다날 등) — 채널 키는 앱 설정(js/verify-phone.js).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PORTONE_API = "https://api.portone.io";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const auth = req.headers.get("authorization") || "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return j({ ok: false, reason: "auth" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const id = String(body?.identityVerificationId || "").trim();
  if (!/^[A-Za-z0-9_\-]{6,80}$/.test(id)) return j({ ok: false, reason: "bad_id" }, 400);
  /* 인증 id 는 앱이 'galla-iv-<uid 앞 8자>-…' 로 만든다 — 남의 인증 결과를 가져다 붙이는 걸 막는 1차 가드 */
  if (!id.startsWith("galla-iv-" + uid.slice(0, 8))) return j({ ok: false, reason: "not_mine" }, 403);

  const key = Deno.env.get("PORTONE_API_SECRET");
  if (!key) return j({ ok: false, reason: "not_configured" }, 503);
  const r = await fetch(`${PORTONE_API}/identity-verifications/${encodeURIComponent(id)}`, {
    headers: { Authorization: `PortOne ${key}` },
  });
  if (!r.ok) return j({ ok: false, reason: "lookup_" + r.status }, 502);
  const iv = await r.json();
  if (iv?.status !== "VERIFIED") return j({ ok: false, reason: "not_verified", status: iv?.status || null });

  const c = iv.verifiedCustomer || {};
  const phone = String(c.phoneNumber || "").replace(/\D/g, "");
  const name = String(c.name || "").trim();
  const ci = String(c.ci || "").trim() || null;
  const birth = String(c.birthDate || "");   // YYYY-MM-DD
  if (!phone) return j({ ok: false, reason: "no_phone" });
  if (birth) {
    const y = parseInt(birth.slice(0, 4), 10);
    if (y && new Date().getFullYear() - y < 14) return j({ ok: false, reason: "age14" });
  }

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await admin.from("user_profiles").update({
    phone_verified: true, phone, real_name: name || null, ci,
    identity_verified_at: new Date().toISOString(),
  }).eq("user_id", uid);
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return j({ ok: false, reason: "ci_taken" });
    return j({ ok: false, reason: "save" }, 500);
  }
  await admin.from("users").update({ phone }).eq("id", uid);
  return j({ ok: true, phone_tail: phone.slice(-4) });
});
