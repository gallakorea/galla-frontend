/* 🔑 passkey — WebAuthn 등록/로그인 (Supabase 네이티브 미지원 → 커스텀).
   action:
     'register-begin'  (로그인 상태: Authorization Bearer 필요) → 등록 옵션+handle
     'register-finish' (로그인 상태) → 자격증명 저장
     'login-begin'     (비로그인) → 인증 옵션+handle (discoverable)
     'login-finish'    (비로그인) → 검증 성공 시 magiclink token_hash 반환 → 프론트 verifyOtp로 세션
   rpID=galla.im (웹 전용 — Capacitor 네이티브는 associated-domains 필요, 추후).
   verify_jwt=false (register는 내부에서 수동 JWT 검증). */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@11";

const RP_ID = "galla.im";
const RP_NAME = "GALLA";
const ORIGIN = "https://galla.im";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// base64url <-> Uint8Array
const b64uToBytes = (s: string): Uint8Array => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "==".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
const bytesToB64u = (u: Uint8Array): string => {
  let bin = "";
  for (let i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function getUserFromAuth(req: Request): Promise<{ id: string; email: string } | null> {
  const authz = req.headers.get("Authorization") || "";
  const jwt = authz.replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data } = await admin.auth.getUser(jwt);
  if (!data?.user) return null;
  return { id: data.user.id, email: data.user.email || "" };
}

const randHandle = () => bytesToB64u(crypto.getRandomValues(new Uint8Array(24)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: any;
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  const action = body?.action;

  try {
    // ── 등록 시작 (로그인 상태) ──
    if (action === "register-begin") {
      const u = await getUserFromAuth(req);
      if (!u) return j({ error: "auth" }, 401);
      const { data: creds } = await admin.from("webauthn_credentials")
        .select("credential_id, transports").eq("user_id", u.id);
      const options = await generateRegistrationOptions({
        rpName: RP_NAME, rpID: RP_ID,
        userID: new TextEncoder().encode(u.id),
        userName: u.email || u.id,
        attestationType: "none",
        excludeCredentials: (creds || []).map((c: any) => ({
          id: c.credential_id, transports: c.transports || undefined,
        })),
        authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
      });
      const handle = randHandle();
      await admin.from("webauthn_challenges").insert({
        handle, challenge: options.challenge, kind: "register", user_id: u.id,
      });
      return j({ handle, options });
    }

    // ── 등록 마무리 (로그인 상태) ──
    if (action === "register-finish") {
      const u = await getUserFromAuth(req);
      if (!u) return j({ error: "auth" }, 401);
      const { handle, response, label } = body;
      const { data: ch } = await admin.from("webauthn_challenges")
        .select("*").eq("handle", handle).eq("kind", "register").maybeSingle();
      if (!ch || new Date(ch.expires_at) < new Date() || ch.user_id !== u.id)
        return j({ error: "challenge" }, 400);
      const v = await verifyRegistrationResponse({
        response, expectedChallenge: ch.challenge,
        expectedOrigin: ORIGIN, expectedRPID: RP_ID,
      });
      if (!v.verified || !v.registrationInfo) return j({ error: "verify" }, 400);
      const c = v.registrationInfo.credential; // {id, publicKey(Uint8Array), counter, transports}
      await admin.from("webauthn_credentials").insert({
        user_id: u.id,
        credential_id: c.id,
        public_key: bytesToB64u(c.publicKey),
        counter: c.counter ?? 0,
        transports: c.transports || [],
        device_label: label || null,
      });
      await admin.from("webauthn_challenges").delete().eq("handle", handle);
      return j({ ok: true });
    }

    // ── 로그인 시작 (비로그인, discoverable) ──
    if (action === "login-begin") {
      const options = await generateAuthenticationOptions({
        rpID: RP_ID, userVerification: "preferred", allowCredentials: [],
      });
      const handle = randHandle();
      await admin.from("webauthn_challenges").insert({
        handle, challenge: options.challenge, kind: "login",
      });
      return j({ handle, options });
    }

    // ── 로그인 마무리 (비로그인) → 세션 발급 ──
    if (action === "login-finish") {
      const { handle, response } = body;
      const { data: ch } = await admin.from("webauthn_challenges")
        .select("*").eq("handle", handle).eq("kind", "login").maybeSingle();
      if (!ch || new Date(ch.expires_at) < new Date()) return j({ error: "challenge" }, 400);
      // 자격증명 조회(응답의 credential id로)
      const { data: cred } = await admin.from("webauthn_credentials")
        .select("*").eq("credential_id", response.id).maybeSingle();
      if (!cred) return j({ error: "unknown_credential" }, 400);
      const v = await verifyAuthenticationResponse({
        response, expectedChallenge: ch.challenge,
        expectedOrigin: ORIGIN, expectedRPID: RP_ID,
        credential: {
          id: cred.credential_id,
          publicKey: b64uToBytes(cred.public_key),
          counter: Number(cred.counter) || 0,
          transports: cred.transports || undefined,
        },
      });
      if (!v.verified) return j({ error: "verify" }, 400);
      await admin.from("webauthn_credentials")
        .update({ counter: v.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
        .eq("id", cred.id);
      await admin.from("webauthn_challenges").delete().eq("handle", handle);
      // 세션: 유저 이메일로 magiclink → token_hash (naver-auth와 동일 패턴)
      const { data: ures } = await admin.auth.admin.getUserById(cred.user_id);
      const email = ures?.user?.email;
      if (!email) return j({ error: "no_email" }, 500);
      const link = await admin.auth.admin.generateLink({ type: "magiclink", email });
      const th = (link.data as any)?.properties?.hashed_token;
      if (!th) return j({ error: "link" }, 500);
      return j({ ok: true, token_hash: th, email });
    }

    return j({ error: "unknown_action" }, 400);
  } catch (e) {
    return j({ error: "server", detail: String((e as Error).message) }, 500);
  }
});
