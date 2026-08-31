/* 💳 verify-iap — 인앱결제 영수증 검증 후 GP 지급
   호출자: 결제 성공 직후 클라이언트(JWT 필수). 흐름:
     1) JWT에서 uid 추출(클라가 보낸 uid 신뢰 안 함)
     2) 스토어(App Store / Play)에 영수증 진위·상품 확인
     3) grant_gc_topup(멱등)로 GC 지급 — 같은 txid 재검증해도 1회만
   ⚠️ 절대 클라의 금액을 믿지 않는다. 상품ID→GC는 서버 gc_products가 결정.
   ⚠️ GP 가 아니라 GC 다 — GP 는 판매하지 않는다(예측 판돈이라 규제 대상). */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { googleGetPurchase, googleConsume, googleGetSubscription, googleAckSubscription } from "../_shared/store.ts";

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

/* 🎟 구독 상품인가? 상품ID → 등급 매핑은 서버(sub_products)만 안다.
   ⚠️ 클라가 "이건 구독이야" 라고 말하는 걸 믿으면 안 된다 — 소모품 값을 내고 구독을
      받아가는 길이 열린다. 우리 표에 있으면 구독, 없으면 아니다. */
async function subProduct(channel: "ios" | "android", productId: string) {
  const { data } = await sb.from("sub_products").select("tier,days")
    .eq("channel", channel).eq("product_id", productId).eq("active", true).maybeSingle();
  return data as { tier: string; days: number } | null;
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
    /* 🎟 구독 먼저 본다. 애플은 구독도 같은 영수증으로 오는데 만료일·자동갱신 여부는
       latest_receipt_info / pending_renewal_info 에만 있다 — in_app 만 보면 놓친다. */
    if (await subProduct("ios", v.iosProductId)) {
      const raw = v.raw as any;
      const line = (raw?.latest_receipt_info || []).slice(-1)[0] || {};
      const pend = (raw?.pending_renewal_info || [])[0] || {};
      const expMs = Number(line.expires_date_ms || 0);
      const { data, error } = await sb.rpc("apply_sub_purchase", {
        p_user: uid, p_channel: "ios", p_product: v.iosProductId,
        // 갱신돼도 유지되는 식별자여야 스토어 알림과 우리 구독을 이어 붙일 수 있다
        p_ext_id: String(line.original_transaction_id || v.txid),
        p_expires: expMs ? new Date(expMs).toISOString() : null,
        p_auto_renew: pend.auto_renew_status !== "0",
      });
      if (error) return j({ ok: false, reason: "sub_error", detail: error.message }, 500);
      return j(data);
    }

    const pkey = await pkgByStoreProduct("ios", v.iosProductId);
    if (!pkey) return j({ ok: false, reason: "unknown_product" }, 400);
    const { data, error } = await sb.rpc("grant_gc_topup", {
      p_user: uid, p_store: "apple", p_txid: v.txid, p_product: pkey, p_raw: v.raw as any,
    });
    if (error) return j({ ok: false, reason: "grant_error", detail: error.message }, 500);
    return j(data);
  }

  /* Google Play — purchaseToken 을 Play Developer API 로 검증.
     ⚠️ 클라이언트가 보낸 상품ID·금액을 믿지 않는다. 구글이 돌려준 purchaseState 가 진실이다.
     ⚠️ 거래ID는 orderId 를 쓴다 — 환불 알림(voidedPurchaseNotification)이 orderId 로 오기 때문에
        여기서 purchaseToken 을 저장해 두면 나중에 환불을 우리 결제와 못 맞춘다. */
  if (store === "google") {
    const pid = payload.productId, tok = payload.purchaseToken;
    if (!pid || !tok) return j({ ok: false, reason: "no_token" }, 400);

    /* 🎟 구독은 엔드포인트가 다르다(purchases/subscriptions). products 로 부르면 404 다. */
    if (await subProduct("android", pid)) {
      const sub = await googleGetSubscription(pid, tok);
      if (!sub) return j({ ok: false, reason: "verify_failed" }, 400);
      // 0 결제대기 · 1 결제완료 · 2 무료체험 · 3 유예중 — 대기 상태에 등급을 주면 안 된다
      if (sub.paymentState !== 1 && sub.paymentState !== 2) {
        return j({ ok: false, reason: "not_paid", state: sub.paymentState }, 400);
      }
      const expMs = Number(sub.expiryTimeMillis || 0);
      const { data, error } = await sb.rpc("apply_sub_purchase", {
        p_user: uid, p_channel: "android", p_product: pid,
        p_ext_id: String(sub.orderId || tok),
        p_expires: expMs ? new Date(expMs).toISOString() : null,
        p_auto_renew: sub.autoRenewing !== false,
      });
      if (error) return j({ ok: false, reason: "sub_error", detail: error.message }, 500);
      /* ⚠️ 3일 안에 확인(acknowledge)하지 않으면 구글이 자동으로 환불해 버린다.
         지급이 끝난 뒤에 부른다 — 순서를 바꾸면 확인만 되고 지급이 실패할 수 있다. */
      if (sub.acknowledgementState !== 1) {
        const ok = await googleAckSubscription(pid, tok);
        if (!ok) console.warn("google_sub_ack_failed", sub.orderId);
      }
      return j(data);
    }

    const real = await googleGetPurchase(pid, tok);
    if (!real) return j({ ok: false, reason: "verify_failed" }, 400);
    if (real.purchaseState !== 0) return j({ ok: false, reason: "not_purchased", state: real.purchaseState }, 400);

    const pkey = await pkgByStoreProduct("android", pid);
    if (!pkey) return j({ ok: false, reason: "unknown_product" }, 400);

    const txid = real.orderId || tok;
    const { data, error } = await sb.rpc("grant_gc_topup", {
      p_user: uid, p_store: "google", p_txid: txid, p_product: pkey, p_raw: real as any,
    });
    if (error) return j({ ok: false, reason: "grant_error", detail: error.message }, 500);

    /* 소비 처리는 지급이 끝난 뒤에. 순서를 바꾸면 소비는 됐는데 지급이 실패한
       '돈만 내고 아무것도 못 받은' 상태가 만들어진다. 실패해도 지급은 유효하다 —
       멱등(txid)이라 재시도해도 두 번 주지 않는다. */
    if (real.consumptionState !== 1) {
      const consumed = await googleConsume(pid, tok);
      if (!consumed) console.warn("google_consume_failed", txid);
    }
    return j(data);
  }

  return j({ ok: false, reason: "unknown_store" }, 400);
});
