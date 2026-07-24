/* 🟢 naver-auth — 네이버 로그인(커스텀). Supabase는 네이버를 기본 지원 안 함 →
   프론트가 네이버 인가 code를 받아 이 함수로 보내면:
   1) code → 네이버 access token 교환
   2) 네이버 프로필(id/email/nickname/이미지) 조회
   3) Supabase 유저 find-or-create (admin) — 네이버 id를 안정 식별자로
   4) magiclink 발급 → token_hash 반환 → 프론트가 verifyOtp로 세션 확립
   신규면 handle_new_user 트리거가 프로필 생성(닉네임 null) → 프론트 온보딩이 닉/약관 받음.

   ⚠️ env 필요(사장님 발급 후 설정): NAVER_CLIENT_ID, NAVER_CLIENT_SECRET.
   verify_jwt=false (로그인 전 호출) — 대신 네이버 code 검증이 게이트. */
import { createClient } from "npm:@supabase/supabase-js@2";

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

  let body: { code?: string; state?: string; redirect_uri?: string };
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }
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

    // 안정 식별: 네이버 이메일 있으면 사용, 없으면 합성(우리 소유 도메인) — 유저는 못 보는 값
    const email = (p.email && String(p.email)) || `naver_${p.id}@galla.social`;

    // 3) find-or-create
    let userId: string | null = null;
    // 이메일로 조회(있으면 연결 — 같은 이메일 이메일가입 계정과 자연 연결)
    const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
    void list; // (대량 목록 스캔 대신 아래 createUser 충돌로 판정)
    const created = await sb.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider_naver_id: String(p.id), avatar_url: p.profile_image || null, full_name: p.nickname || null },
    });
    if (created.data?.user) {
      userId = created.data.user.id;
    } else {
      // 이미 있으면 이메일로 재조회
      const { data: byEmail } = await sb.auth.admin.listUsers();
      const u = byEmail?.users?.find((x) => x.email === email);
      userId = u?.id ?? null;
    }
    if (!userId) return j({ error: "user_upsert" }, 500);

    // 4) magiclink 발급 → token_hash를 프론트로 (verifyOtp로 세션 확립)
    const link = await sb.auth.admin.generateLink({ type: "magiclink", email });
    const th = (link.data as any)?.properties?.hashed_token;
    if (!th) return j({ error: "link" }, 500);

    return j({ ok: true, email, token_hash: th, is_new: !!created.data?.user });
  } catch (e) {
    return j({ error: "server", detail: String((e as Error).message) }, 500);
  }
});
