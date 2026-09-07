/* 💸 gc-refund — 갈라 안에서 환불을 '끝까지' 처리한다.

   왜 생겼나: 환불 창구(js/charges.js)와 신청 RPC(gc_refund_request)는 있었는데,
   포트원 **취소 API 를 부르는 코드가 코드베이스에 한 곳도 없었다**(실측 2026-09-07).
   admin_gc_refund_decide 의 approve 가 문자 그대로
       'todo', 'PG 콘솔에서 ₩...  환급 후 done 처리'
   를 반환한다 — 사람이 콘솔을 열어 손으로 취소하는 설계였다. 그래서 신청은 되는데
   돈은 돌아가지 않았다(관리자 승인 화면조차 없었다).

   정책(사장님 확정 2026-09-07):
     · 청약철회 7일 이내 + 전액(미사용) → **즉시 자동 환불**. 전자상거래법 취지에 맞고
       운영자가 붙을 필요가 없다.
     · 그 밖(7일 초과 · 일부만 남음) → 신청만 접수하고 관리자 승인 대기.

   흐름:
     1) 사용자 JWT 로 gc_refund_request 호출 — 검증·한도·GC 잠금은 전부 거기서 한다.
        (금액을 클라가 정하지 않는다. 이 함수도 정하지 않는다.)
     2) 자동 대상이면 포트원 취소 API 호출(시크릿은 서버에만 있다).
     3) 성공하면 gc_refund_settle(service_role 전용)로 장부를 닫는다.
        취소는 됐는데 정산이 실패하면 돈만 나가고 GC 가 남는다 → 그 경우를 로그로 남긴다.

   verify_jwt=false 로 배포하고 Authorization 헤더를 우리가 직접 쓴다(사용자 토큰으로
   RPC 를 부르므로 auth.uid() 가 그대로 살아 있다). 토큰이 없으면 gc_refund_request 가
   'auth' 로 거절한다 — 이중 방어다. */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PORTONE_SECRET = Deno.env.get("PORTONE_API_SECRET") || "";
const PORTONE_API = "https://api.portone.io";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

/** 포트원 결제 취소. paymentId 는 gc_charges.id 를 그대로 쓴다(결제 때 그렇게 넣었다). */
async function cancelPayment(paymentId: string, reason: string) {
  if (!PORTONE_SECRET) return { ok: false, detail: "portone_secret_missing" };
  try {
    const r = await fetch(`${PORTONE_API}/payments/${encodeURIComponent(paymentId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `PortOne ${PORTONE_SECRET}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),      // 금액 생략 = 전액 취소
    });
    const body = await r.text();
    if (!r.ok) {
      console.error("portone_cancel_failed", r.status, body);
      return { ok: false, detail: `http_${r.status}`, body };
    }
    return { ok: true, body };
  } catch (e) {
    console.error("portone_cancel_error", String(e));
    return { ok: false, detail: "fetch_error" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j({ ok: false, reason: "method" }, 405);

  const auth = req.headers.get("Authorization") || "";
  let body: { charge_id?: string; reason?: string };
  try { body = await req.json(); } catch { return j({ ok: false, reason: "bad_json" }, 400); }
  if (!body.charge_id) return j({ ok: false, reason: "charge_id_required" }, 400);

  // 1) 사용자 자격으로 신청 — 검증·한도·GC 잠금은 전부 RPC 안에서 벌어진다
  const asUser = createClient(SB_URL, ANON, { global: { headers: { Authorization: auth } } });
  const { data: reqRes, error: reqErr } = await asUser.rpc("gc_refund_request", {
    p_charge_id: body.charge_id,
    p_reason: (body.reason || "").trim() || null,
  });
  if (reqErr) return j({ ok: false, reason: "request_failed", detail: reqErr.message }, 400);
  if (!reqRes?.ok) return j(reqRes, 200);      // 사유 문자열은 프론트가 이미 사람 말로 바꾼다

  const refundId = reqRes.id as string;
  const autoEligible = reqRes.within_7d === true && reqRes.partial === false;
  if (!autoEligible) {
    return j({ ...reqRes, auto: false, queued: true });
  }

  // 2) 포트원 취소
  const cancel = await cancelPayment(body.charge_id, "청약철회(7일 이내 미사용분)");
  if (!cancel.ok) {
    /* 취소 실패 — 신청은 'requested' 로 남는다. 돈은 안 나갔고 GC 는 잠긴 상태라
       유저 잔액이 새지 않는다. 관리자가 이어받으면 된다. */
    console.error("refund_cancel_failed", refundId, cancel.detail);
    return j({ ...reqRes, auto: false, queued: true, cancel_failed: cancel.detail });
  }

  // 3) 장부 닫기 — service_role 전용 RPC
  const admin = createClient(SB_URL, SERVICE);
  const { data: settled, error: setErr } = await admin.rpc("gc_refund_settle", {
    p_refund_id: refundId, p_pg_ref: "auto",
  });
  if (setErr || !settled?.ok) {
    /* ⚠️ 여기까지 왔으면 **돈은 이미 돌려줬는데** 장부만 안 닫힌 상태다.
       유저에게는 성공으로 보이지만 GC 가 잠긴 채 남는다 — 반드시 사람이 봐야 한다. */
    console.error("refund_settle_failed_after_cancel", refundId, setErr?.message || JSON.stringify(settled));
    return j({ ...reqRes, auto: true, settle_failed: true });
  }

  return j({ ...reqRes, auto: true, status: "done" });
});
