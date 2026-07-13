/* =========================================================
   🐞 버그 신고 — 전역 모달 window.GALLA_openBugReport()
   - 익명·로그인 모두 제출(submit_bug RPC, user_id 자동)
   - 현재 페이지·기기·뷰포트·앱버전 자동 첨부
   ========================================================= */
(function () {
  const APPV = (function () {
    const s = [...document.scripts].map((x) => x.src).find((u) => /[?&]v=/.test(u));
    return s ? ((s.match(/[?&]v=([^&]+)/) || [])[1] || "") : "";
  })();
  const sb = () => window.supabaseClient || (window.supabase && window.supabase.from ? window.supabase : null);

  function toast(msg) {
    let t = document.getElementById("bugr-toast");
    if (!t) { t = document.createElement("div"); t.id = "bugr-toast"; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2600);
  }

  function css() {
    if (document.getElementById("bugr-css")) return;
    const s = document.createElement("style"); s.id = "bugr-css";
    s.textContent =
      ".bugr-dim{position:fixed;inset:0;z-index:2147483400;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);display:flex;align-items:flex-end;justify-content:center;opacity:0;transition:opacity .2s;padding:0 0 max(0px,env(safe-area-inset-bottom))}" +
      ".bugr-dim.open{opacity:1}" +
      ".bugr-card{width:100%;max-width:480px;background:linear-gradient(180deg,#16171d,#101116);border:1px solid rgba(255,255,255,.1);border-radius:20px 20px 0 0;padding:20px 18px calc(18px + env(safe-area-inset-bottom));transform:translateY(24px);transition:transform .24s cubic-bezier(.2,.9,.3,1)}" +
      ".bugr-dim.open .bugr-card{transform:none}" +
      ".bugr-tt{font-size:17px;font-weight:900;color:#f3f4f6;display:flex;align-items:center;gap:7px}" +
      ".bugr-sb{font-size:12.5px;color:#9aa0ad;margin:5px 0 14px;line-height:1.5}" +
      ".bugr-ta{width:100%;box-sizing:border-box;min-height:120px;resize:vertical;background:#0e0f13;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px;color:#f3f4f6;font-size:14px;line-height:1.5;font-family:inherit}" +
      ".bugr-ta:focus{outline:none;border-color:#6f86ff}" +
      ".bugr-ctx{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 2px}" +
      ".bugr-chip{font-size:11px;color:#9aa0ad;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:99px;padding:3px 9px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
      ".bugr-btns{display:flex;gap:8px;margin-top:14px}" +
      ".bugr-btns button{flex:1;padding:13px;border:none;border-radius:12px;font-weight:800;font-size:14px;cursor:pointer}" +
      ".bugr-cancel{background:rgba(255,255,255,.07);color:#c9d1e0}" +
      ".bugr-go{background:linear-gradient(135deg,#6a7bff,#3a5bff);color:#fff}" +
      ".bugr-go:disabled{opacity:.5}" +
      "#bugr-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%) translateY(10px);z-index:2147483500;background:#16171c;border:1px solid rgba(255,255,255,.12);color:#eef0f4;font-weight:800;font-size:13px;padding:11px 18px;border-radius:99px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;pointer-events:none;transition:opacity .2s,transform .2s}" +
      "#bugr-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}";
    document.head.appendChild(s);
  }

  window.GALLA_openBugReport = function (prefillPage) {
    css();
    const page = prefillPage || location.href;
    const dev = (navigator.userAgent.match(/(iPhone|iPad|Android|Macintosh|Windows)[^);]*/) || ["기기정보"])[0];
    const dim = document.createElement("div"); dim.className = "bugr-dim";
    dim.innerHTML =
      '<div class="bugr-card" role="dialog" aria-modal="true">' +
      '<div class="bugr-tt">🐞 버그 신고</div>' +
      '<div class="bugr-sb">불편했던 점이나 오류를 알려주세요. 어디서 무엇을 하다 생겼는지 적어주시면 큰 도움이 됩니다.</div>' +
      '<textarea class="bugr-ta" placeholder="예) 광장에서 글을 열었더니 화면이 깨졌어요. / 예측 공유 버튼이 안 눌려요."></textarea>' +
      '<div class="bugr-ctx">' +
      '<span class="bugr-chip">📍 ' + page.replace(/^https?:\/\//, "").slice(0, 60) + '</span>' +
      '<span class="bugr-chip">📱 ' + dev.slice(0, 40) + '</span>' +
      '<span class="bugr-chip">🖥 ' + window.innerWidth + '×' + window.innerHeight + '</span>' +
      '</div>' +
      '<div class="bugr-btns">' +
      '<button class="bugr-cancel" type="button">닫기</button>' +
      '<button class="bugr-go" type="button">신고 보내기</button>' +
      '</div></div>';
    document.body.appendChild(dim);
    const ta = dim.querySelector(".bugr-ta"), go = dim.querySelector(".bugr-go");
    const close = () => { dim.classList.remove("open"); setTimeout(() => dim.remove(), 200); };
    dim.addEventListener("click", (e) => { if (e.target === dim || e.target.classList.contains("bugr-cancel")) close(); });
    go.addEventListener("click", async () => {
      const msg = ta.value.trim();
      if (msg.length < 4) { ta.focus(); toast("조금만 더 자세히 적어주세요"); return; }
      go.disabled = true; go.textContent = "보내는 중…";
      try {
        const c = sb();
        if (!c) throw new Error("no client");
        const { error } = await c.rpc("submit_bug", {
          p_message: msg, p_page_url: page, p_user_agent: navigator.userAgent,
          p_viewport: window.innerWidth + "x" + window.innerHeight, p_app_version: APPV,
        });
        if (error) throw error;
        close(); toast("신고 접수됐어요. 감사합니다! 🙏");
      } catch (e) {
        go.disabled = false; go.textContent = "신고 보내기";
        toast("전송 실패 — 잠시 후 다시 시도해주세요");
      }
    });
    requestAnimationFrame(() => { dim.classList.add("open"); ta.focus(); });
  };
})();
