/* 🔔 store-notify — 애플·구글 스토어 서버 알림 수신 (환불 회수)
   등록 위치
     · 애플: App Store Connect > 앱 > 일반 정보 > App Store 서버 알림 URL (버전 2)
     · 구글: Play Console > 수익 창출 설정 > 실시간 개발자 알림 (Pub/Sub 푸시)
   두 URL 모두 뒤에 ?k=<STORE_NOTIFY_KEY> 를 붙여 등록한다.

   ⚠️ 알림은 힌트다. 알림만 믿고 GC를 뺏지 않는다.
      알림에서 거래ID만 꺼내 스토어 API에 되물어보고, 스토어가 "환불됨"이라고
      답할 때만 revoke_gc_topup 을 부른다. 위조 알림으로 남의 지갑을
      비우는 공격(회수 + 결제차단)이 실제로 가능하기 때문이다.

   ⚠️ 처리 못 한 알림에도 200 을 돌려준다 — 4xx/5xx 를 주면 스토어가 며칠간
      같은 알림을 계속 재시도한다. '해당 없음'은 실패가 아니다. */
import { createClient } from "npm:@supabase/supabase-js@2";
import { jwsPayload, appleGetTransaction, googleGetPurchase, b64urlToBytes } from "../_shared/store.ts";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

async function revoke(store: "apple" | "google", txid: string, reason: string) {
  const { data, error } = await sb.rpc("revoke_gc_topup", {
    p_store: store, p_txid: txid, p_reason: reason,
  });
  if (error) { console.error("revoke_failed", store, txid, error.message); return { ok: false }; }
  console.log("revoked", store, txid, JSON.stringify(data));
  return data;
}

/* ── 애플 ── */
async function handleApple(signedPayload: string) {
  const p = jwsPayload<any>(signedPayload);
  if (!p) return j({ ok: true, skipped: "unparsable" });

  const type = String(p.notificationType || "");
  // REFUND = 환불 승인, REVOKE = 가족 공유 회수. 나머지는 소모성 상품과 무관.
  if (type !== "REFUND" && type !== "REVOKE") {
    return j({ ok: true, skipped: type || "unknown_type" });
  }

  const tx = p.data?.signedTransactionInfo ? jwsPayload<any>(p.data.signedTransactionInfo) : null;
  const txid = tx?.transactionId;
  if (!txid) return j({ ok: true, skipped: "no_txid" });

  // 되물어 확인 — 알림을 믿지 않는다
  const real = await appleGetTransaction(String(txid));
  if (!real) {
    // 키 미설정이거나 애플이 모르는 거래. 지우는 쪽이라 '모르면 안 지운다'가 안전하다.
    console.warn("apple_confirm_unavailable", txid);
    return j({ ok: true, skipped: "unconfirmed" });
  }
  if (!real.revocationDate) return j({ ok: true, skipped: "not_revoked" });

  return j(await revoke("apple", String(txid), `apple:${type}:${real.revocationReason ?? ""}`));
}

/* ── 구글 ── */
async function handleGoogle(body: any) {
  const raw = body?.message?.data;
  if (!raw) return j({ ok: true, skipped: "no_data" });

  let n: any = null;
  try { n = JSON.parse(new TextDecoder().decode(b64urlToBytes(String(raw)))); }
  catch { return j({ ok: true, skipped: "unparsable" }); }

  // 소모성 상품의 환불은 voidedPurchaseNotification 으로 온다
  const v = n?.voidedPurchaseNotification;
  if (!v?.orderId || !v?.purchaseToken) return j({ ok: true, skipped: "not_voided" });

  // orderId 로 우리 결제를 찾는다 → 그 상품ID 로 구글에 되물어본다
  const { data: row } = await sb.from("gc_charges")
    .select("pkg").eq("pg_provider", "google").eq("pg_tx_id", v.orderId).maybeSingle();
  if (!row?.pkg) return j({ ok: true, skipped: "unknown_order" });

  const { data: prod } = await sb.from("gc_products")
    .select("product_id").eq("channel", "android").eq("pkg", row.pkg).eq("active", true).maybeSingle();
  if (!prod?.product_id) return j({ ok: true, skipped: "no_product" });

  const real = await googleGetPurchase(prod.product_id, String(v.purchaseToken));
  if (!real) { console.warn("google_confirm_unavailable", v.orderId); return j({ ok: true, skipped: "unconfirmed" }); }
  if (real.purchaseState !== 1) return j({ ok: true, skipped: "not_canceled" });

  return j(await revoke("google", String(v.orderId), `google:voided:${v.refundType ?? ""}`));
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  // 공유 비밀 — 없으면 열지 않는다(설정 누락이 곧 공개 엔드포인트가 되면 안 된다)
  const want = Deno.env.get("STORE_NOTIFY_KEY");
  const got = new URL(req.url).searchParams.get("k");
  if (!want || got !== want) return j({ ok: false, reason: "unauthorized" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return j({ ok: true, skipped: "bad_json" }); }

  try {
    if (typeof body?.signedPayload === "string") return await handleApple(body.signedPayload);
    if (body?.message?.data) return await handleGoogle(body);
    return j({ ok: true, skipped: "unknown_shape" });
  } catch (e) {
    // 여기서 5xx 를 주면 스토어가 며칠 재시도한다. 로그만 남기고 200.
    console.error("store_notify_error", String(e));
    return j({ ok: true, error: true });
  }
});
