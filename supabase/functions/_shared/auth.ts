/* 🔒 엣지 함수 공용 인증(26.9.21 보안 점검)
   verify_jwt=false 함수가 토큰의 가운데 조각(payload)을 서명 검증 없이 읽어 sub·role 을 믿고 있었다.
   → 누구나 {"sub":"<남의 id>"} 나 {"role":"service_role"} 를 넣은 가짜 토큰으로 남의 GP 차감·미디어 삭제·
     푸시 발신자 사칭을 할 수 있었다. 여기서는 Supabase Auth 에 되물어 '서명까지 맞는' 토큰만 인정한다. */
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export function bearer(req: Request): string {
  return (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
}

/** 서명까지 검증된 로그인 사용자 id. 가짜·만료 토큰이면 null. */
export async function verifiedUid(req: Request): Promise<string | null> {
  const tok = bearer(req);
  if (!tok || tok.split(".").length !== 3) return null;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: ANON || SVC, Authorization: `Bearer ${tok}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return (u && typeof u.id === "string") ? u.id : null;
  } catch { return null; }
}

/** 요청 토큰이 이 프로젝트의 서비스 키와 '정확히' 같은가(내용에 role 이 적혀 있는지로 판단하지 않는다). */
export function isServiceKey(req: Request): boolean {
  const t = bearer(req);
  return !!SVC && t.length > 20 && t === SVC;
}
