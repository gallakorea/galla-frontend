/* 💳 portone-webhook — 포트원(PortOne) V2 결제 웹훅 수신 → GC 지급
   등록 위치: 포트원 관리자콘솔 > 결제연동 > 웹훅
   URL: https://<project>.supabase.co/functions/v1/portone-webhook

   ⚠️ 클라이언트가 "결제 성공"이라고 말하는 걸 믿지 않는다.
      브라우저는 조작할 수 있다. 지급은 오직 이 웹훅이,
      포트원 API에 되물어 확인한 뒤에만 한다. (verify-iap 와 같은 원칙)

   ⚠️ 금액도 클라가 아니라 서버가 정한다.
      gc_charge_begin 이 만든 gc_charges 행의 krw 와 포트원이 알려준 실제 결제금액이
      다르면 지급하지 않는다 — 결제창을 열어놓고 금액만 바꿔치기하는 공격을 막는다.

   ⚠️ paymentId = gc_charges.id(uuid) 로 맞춰 발급한다.
      포트원이 돌려주는 paymentId 로 우리 충전 건을 바로 찾기 위해서다. */
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const PORTONE_API = "https://api.portone.io";
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

/** 포트원에 결제 단건을 되물어 확인한다. 알림 본문은 힌트일 뿐이다. */
async function fetchPayment(paymentId: string) {
  const key = Deno.env.get("PORTONE_API_SECRET");
  if (!key) return null;
  try {
    const r = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `PortOne ${key}` },
    });
    if (!r.ok) { console.error("portone_fetch_failed", r.status, await r.text()); return null; }
    return await r.json();
  } catch (e) { console.error("portone_fetch_error", String(e)); return null; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  /* 포트원 웹훅은 서명(webhook-signature)을 보내지만, 서명 검증 라이브러리를 들이는 대신
     '알림은 힌트, 진실은 API' 원칙을 쓴다 — paymentId 만 꺼내 우리가 직접 되물어본다.
     위조 웹훅이 와도 포트원 API 가 'PAID 아님'이라고 하면 아무 일도 일어나지 않는다.
     다만 무단 호출로 API 를 태우는 건 막아야 하므로 공유 시크릿도 함께 본다(설정 시). */
  const guard = Deno.env.get("PORTONE_WEBHOOK_KEY") || "";
  if (guard) {
    const got = new URL(req.url).searchParams.get("k") || req.headers.get("x-portone-key") || "";
    if (got !== guard) return j({ ok: false, reason: "forbidden" }, 403);
  }

  let body: any = null;
  try { body = await req.json(); } catch { return j({ ok: true, skipped: "unparsable" }); }

  /* V2 웹훅 본문: { type, timestamp, data: { paymentId, transactionId, storeId } } */
  const type = String(body?.type || "");
  const paymentId = String(body?.data?.paymentId || body?.paymentId || "");
  if (!paymentId) return j({ ok: true, skipped: "no_payment_id" });

  /* 결제 완료 계열만 처리한다. 취소·실패는 gc_charges 를 건드리지 않는다
     (환불 회수는 별도 경로 — 지급 안 한 건을 되돌릴 일이 없다). */
  if (type && !/^Transaction\.(Paid|Confirmed)$/i.test(type) && !/paid/i.test(type)) {
    return j({ ok: true, skipped: type });
  }

  const pay = await fetchPayment(paymentId);
  if (!pay) return j({ ok: false, reason: "verify_failed" }, 400);
  if (String(pay.status).toUpperCase() !== "PAID") {
    return j({ ok: true, skipped: "not_paid", status: pay.status });
  }

  /* paymentId 로 우리 충전 건을 찾는다. 없으면 우리 결제가 아니다. */
  const { data: chg, error: chgErr } = await sb
    .from("gc_charges").select("id,krw,status").eq("id", paymentId).maybeSingle();
  if (chgErr) return j({ ok: false, reason: "db_error", detail: chgErr.message }, 500);
  if (!chg) return j({ ok: true, skipped: "unknown_charge" });
  if (chg.status === "paid") return j({ ok: true, already: true });

  /* 💰 금액 대조 — 서버가 만든 금액과 실제 결제금액이 같아야 한다. */
  const paidAmount = Number(pay?.amount?.total ?? pay?.amount ?? 0);
  if (!paidAmount || paidAmount !== Number(chg.krw)) {
    console.error("amount_mismatch", paymentId, "expected", chg.krw, "got", paidAmount);
    return j({ ok: false, reason: "amount_mismatch", expected: chg.krw, got: paidAmount }, 400);
  }

  const { data, error } = await sb.rpc("gc_charge_confirm", {
    p_charge_id: paymentId,
    p_pg_provider: String(pay?.channel?.pgProvider || pay?.channel?.type || "portone"),
    p_pg_tx: String(pay?.pgTxId || pay?.transactionId || paymentId),
  });
  if (error) return j({ ok: false, reason: "confirm_error", detail: error.message }, 500);

  console.log("gc_credited", paymentId, JSON.stringify(data));
  return j(data);
});
