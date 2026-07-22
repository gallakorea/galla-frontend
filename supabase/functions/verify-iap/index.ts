/* 💳 verify-iap — 인앱결제 영수증 검증 후 GP 지급
   호출자: 결제 성공 직후 클라이언트(JWT 필수). 흐름:
     1) JWT에서 uid 추출(클라가 보낸 uid 신뢰 안 함)
     2) 스토어(App Store / Play)에 영수증 진위·상품 확인
     3) grant_gp_topup(멱등)로 paid_balance 지급 — 같은 txid 재검증해도 1회만
   ⚠️ 절대 클라의 'gp 금액'을 믿지 않는다. 상품ID→GP는 서버 gp_products가 결정. */
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
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

// gp_products.ios_product_id → product_key 역참조
async function productKeyByIosId(iosId: string): Promise<string | null> {
  const { data } = await sb.from("gp_products").select("key").eq("ios_product_id", iosId).maybeSingle();
  return data?.key ?? null;
}

/* Apple: App Store Server API 대신, 초기엔 verifyReceipt(레거시지만 sandbox/prod 모두 즉시 동작).
   운영 전환 시 App Store Server API(JWT) 로 승격 권장. */
async function verifyApple(receipt: string): Promise<{ ok: boolean; iosProductId?: string; txid?: string; raw?: unknown }> {
  const body = JSON.stringify({
    "receipt-data": receipt,
    "password": Deno.env.get("APPLE_IAP_SHARED_SECRET") || "",
    "exclude-old-transactions": true,
  });
  // 프로덕션 먼저, 21007이면 샌드박스 재시도(애플 권장 순서)
  for (const url of ["https://buy.itunes.apple.com/verifyReceipt", "https://sandbox.itunes.apple.com/verifyReceipt"]) {
    const r = await fetch(url, { method: "POST", body });
    const d = await r.json();
    if (d.status === 21007) continue;                 // 샌드박스 영수증 → 다음 URL
    if (d.status !== 0) return { ok: false, raw: d };
    const inApp = (d.receipt?.in_app || []).slice(-1)[0] || d.latest_receipt_info?.slice(-1)[0];
    if (!inApp) return { ok: false, raw: d };
    return { ok: true, iosProductId: inApp.product_id, txid: inApp.transaction_id, raw: d };
  }
  return { ok: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const uid = callerUid(req);
  if (!uid) return j({ ok: false, reason: "no_auth" }, 401);
  let payload: { store?: string; receipt?: string; productId?: string; purchaseToken?: string };
  try { payload = await req.json(); } catch { return j({ ok: false, reason: "bad_json" }, 400); }

  const store = payload.store;
  if (store === "apple") {
    if (!payload.receipt) return j({ ok: false, reason: "no_receipt" }, 400);
    const v = await verifyApple(payload.receipt);
    if (!v.ok || !v.iosProductId || !v.txid) return j({ ok: false, reason: "verify_failed", raw: v.raw }, 400);
    const pkey = await productKeyByIosId(v.iosProductId);
    if (!pkey) return j({ ok: false, reason: "unknown_product" }, 400);
    const { data, error } = await sb.rpc("grant_gp_topup", {
      p_user: uid, p_store: "apple", p_txid: v.txid, p_product: pkey, p_raw: v.raw as any,
    });
    if (error) return j({ ok: false, reason: "grant_error", detail: error.message }, 500);
    return j(data);
  }

  // Google Play: purchaseToken을 Play Developer API로 검증 (키 준비 후 활성)
  if (store === "google") {
    return j({ ok: false, reason: "google_not_configured" }, 501);
  }

  return j({ ok: false, reason: "unknown_store" }, 400);
});
