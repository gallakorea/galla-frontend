/* 🗑️ delete-account — 계정 삭제 (애플 5.1.1(v) / 구글 정책 필수)
   흐름: 호출자 JWT 검증 → anonymize_account(PII 제거·툼스톤) → auth.users 삭제(로그인·이메일 제거).
   설계: 콘텐츠(댓글·발제)는 익명 유지 — 남의 댓글이 연쇄삭제되지 않게. 개인정보·로그인만 없앤다.
   되돌릴 수 없다. 프론트에서 재확인 후 호출. */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  // 토큰이 실제로 유효한지 서버에서 재검증(위조 토큰 차단)
  const authHeader = req.headers.get("Authorization") || "";
  const { data: userData, error: uErr } = await admin.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ""),
  );
  const uid = userData?.user?.id || callerUid(req);
  if (uErr || !uid) return j({ ok: false, reason: "unauthorized" }, 401);

  // 1) PII 제거 + 익명 툼스톤
  const { error: aErr } = await admin.rpc("anonymize_account", { p_uid: uid });
  if (aErr) return j({ ok: false, reason: "anonymize_failed", detail: aErr.message }, 500);

  // 2) 로그인 수단(auth.users) 삭제 — 이메일·전화·세션 제거, 재로그인 불가
  const { error: dErr } = await admin.auth.admin.deleteUser(uid);
  if (dErr) return j({ ok: false, reason: "auth_delete_failed", detail: dErr.message }, 500);

  return j({ ok: true });
});
