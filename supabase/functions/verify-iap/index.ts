/* 💳 verify-iap — 인앱결제 영수증 검증 후 GP 지급
   호출자: 결제 성공 직후 클라이언트(JWT 필수). 흐름:
     1) JWT에서 uid 추출(클라가 보낸 uid 신뢰 안 함)
     2) 스토어(App Store / Play)에 영수증 진위·상품 확인
     3) grant_gc_topup(멱등)로 GC 지급 — 같은 txid 재검증해도 1회만
   ⚠️ 절대 클라의 금액을 믿지 않는다. 상품ID→GC는 서버 gc_products가 결정.
   ⚠️ GP 가 아니라 GC 다 — GP 는 판매하지 않는다(예측 판돈이라 규제 대상). */
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

// gc_products.product_id → 패키지 key 역참조(채널별)
/* 스토어 상품 id → 우리 패키지 key.
   ⚠️ gp_products 가 아니라 gc_products 다. GP 는 판매하지 않는다(2026-08-09 확정) —
      예측 판돈이라 돈으로 사면 '돈으로 사서 결과에 걸고 딴다'가 되어 규제 대상이 된다.
      인앱결제는 GC 로만 받는다. */
async function pkgByStoreProduct(channel: "ios" | "android", productId: string): Promise<string | null> {
  const { data } = await sb.from("gc_products").select("pkg")
    .eq("channel", channel).eq("product_id", productId).eq("active", true).maybeSingle();
  return data?.pkg ?? null;
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
    const pkey = await pkgByStoreProduct("ios", v.iosProductId);
    if (!pkey) return j({ ok: false, reason: "unknown_product" }, 400);
    const { data, error } = await sb.rpc("grant_gc_topup", {
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
