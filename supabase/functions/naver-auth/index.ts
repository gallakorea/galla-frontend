/* 🟢 naver-auth — 네이버 로그인(커스텀). Supabase는 네이버를 기본 지원 안 함 →
   프론트가 네이버 인가 code를 받아 이 함수로 보내면:
   1) code → 네이버 access token 교환
   2) 네이버 프로필(id/email/nickname/이미지) 조회
   3) Supabase 유저 find-or-create (admin) — 네이버 id를 안정 식별자로
   4) magiclink 발급 → token_hash 반환 → 프론트가 verifyOtp로 세션 확립
   신규면 handle_new_user 트리거가 프로필 생성(닉네임 null) → 프론트 온보딩이 닉/약관 받음.

   ⚠️ env 필요(사장님 발급 후 설정): NAVER_CLIENT_ID, NAVER_CLIENT_SECRET.
   verify_jwt=false (로그인 전 호출) — 대신 네이버 code 검증이 게이트. */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const NAVER_ID = Deno.env.get("NAVER_CLIENT_ID") || "";
const NAVER_SECRET = Deno.env.get("NAVER_CLIENT_SECRET") || "";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (!NAVER_ID || !NAVER_SECRET) return j({ error: "naver_not_configured" }, 503);

  let body: { action?: string; code?: string; state?: string; redirect_uri?: string; reprompt?: boolean };
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }

  // 🔗 1단계: 인가 URL 발급 — client_id를 프론트에 박지 않기 위해 서버가 만들어 준다.
  //    state는 CSRF 방어용(프론트가 sessionStorage에 저장했다가 콜백에서 대조).
  if (body.action === "authorize") {
    const redirect = String(body.redirect_uri || "");
    if (!/^https?:\/\//.test(redirect)) return j({ error: "redirect_uri required" }, 400);
    const state = crypto.randomUUID().replace(/-/g, "");
    // auth_type=reprompt — 이미 연동한 유저에게 '동의 항목이 늘었을 때' 재동의를 강제한다.
    // (네이버는 기존 연동자에게 새 scope 동의를 자동으로 다시 묻지 않아 이메일이 계속 안 넘어옴)
    const url = "https://nid.naver.com/oauth2.0/authorize?response_type=code"
      + `&client_id=${encodeURIComponent(NAVER_ID)}`
      + `&redirect_uri=${encodeURIComponent(redirect)}`
      + `&state=${state}`
      + (body.reprompt ? "&auth_type=reprompt" : "");
    return j({ ok: true, url, state });
  }

  const { code, state } = body;
  if (!code || !state) return j({ error: "code/state required" }, 400);

  try {
    // 1) code → access token
    const tokRes = await fetch(
      "https://nid.naver.com/oauth2.0/token?grant_type=authorization_code" +
      `&client_id=${encodeURIComponent(NAVER_ID)}&client_secret=${encodeURIComponent(NAVER_SECRET)}` +
      `&code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    ).then((r) => r.json());
    if (!tokRes.access_token) return j({ error: "naver_token", detail: tokRes.error_description || tokRes.error }, 401);

    // 2) 프로필
    const me = await fetch("https://openapi.naver.com/v1/nid/me", {
      headers: { Authorization: `Bearer ${tokRes.access_token}` },
    }).then((r) => r.json());
    const p = me?.response;
    if (!p?.id) return j({ error: "naver_profile" }, 401);

    // 이메일: 네이버가 주면 진짜, 안 주면 합성(우리 도메인). 사람 식별은 아래 naver id가 담당.
    const realEmail = p.email ? String(p.email) : null;
    const email = realEmail || `naver_${p.id}@galla.social`;
    const naverUid = String(p.id);

    // 3) find-or-create — ①네이버 id(불변) ②이메일 순으로 찾는다.
    //    이메일만 보면 '이메일 권한을 나중에 켠 순간' 같은 사람이 새 계정으로 갈라진다(1인 1계정 위반).
    let isNew = false;
    let userId: string | null = null;
    {
      const { data: byId } = await sb.rpc("social_identity_uid", { p_provider: "naver", p_uid: naverUid });
      userId = (byId as string | null) ?? null;
    }
    if (!userId) {
      const { data: byEmail } = await sb.rpc("auth_uid_by_email", { p_email: email });
      userId = (byEmail as string | null) ?? null;
    }
    if (!userId) {
      const created = await sb.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { provider_naver_id: naverUid, avatar_url: p.profile_image || null, full_name: p.nickname || null },
      });
      userId = created.data?.user?.id ?? null;
      isNew = !!created.data?.user;
      if (!userId) {   // 동시 로그인 경합
        const { data: again } = await sb.rpc("auth_uid_by_email", { p_email: email });
        userId = (again as string | null) ?? null;
      }
    }
    if (!userId) return j({ error: "user_upsert" }, 500);

    // 네이버 id ↔ 유저 매핑 고정(다음 로그인부터 이메일과 무관하게 이 사람을 찾는다)
    await sb.rpc("social_identity_link", { p_provider: "naver", p_uid: naverUid, p_user: userId });

    // 🔁 합성 이메일 → 진짜 이메일 승격: 나중에 이메일 권한을 켜면 계정을 새로 만들지 않고 기존 계정을 갱신
    if (realEmail) {
      try {
        const { data: cur } = await sb.auth.admin.getUserById(userId);
        const curEmail = cur?.user?.email || "";
        if (curEmail.endsWith("@galla.social") && curEmail !== realEmail) {
          const { data: taken } = await sb.rpc("auth_uid_by_email", { p_email: realEmail });
          // 진짜 이메일이 아직 아무에게도 없을 때만 승격(있으면 계정 병합 문제라 건드리지 않음)
          if (!taken) await sb.auth.admin.updateUserById(userId, { email: realEmail, email_confirm: true });
        }
      } catch { /* 승격 실패해도 로그인은 진행 */ }
    }

    // 4) magiclink 발급 → token_hash를 프론트로 (verifyOtp로 세션 확립)
    //    ⚠️ 이메일 승격이 일어났을 수 있으니 '지금 계정의 이메일'로 발급해야 한다(옛 주소로 내면 링크 무효).
    let loginEmail = email;
    try {
      const { data: fresh } = await sb.auth.admin.getUserById(userId);
      if (fresh?.user?.email) loginEmail = fresh.user.email;
    } catch { /* 조회 실패 시 원래 값 */ }
    const link = await sb.auth.admin.generateLink({ type: "magiclink", email: loginEmail });
    const th = (link.data as any)?.properties?.hashed_token;
    if (!th) return j({ error: "link" }, 500);

    return j({ ok: true, email: loginEmail, token_hash: th, is_new: isNew });
  } catch (e) {
    return j({ error: "server", detail: String((e as Error).message) }, 500);
  }
});
