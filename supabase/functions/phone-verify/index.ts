// 📱 휴대폰 확인 — 네이버·카카오 계정에 등록된(그쪽에서 인증한) 번호를 받아 온다. 무료.
//    (26.9.18 사장님: 「카카오 네이버 무료로 먼저 붙여」 — 문자·본인인증은 건당 비용이라 뒤로)
//
// 흐름(웹·앱 같음):
//   ① 앱(로그인 상태) → POST {action:"authorize", provider, return:"web"|"app"} → 동의 화면 주소
//   ② 네이버/카카오 동의 → 이 함수로 GET 콜백(?code&state)  ← 콘솔에 이 주소를 Callback/Redirect URI 로 등록
//   ③ 여기서 code 교환 → 프로필에서 번호·이름 → user_profiles 저장 → 결과 화면으로 302
//      웹: https://galla.im/withdraw.html?pv=ok|fail   앱: im.galla.app://verify-done?pv=…
// state = uid·provider·만료·return 을 HMAC 으로 서명 — 콜백은 로그인 헤더가 없으니 누구 것인지를 state 가 증명한다.
// 한 번호 = 한 계정(user_profiles_phone_verified_uniq). 이름은 real_name 에(송금 때 예금주 대조).
//
// 필요한 설정(사장님 콘솔):
//   네이버 개발자센터 → 네이버 로그인 → 제공 정보 「휴대전화번호」「이름」 + Callback URL 에 CB 추가
//   카카오 개발자 → 비즈 앱 전환 → 동의항목 「전화번호」「이름」 + Redirect URI 에 CB 추가
//   env: NAVER_CLIENT_ID·NAVER_CLIENT_SECRET(있음), KAKAO_CLIENT_ID, (KAKAO_CLIENT_SECRET 쓰면), PV_STATE_SECRET

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const CB = `${SB_URL}/functions/v1/phone-verify`;
const SECRET = Deno.env.get("PV_STATE_SECRET") || "";
const NAVER_ID = Deno.env.get("NAVER_CLIENT_ID") || "";
const NAVER_SECRET = Deno.env.get("NAVER_CLIENT_SECRET") || "";
const KAKAO_ID = Deno.env.get("KAKAO_CLIENT_ID") || "";
const KAKAO_SECRET = Deno.env.get("KAKAO_CLIENT_SECRET") || "";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

const enc = new TextEncoder();
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function hmac(s: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(s))));
}
async function makeState(uid: string, prov: string, ret: string) {
  const body = [uid, prov, ret, Date.now() + 10 * 60_000, crypto.randomUUID().slice(0, 8)].join(".");
  return b64u(enc.encode(body)) + "." + (await hmac(body));
}
async function readState(st: string) {
  const [p, sig] = String(st || "").split(".");
  if (!p || !sig) return null;
  let body = "";
  try { body = atob(p.replace(/-/g, "+").replace(/_/g, "/")); } catch { return null; }
  if ((await hmac(body)) !== sig) return null;
  const [uid, prov, ret, exp] = body.split(".");
  if (!uid || Date.now() > Number(exp)) return null;
  return { uid, prov, ret };
}

function normPhone(s: string) {
  let d = String(s || "").replace(/[^\d+]/g, "");
  if (d.startsWith("+82")) d = "0" + d.slice(3);
  d = d.replace(/\D/g, "");
  return /^01\d{8,9}$/.test(d) ? d : "";
}

function done(ret: string, pv: string, reason = "") {
  const q = "pv=" + pv + (reason ? "&r=" + encodeURIComponent(reason) : "");
  const to = ret === "app" ? "im.galla.app://verify-done?" + q : "https://galla.im/withdraw.html?" + q;
  return new Response(null, { status: 302, headers: { Location: to } });
}

async function fetchNaver(code: string, state: string) {
  const t = await fetch("https://nid.naver.com/oauth2.0/token?" + new URLSearchParams({
    grant_type: "authorization_code", client_id: NAVER_ID, client_secret: NAVER_SECRET, code, state,
  })).then((r) => r.json());
  if (!t?.access_token) return { err: "token" };
  const me = await fetch("https://openapi.naver.com/v1/nid/me", { headers: { Authorization: "Bearer " + t.access_token } }).then((r) => r.json());
  const r = me?.response || {};
  return { phone: normPhone(r.mobile || r.mobile_e164 || ""), name: String(r.name || "").trim() };
}
async function fetchKakao(code: string) {
  const form: Record<string, string> = { grant_type: "authorization_code", client_id: KAKAO_ID, redirect_uri: CB, code };
  if (KAKAO_SECRET) form.client_secret = KAKAO_SECRET;
  const t = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" }, body: new URLSearchParams(form),
  }).then((r) => r.json());
  if (!t?.access_token) return { err: "token" };
  const me = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: "Bearer " + t.access_token } }).then((r) => r.json());
  const a = me?.kakao_account || {};
  return { phone: normPhone(a.phone_number || ""), name: String(a.name || "").trim() };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!SECRET) return j({ ok: false, reason: "not_configured" }, 503);
  const url = new URL(req.url);

  /* ② 콜백(GET) — 네이버·카카오가 여기로 돌려보낸다 */
  if (req.method === "GET") {
    const st = await readState(url.searchParams.get("state") || "");
    if (!st) return done("web", "fail", "state");
    const code = url.searchParams.get("code") || "";
    if (!code) return done(st.ret, "fail", url.searchParams.get("error") || "cancel");
    const got = st.prov === "naver" ? await fetchNaver(code, url.searchParams.get("state") || "") : await fetchKakao(code);
    if ((got as any).err) return done(st.ret, "fail", "token");
    const phone = (got as any).phone as string, name = (got as any).name as string;
    if (!phone) return done(st.ret, "fail", "no_phone");   // 동의 안 했거나 콘솔 항목 미설정
    const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { error } = await admin.from("user_profiles").update({
      phone_verified: true, phone, real_name: name || null, identity_verified_at: new Date().toISOString(),
    }).eq("user_id", st.uid);
    if (error) return done(st.ret, "fail", /duplicate|unique/i.test(error.message) ? "phone_taken" : "save");
    await admin.from("users").update({ phone }).eq("id", st.uid);
    return done(st.ret, "ok");
  }

  /* ① 동의 화면 주소 발급(POST, 로그인 필요) */
  const userClient = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("authorization") || "" } },
  });
  const { data: u } = await userClient.auth.getUser();
  const uid = u?.user?.id;
  if (!uid) return j({ ok: false, reason: "auth" }, 401);
  let body: any = {};
  try { body = await req.json(); } catch (_) {}
  const prov = body?.provider === "kakao" ? "kakao" : body?.provider === "naver" ? "naver" : "";
  const ret = body?.return === "app" ? "app" : "web";
  if (!prov) return j({ ok: false, reason: "provider" }, 400);
  if (prov === "naver" && !(NAVER_ID && NAVER_SECRET)) return j({ ok: false, reason: "naver_not_configured" }, 503);
  if (prov === "kakao" && !KAKAO_ID) return j({ ok: false, reason: "kakao_not_configured" }, 503);
  const state = await makeState(uid, prov, ret);
  const auth = prov === "naver"
    ? "https://nid.naver.com/oauth2.0/authorize?" + new URLSearchParams({
        response_type: "code", client_id: NAVER_ID, redirect_uri: CB, state, auth_type: "reprompt" })
    : "https://kauth.kakao.com/oauth/authorize?" + new URLSearchParams({
        response_type: "code", client_id: KAKAO_ID, redirect_uri: CB, state, scope: "phone_number,name" });
  return j({ ok: true, url: auth });
});
