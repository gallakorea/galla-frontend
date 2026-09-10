/* 💸 출금 신청(withdraw.html) — 실제 request_withdrawal() RPC 로 접수한다.

   ⚠️ 예전 이 파일은 「OCR Demo」였다. 신분증 파일을 고르면 가짜 이름·주민등록번호(900101-1234567)가 채워지고,
      「출금 요청하기」는 서버에 아무것도 보내지 않은 채 「출금 요청 완료! 2~3일 내 처리」만 띄웠다
      — 수익 0 계정도 20만원을 적으면 완료(2026-09-10 QA). 서버 검사(최소 20만원·출금 가능액·계좌)는
      request_withdrawal() 이 하고, withdrawals 직접 INSERT 는 막혀 있다(20260910201000).
   ⚠️ 왜 DOMContentLoaded 로 거는가 — SPA 는 재방문 때 스크립트를 다시 실행하지 않고, 로드 중에 걸린
      DCL 리스너만 되감아 부른다. 인라인 로그인 가드·goBackWithScroll 도 SPA 에선 버려지므로 여기 둔다. */
(function () {
  function $(id) { return document.getElementById(id); }
  function nav(u) { (window.GALLA_nav || function (x) { location.href = x; })(u); }
  function fmt(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  if (typeof window.goBackWithScroll !== "function") window.goBackWithScroll = function () { history.back(); };

  function waitSupabase(timeoutMs) {
    return new Promise(function (resolve) {
      if (window.supabaseClient) return resolve(window.supabaseClient);
      var t0 = Date.now();
      var timer = setInterval(function () {
        if (window.supabaseClient || Date.now() - t0 > (timeoutMs || 8000)) {
          clearInterval(timer);
          resolve(window.supabaseClient || null);
        }
      }, 20);
    });
  }

  var REASONS = {
    min_200000: "출금은 20만원 이상부터 신청할 수 있어요.",
    need_bank: "은행·예금주·계좌번호를 모두 입력해 주세요.",
    unauthorized: "로그인이 필요합니다."
  };
  var avail = null;
  var busy = false;

  async function loadAvail(sb) {
    var box = $("wdAvail");
    try {
      var r = await sb.rpc("my_creator_earnings");
      var d = r.data;
      if (!d || !d.ok) throw r.error || new Error("no data");
      avail = d.available || 0;
      if (box) box.textContent = "₩" + fmt(avail) + (d.pending > 0 ? "  (처리 중 ₩" + fmt(d.pending) + ")" : "");
    } catch (e) {
      avail = null;
      if (box) box.textContent = "불러오지 못했어요";
    }
  }

  async function submit() {
    if (busy) return;
    var btn = $("withdrawBtn");
    var amount = Math.floor(Number($("amount").value) || 0);
    var bank = ($("bank").value || "").trim();
    var holder = ($("holder").value || "").trim();
    var account = ($("account").value || "").replace(/[^0-9]/g, "");

    if (!bank) return alert("은행을 선택해주세요.");
    if (!holder) return alert("예금주명을 입력해주세요.");
    if (!account) return alert("계좌번호를 숫자로 입력해주세요.");
    if (amount < 200000) return alert(REASONS.min_200000);
    if (avail != null && amount > avail) return alert("출금 가능 금액(₩" + fmt(avail) + ")보다 많아요.");

    busy = true;
    if (btn) btn.disabled = true;
    try {
      var res = await window.supabaseClient.rpc("request_withdrawal", {
        p_amount: amount, p_bank: bank, p_account: account, p_holder: holder
      });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) {
        if (d.reason === "insufficient") return alert("출금 가능 금액(₩" + fmt(d.available) + ")보다 많아요.");
        return alert(REASONS[d.reason] || "신청하지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
      alert("출금 신청이 접수됐어요.\n실제 송금은 결제(PG) 연동 후 시작되며, 진행 상황은 정산 내역에서 볼 수 있어요.");
      nav("settlement.html");
    } catch (e) {
      console.error("[withdraw]", e);
      alert("신청하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      busy = false;
      if (btn) btn.disabled = false;
    }
  }

  var running = false;
  async function init() {
    if (!$("withdrawBtn")) return;          // 이 페이지가 아니면 아무것도 안 한다
    if (running) return;
    running = true;
    try {
      $("withdrawBtn").onclick = submit;
      var sb = await waitSupabase();
      if (!sb) return;
      var sess = (await sb.auth.getSession()).data.session;
      if (!sess || !sess.user) {
        alert("로그인이 필요한 서비스입니다.");
        nav("login.html");
        return;
      }
      await loadAvail(sb);
    } finally {
      running = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})();
