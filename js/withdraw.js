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

  /* 📱 3단계 관문 — 출금은 휴대폰 확인 뒤에만(26.9.18 사장님: 단계별 가입).
     가입 땐 안 묻고, 돈을 받으려는 순간에 이유와 함께 묻는다. 서버(request_withdrawal)도 need_phone 으로 막는다.
     확인 수단 = 네이버·카카오 계정에 등록된 번호(무료, 엣지 phone-verify). 문자·본인인증은 건당 비용이라 뒤로 미뤘다.
     앱: 인앱 브라우저로 동의 → im.galla.app://verify-done 로 복귀(또는 사용자가 닫음) → 상태를 다시 읽는다.
     웹: 같은 탭에서 동의 → withdraw.html?pv=ok|fail 로 복귀. */
  var PV_REASON = {
    no_phone: "번호를 받지 못했어요. 동의 화면에서 「휴대전화번호」를 허용해 주세요.",
    phone_taken: "이미 다른 계정에서 확인한 번호예요. 한 번호로 한 계정만 수익을 받을 수 있어요.",
    cancel: "확인을 취소했어요.", access_denied: "확인을 취소했어요.",
    state: "확인 시간이 지났어요. 다시 시도해 주세요.", token: "확인에 실패했어요. 다시 시도해 주세요."
  };
  function isApp() { try { return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()); } catch (_) { return false; } }
  function gateHTML(msg, bad) {
    return '<div class="wd-gate">' +
      '<div class="wd-gate-ic"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/><path d="M9.5 10.5l2 2 3.5-4"/></svg></div>' +
      '<div class="wd-gate-t">수익을 받으려면 휴대폰 확인이 필요해요</div>' +
      '<ul class="wd-gate-l">' +
        '<li><b>내 계좌로만</b> — 확인한 이름과 예금주가 같아야 송금돼요</li>' +
        '<li><b>남이 못 빼가게</b> — 계정을 도둑맞아도 수익은 안전해요</li>' +
        '<li><b>한 번호 한 계정</b> — 수익을 쪼개 받는 부정을 막아요</li>' +
      '</ul>' +
      '<button type="button" class="wd-gate-btn wd-naver" data-pv="naver"><b>N</b> 네이버로 확인</button>' +
      '<button type="button" class="wd-gate-btn wd-kakao" data-pv="kakao"><b>K</b> 카카오로 확인</button>' +
      '<div class="wd-gate-s' + (bad ? ' bad' : '') + '" id="wdVerifyMsg">' + (msg || "네이버·카카오에 등록된 번호로 10초면 끝나요 · 번호는 정산 확인에만 써요") + '</div>' +
    '</div>';
  }
  async function startPV(sb, prov) {
    var msg = $("wdVerifyMsg");
    function say(t, bad) { if (msg) { msg.textContent = t; msg.classList.toggle("bad", !!bad); } }
    var app = isApp();
    say("여는 중…");
    var res = await sb.functions.invoke("phone-verify", { body: { action: "authorize", provider: prov, return: app ? "app" : "web" } });
    var d = res.data || {};
    if (!d.ok || !d.url) {
      say(/not_configured/.test(d.reason || "") ? (prov === "kakao" ? "카카오" : "네이버") + " 확인은 준비 중이에요 — 다른 쪽으로 해 주세요." : "시작하지 못했어요. 잠시 후 다시 시도해 주세요.", true);
      return;
    }
    if (app) {
      var C = window.Capacitor.Plugins || {};
      var recheck = function () { refreshGate(sb); };
      try {
        if (C.Browser && !window.__wdPvHooked) {
          window.__wdPvHooked = true;
          C.Browser.addListener("browserFinished", recheck);
          C.App && C.App.addListener("appUrlOpen", function (ev) {
            var u = (ev && ev.url) || "";
            if (u.indexOf("verify-done") < 0) return;
            try { C.Browser.close(); } catch (_) {}
            var m = /[?&]pv=(\w+)/.exec(u), r = /[?&]r=([^&]+)/.exec(u);
            if (m && m[1] !== "ok") { var g = $("wdGateBox"); if (g) { g.innerHTML = gateHTML(PV_REASON[r && decodeURIComponent(r[1])] || "확인하지 못했어요. 다시 시도해 주세요.", true); bindGate(sb); } }
            recheck();
          });
        }
        await C.Browser.open({ url: d.url, presentationStyle: "popover" });
      } catch (_) { location.href = d.url; }
      return;
    }
    location.href = d.url;
  }
  async function refreshGate(sb) {
    var v = (await sb.rpc("my_verification")).data || {};
    if (v.phone_verified) { showForm(); (window.GALLA_toast || alert)("휴대폰 확인 완료 — 이제 출금할 수 있어요"); }
  }
  function bindGate(sb) {
    document.querySelectorAll("#wdGateBox [data-pv]").forEach(function (b) {
      b.onclick = function () { startPV(sb, b.dataset.pv); };
    });
  }
  function formSection() { var b = $("withdrawBtn"); return b && b.closest("section"); }
  function showGate(sb, msg, bad) {
    var sec = formSection(); if (!sec) return;
    var g = $("wdGateBox");
    if (!g) { g = document.createElement("div"); g.id = "wdGateBox"; sec.parentNode.insertBefore(g, sec); }
    g.innerHTML = gateHTML(msg, bad); g.hidden = false; sec.hidden = true;
    bindGate(sb);
  }
  function showForm() {
    var g = $("wdGateBox"); if (g) g.hidden = true;
    var sec = formSection(); if (sec) sec.hidden = false;
  }

  var REASONS = {
    need_phone: "출금하려면 먼저 휴대폰 확인을 해 주세요.",
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
      /* 인증 여부 — 안 됐으면 입력란 대신 관문 카드. 모바일 리다이렉트로 돌아온 경우(?iv=)는 바로 확인한다. */
      var q = new URLSearchParams(location.search), pv = q.get("pv");
      var v = (await sb.rpc("my_verification")).data || {};
      if (!v.phone_verified) {
        showGate(sb, pv === "fail" ? (PV_REASON[q.get("r")] || "확인하지 못했어요. 다시 시도해 주세요.") : "", pv === "fail");
      } else {
        showForm();
        if (pv === "ok") (window.GALLA_toast || alert)("휴대폰 확인 완료 — 이제 출금할 수 있어요");
      }
    } finally {
      running = false;
    }
  }

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") init();
})();
