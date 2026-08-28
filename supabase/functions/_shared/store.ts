/* 🏬 store.ts — 애플·구글 스토어 서버 API 공용 모듈
   verify-iap(지급)과 store-notify(환불 회수)가 같이 쓴다.

   ⚠️ 왜 공용으로 두는가: 결제 검증 코드를 복사해 두면 한쪽만 고쳐지는 날이 온다.
      돈이 걸린 코드는 사본을 만들지 않는다.

   설계 원칙 — "통보는 힌트일 뿐, 진실은 API에 물어본다."
      애플 알림(JWS)의 서명을 직접 검증하려면 x5c 인증서 체인을 ASN.1로 파싱해야 하는데,
      그 코드는 길고 틀리기 쉽다. 대신 알림에서 거래ID만 꺼내 우리가 직접
      스토어 API에 되물어 확인한다. 알림이 위조돼도 API가 아니라고 하면 끝이다. */

export const b64urlToBytes = (s: string): Uint8Array => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
  return Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
};
export const bytesToB64url = (b: Uint8Array): string =>
  btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** JWS 본문만 꺼낸다(서명 검증 아님 — 힌트 용도). */
export function jwsPayload<T = any>(jws: string): T | null {
  try { return JSON.parse(new TextDecoder().decode(b64urlToBytes(jws.split(".")[1]))); }
  catch { return null; }
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

async function signJwt(
  header: Record<string, unknown>, claims: Record<string, unknown>,
  pem: string, alg: "ES256" | "RS256",
): Promise<string> {
  const params = alg === "ES256"
    ? { name: "ECDSA", namedCurve: "P-256" } as const
    : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" } as const;
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(pem), params, false, ["sign"]);
  const enc = new TextEncoder();
  const head = bytesToB64url(enc.encode(JSON.stringify({ ...header, alg })));
  const body = bytesToB64url(enc.encode(JSON.stringify(claims)));
  const sigParams = alg === "ES256"
    ? { name: "ECDSA", hash: "SHA-256" } as const
    : { name: "RSASSA-PKCS1-v1_5" } as const;
  const sig = new Uint8Array(await crypto.subtle.sign(sigParams, key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${bytesToB64url(sig)}`;
}

/* ── 애플 ─────────────────────────────────────────────
   App Store Server API. 키는 App Store Connect > 통합 > 인앱 구매 에서 발급한 .p8.
   ⚠️ verifyReceipt(레거시)와 달리 이건 거래 하나를 직접 조회할 수 있다 — 환불 확인에 필요. */
const APPLE_HOSTS = [
  "https://api.storekit.itunes.apple.com",         // 운영
  "https://api.storekit-sandbox.itunes.apple.com", // 샌드박스
];

async function appleToken(): Promise<string | null> {
  const iss = Deno.env.get("APPLE_ISSUER_ID");
  const kid = Deno.env.get("APPLE_KEY_ID");
  const pem = Deno.env.get("APPLE_PRIVATE_KEY");
  const bid = Deno.env.get("APPLE_BUNDLE_ID");
  if (!iss || !kid || !pem || !bid) return null;
  const now = Math.floor(Date.now() / 1000);
  return await signJwt(
    { kid, typ: "JWT" },
    { iss, iat: now, exp: now + 900, aud: "appstoreconnect-v1", bid },
    pem, "ES256",
  );
}

export type AppleTx = {
  transactionId: string; productId: string; bundleId?: string;
  revocationDate?: number; revocationReason?: number;
};

/** 거래ID로 애플에 직접 조회. 운영→샌드박스 순서로 시도. */
export async function appleGetTransaction(txid: string): Promise<AppleTx | null> {
  const tok = await appleToken();
  if (!tok) return null;
  for (const host of APPLE_HOSTS) {
    const r = await fetch(`${host}/inApps/v1/transactions/${encodeURIComponent(txid)}`, {
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (r.status === 404) continue;              // 다른 환경의 거래 → 다음 호스트
    if (!r.ok) continue;
    const d = await r.json().catch(() => null);
    const info = d?.signedTransactionInfo ? jwsPayload<AppleTx>(d.signedTransactionInfo) : null;
    if (info?.transactionId) return info;
  }
  return null;
}

/* ── 구글 ─────────────────────────────────────────────
   Play Developer API. 서비스 계정 JSON 의 client_email / private_key 를 환경변수로. */
let gTok: { v: string; exp: number } | null = null;

async function googleToken(): Promise<string | null> {
  const email = Deno.env.get("GOOGLE_SA_EMAIL");
  const pem = Deno.env.get("GOOGLE_SA_KEY");
  if (!email || !pem) return null;
  const now = Math.floor(Date.now() / 1000);
  if (gTok && gTok.exp > now + 60) return gTok.v;

  const assertion = await signJwt({ typ: "JWT" }, {
    iss: email, scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  }, pem.replace(/\\n/g, "\n"), "RS256");

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion,
    }),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d?.access_token) return null;
  gTok = { v: d.access_token, exp: now + (d.expires_in || 3600) };
  return gTok.v;
}

export type GoogleTx = {
  productId: string; orderId?: string;
  purchaseState: number;      // 0 구매완료 · 1 취소 · 2 보류
  consumptionState?: number;  // 0 미소비 · 1 소비
  acknowledgementState?: number;
};

/** 소모성 상품 1건 조회. purchaseState 가 진실이다 — 클라이언트 말은 믿지 않는다. */
export async function googleGetPurchase(productId: string, token: string): Promise<GoogleTx | null> {
  const tok = await googleToken();
  const pkg = Deno.env.get("ANDROID_PACKAGE") || "im.galla.app";
  if (!tok) return null;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return null;
  const d = await r.json().catch(() => null);
  if (!d || typeof d.purchaseState !== "number") return null;
  return d as GoogleTx;
}

export type GoogleSub = {
  startTimeMillis?: string; expiryTimeMillis?: string;
  autoRenewing?: boolean; orderId?: string;
  paymentState?: number;      // 0 결제대기 · 1 결제완료 · 2 무료체험 · 3 유예중
  cancelReason?: number;      // 0 유저해지 · 1 결제실패 · 2 시스템 · 3 개발자
  acknowledgementState?: number;
};

/** 구독 1건 조회.
 *  ⚠️ 소모성 상품과 **다른 엔드포인트**다(purchases/subscriptions). products 로 부르면 404 가 난다.
 *  진실은 expiryTimeMillis 다 — 클라가 보낸 만료일은 믿지 않는다. */
export async function googleGetSubscription(productId: string, token: string): Promise<GoogleSub | null> {
  const tok = await googleToken();
  const pkg = Deno.env.get("ANDROID_PACKAGE") || "im.galla.app";
  if (!tok) return null;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
  if (!r.ok) return null;
  return await r.json().catch(() => null) as GoogleSub | null;
}

/** 구독 확인(acknowledge) — 3일 안에 안 하면 구글이 자동 환불한다. */
export async function googleAckSubscription(productId: string, token: string): Promise<boolean> {
  const tok = await googleToken();
  const pkg = Deno.env.get("ANDROID_PACKAGE") || "im.galla.app";
  if (!tok) return false;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:acknowledge`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: "{}" });
  return r.ok;
}

/** 지급 후 소비 처리 — 안 하면 같은 상품을 다시 못 산다. */
export async function googleConsume(productId: string, token: string): Promise<boolean> {
  const tok = await googleToken();
  const pkg = Deno.env.get("ANDROID_PACKAGE") || "im.galla.app";
  if (!tok) return false;
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(token)}:consume`;
  const r = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${tok}` } });
  return r.ok;
}
