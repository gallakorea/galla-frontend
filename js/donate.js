/* =========================================================
   💝 발의자 후원 (슈퍼챗형) — 실제 원화 후원. PG 연결 직전까지.
   - 티어 선택 + 메시지 → donate_begin(pending 생성) → 결제(PG 연동 예정)
   - 확정(paid)된 후원은 이슈에 슈퍼챗 카드로 표시 (issue_donations)
   - window.GALLA_initDonations(issue)
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient;
  const won = (n) => (n || 0).toLocaleString() + "원";

  // 최소 출금액 — DB의 request_withdrawal이 같은 값으로 강제한다(reason:'min_200000').
  // 여기 값을 바꾸면 DB도 함께 바꿔야 한다. 안 그러면 눌렀는데 거절되는 화면이 된다.
  const MIN_WITHDRAW = 200000;

  // 슈퍼챗 티어 (소액 중심 · 금액↑ = 강조↑)
  const TIERS = [
    { key: "blue",   amount: 500,   color: "#3b82f6", emoji: "💙" },
    { key: "sky",    amount: 1000,  color: "#22b8ff", emoji: "🩵" },
    { key: "teal",   amount: 2000,  color: "#17c3b2", emoji: "💠" },
    { key: "green",  amount: 3000,  color: "#2fbf71", emoji: "💚" },
    { key: "yellow", amount: 5000,  color: "#f5c518", emoji: "💛" },
    { key: "orange", amount: 10000, color: "#ff9f1c", emoji: "🧡" },
    { key: "red",    amount: 20000, color: "#ff4d6d", emoji: "❤️" },
  ];
  const MIN = 500;
  const tierLabel = (a) => a < 1000 ? a + "원" : a < 10000 ? (a / 1000) + "천" : (a / 10000) + "만";
  const COLOR = Object.fromEntries(TIERS.map(t => [t.key, t.color]));
  const tierColor = (k) => COLOR[k] || "#3b82f6";
  const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ago = (ts) => { if (!ts) return ""; const d = (Date.now() - new Date(ts).getTime()) / 1000;
    if (d < 3600) return Math.max(1, (d / 60) | 0) + "분 전"; if (d < 86400) return ((d / 3600) | 0) + "시간 전"; return ((d / 86400) | 0) + "일 전"; };

  function css() {
    if (document.getElementById("donate-css")) return;
    const s = document.createElement("style"); s.id = "donate-css";
    s.textContent = `
      .donate-dim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9998;opacity:0;pointer-events:none;transition:opacity .2s}
      .donate-dim.open{opacity:1;pointer-events:auto}
      .donate-sheet{position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#15161b;border-radius:20px 20px 0 0;
        border-top:1px solid rgba(255,255,255,.1);padding:16px 16px calc(16px + env(safe-area-inset-bottom));max-width:520px;margin:0 auto;
        transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1);max-height:88vh;overflow:auto}
      .donate-sheet.open{transform:translateY(0)}
      .ds-grip{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);margin:2px auto 12px}
      .ds-title{font-weight:900;font-size:17px;color:#fff;text-align:center}
      .ds-sub{font-size:12.5px;color:#8a8f9a;text-align:center;margin:4px 0 16px}
      .ds-tiers{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
      .ds-tier{border:2px solid rgba(255,255,255,.12);background:#1c1d23;border-radius:14px;padding:10px 4px;cursor:pointer;text-align:center;transition:.12s}
      .ds-tier .e{font-size:20px;line-height:1}
      .ds-tier .a{font-size:12px;font-weight:800;color:#e7ebf3;margin-top:4px}
      .ds-tier.on{transform:translateY(-2px)}
      .ds-custom{display:flex;align-items:center;gap:8px;background:#0f1014;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:0 12px;margin-bottom:12px}
      .ds-custom input{flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:800;padding:13px 0;font-family:inherit;text-align:right}
      .ds-custom input:focus{outline:none}
      .ds-custom .u{color:#8a8f9a;font-weight:800}
      .ds-msg{width:100%;background:#0f1014;border:1px solid rgba(255,255,255,.12);border-radius:12px;color:#fff;
        padding:12px;font-size:14px;font-family:inherit;resize:none;margin-bottom:10px}
      .ds-msg:focus{outline:none;border-color:#5b8cff}
      .ds-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;font-size:13px;color:#c9d1e0}
      .ds-anon{display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none}
      .ds-break{font-size:12px;color:#8a8f9a}
      .ds-break b{color:#c9d1e0}
      .ds-go{width:100%;padding:15px;border:none;border-radius:14px;font-weight:900;font-size:16px;color:#fff;cursor:pointer}
      .ds-go:disabled{opacity:.5}
      .ds-note{font-size:11px;color:#6c7280;text-align:center;margin-top:10px;line-height:1.5}
      .ds-note .earn-more{display:block;margin-top:6px;color:#6b8cff;font-weight:800;text-decoration:none}
      .ds-gc{font-size:12px;font-weight:700;color:#e8d9a8;background:rgba(255,207,63,.08);
        border:1px solid rgba(255,207,63,.3);border-radius:10px;padding:9px 12px;margin-bottom:10px;text-align:center}
      .ds-gc b{color:#ffcf3f}
      .ds-done{text-align:center;padding:16px 8px}
      .ds-done .ic{font-size:40px}
      .ds-done h4{font-size:17px;font-weight:900;color:#fff;margin:10px 0 6px}
      .ds-done p{font-size:13px;color:#9aa0ad;line-height:1.6}

      /* 이슈 후원 섹션 */
      .donate-section{padding:14px 16px}
      .donate-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
      .donate-title{font-weight:900;font-size:15px;color:#fff}
      .donate-total{font-size:12.5px;font-weight:800;color:#c9d1e0}
      .donate-desc{font-size:12.5px;color:#8a8f9a;margin:0 0 12px;line-height:1.5}
      .donate-cta{width:100%;padding:13px;border:none;border-radius:14px;font-weight:900;font-size:15px;cursor:pointer;
        background:linear-gradient(135deg,#ff6a88,#ff4d6d);color:#fff;box-shadow:0 6px 20px rgba(255,77,109,.28)}
      .donate-list{display:flex;flex-direction:column;gap:8px;margin-top:14px}
      .sc-card{border-radius:14px;padding:11px 13px;color:#fff}
      .sc-top{display:flex;align-items:center;gap:8px;margin-bottom:2px}
      .sc-name{font-weight:800;font-size:13px;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .sc-amt{font-weight:900;font-size:13px;background:rgba(0,0,0,.22);padding:2px 8px;border-radius:99px;white-space:nowrap}
      .sc-time{font-size:11px;opacity:.75}
      .sc-msg{font-size:14px;line-height:1.4;margin-top:4px;word-break:break-word}
      .sc-empty{color:#8a8f9a;font-size:13px;text-align:center;padding:14px}
    `;
    document.head.appendChild(s);
  }

  // ── 후원 시트 ──
  let dim, sheet, sel = null, cur = null; // cur = {issueId, creatorName}
  let GC_BAL = 0;   // 갈라코인 잔액 (후원 전용 현금성 재화 — GP와 상호 전환 불가)
  async function loadGc() {
    try { const { data } = await sb().rpc("gc_balance"); GC_BAL = data || 0; } catch { GC_BAL = 0; }
  }
  function build() {
    if (sheet) return;
    css();
    dim = document.createElement("div"); dim.className = "donate-dim";
    sheet = document.createElement("div"); sheet.className = "donate-sheet";
    document.body.appendChild(dim); document.body.appendChild(sheet);
    dim.addEventListener("click", close);
  }
  function amount() {
    const c = sheet.querySelector("#ds-amt");
    const v = c ? parseInt(String(c.value).replace(/[^\d]/g, "") || "0") : 0;
    return v;
  }
  function refreshGo() {
    const a = amount(); const go = sheet.querySelector("#ds-go");
    const br = sheet.querySelector("#ds-break");
    const ok = a >= MIN;
    const t = TIERS.slice().reverse().find(t => a >= t.amount) || TIERS[0];
    const col = ok ? t.color : "#3a3b42";
    if (go) { go.style.background = `linear-gradient(135deg, ${col}, ${col}cc)`; go.disabled = !ok;
      go.textContent = ok ? `${won(a)} 후원하기` : `최소 ${won(MIN)}부터`; }
    if (br) { const fee = Math.floor(a * 0.2), charity = Math.floor(a * 0.05), net = a - fee - charity;
      br.innerHTML = ok
        ? `발의자 <b>${won(net)}</b> · 기부 <b>${won(charity)}</b> · 수수료 ${won(fee)}` : ""; }
  }
  function renderForm() {
    sheet.innerHTML = `
      <div class="ds-grip"></div>
      <div class="ds-title">💝 ${A(cur.creatorName || "발의자")} 후원</div>
      <div class="ds-sub">☕ 커피 한 잔값으로도 응원할 수 있어요 · 메시지도 함께 전달됩니다</div>
      <div class="ds-tiers">${TIERS.map(t => `
        <button class="ds-tier" data-amt="${t.amount}" style="--c:${t.color}">
          <div class="e">${t.emoji}</div><div class="a">${tierLabel(t.amount)}</div>
        </button>`).join("")}</div>
      <div class="ds-custom"><input id="ds-amt" inputmode="numeric" placeholder="직접 입력" value=""><span class="u">원</span></div>
      <textarea class="ds-msg" id="ds-msg" rows="2" maxlength="200" placeholder="응원 메시지 (선택 · 최대 200자)"></textarea>
      <div class="ds-row">
        <label class="ds-anon"><input type="checkbox" id="ds-anon"> 익명으로 후원</label>
        <span class="ds-break" id="ds-break"></span>
      </div>
      <div class="ds-gc" id="ds-gc" ${GC_BAL > 0 ? "" : "hidden"}>🪙 내 갈라코인 <b>${GC_BAL.toLocaleString()}</b> GC — 잔액만큼 즉시 후원됩니다</div>
      <button class="ds-go" id="ds-go" disabled>최소 ${won(MIN)}부터</button>
      <div class="ds-note">후원의 <b>75%는 발의자</b>에게, <b>5%는 기부</b>됩니다(수수료 20%).
        결제는 <b>갈라코인(GC)</b>으로 하며 1GC=1원, 현금으로만 구매됩니다.
        갈라포인트(GP)는 환급·양도 불가 놀이 재화로 후원에 사용할 수 없고, GP↔GC 전환은 불가능합니다.
        <a href="creator.html" class="earn-more">이 돈은 어디로 가나요? ›</a></div>`;
    sheet.querySelectorAll(".ds-tier").forEach(b => {
      b.style.borderColor = "rgba(255,255,255,.12)";
      b.addEventListener("click", () => {
        sheet.querySelectorAll(".ds-tier").forEach(x => { x.classList.remove("on"); x.style.borderColor = "rgba(255,255,255,.12)"; });
        b.classList.add("on"); b.style.borderColor = b.style.getPropertyValue("--c");
        sheet.querySelector("#ds-amt").value = (+b.dataset.amt).toLocaleString();
        refreshGo();
      });
    });
    sheet.querySelector("#ds-amt").addEventListener("input", () => {
      sheet.querySelectorAll(".ds-tier").forEach(x => { x.classList.remove("on"); x.style.borderColor = "rgba(255,255,255,.12)"; });
      refreshGo();
    });
    sheet.querySelector("#ds-go").addEventListener("click", submit);
    // 소액 유도 — 1천원 기본 선택
    const def = sheet.querySelector('.ds-tier[data-amt="1000"]');
    if (def) def.click(); else refreshGo();
  }
  async function submit() {
    const a = amount(); if (a < 1000) return;
    const msg = sheet.querySelector("#ds-msg").value.trim();
    const anon = sheet.querySelector("#ds-anon").checked;
    const go = sheet.querySelector("#ds-go"); go.disabled = true; go.textContent = "처리 중…";

    // 대상: 이슈 or 광장 글 — RPC/인자만 다르고 정책(20/50/30)은 동일
    const isPlaza = !!cur.plazaId;
    const args = isPlaza
      ? { p_post_id: cur.plazaId, p_amount: a, p_message: msg, p_anonymous: anon }
      : { p_issue_id: cur.issueId, p_amount: a, p_message: msg, p_anonymous: anon };

    // ① GC 잔액이 충분하면 갈라코인으로 즉시 후원 (표준 경로)
    if (GC_BAL >= a) {
      const { data, error } = await sb().rpc(isPlaza ? "gc_donate_plaza" : "gc_donate", args);
      if (error || !data?.ok) {
        const reason = data?.reason;
        alert(reason === "self" ? "본인이 쓴 글은 후원할 수 없어요." :
              reason === "unauthorized" ? "로그인이 필요해요." :
              reason === "insufficient" ? "갈라코인 잔액이 부족해요." : "후원에 실패했어요.");
        go.disabled = false; refreshGo(); return;
      }
      GC_BAL = data.balance ?? (GC_BAL - a);
      window.BattleFX?.haptic?.("tap");
      if (window.GALLA_FX) window.GALLA_FX.confetti({ count: 60 });
      sheet.innerHTML = `
        <div class="ds-grip"></div>
        <div class="ds-done">
          <div class="ic">💝</div>
          <h4>후원 완료!</h4>
          <p>${won(a)}가 갈라코인으로 전달됐어요.<br>
          ${isPlaza ? "작성자" : "발의자"} <b>${won(data.net)}</b> · 기부 <b>${won(data.charity)}</b><br>
          남은 갈라코인 ${GC_BAL.toLocaleString()} GC</p>
        </div>
        <button class="ds-go" id="ds-close" style="background:#2a2b31">닫기</button>`;
      sheet.querySelector("#ds-close").addEventListener("click", close);
      // 슈퍼챗 목록 즉시 갱신
      if (isPlaza) window.GALLA_renderPlazaDonations?.(cur.plazaId);
      else renderList(cur.issueId);
      return;
    }

    // ② GC 부족 — 건별 결제(pending, PG 연동 예정)
    const { data, error } = await sb().rpc(isPlaza ? "plaza_donate_begin" : "donate_begin", args);
    if (error || !data?.ok) {
      const reason = data?.reason;
      alert(reason === "self" ? "본인이 쓴 글은 후원할 수 없어요." :
            reason === "unauthorized" ? "로그인이 필요해요." : "후원 준비에 실패했어요.");
      go.disabled = false; refreshGo(); return;
    }
    // PG 연동 전 — 결제 준비 완료 안내
    window.BattleFX?.haptic?.("tap");
    sheet.innerHTML = `
      <div class="ds-grip"></div>
      <div class="ds-done">
        <div class="ic">💳</div>
        <h4>후원이 준비되었습니다</h4>
        <p>${won(a)} 후원 요청이 접수됐어요.<br>
        갈라코인 충전·간편결제 연동이 완료되면<br>결제 후 발의자에게 전달됩니다. <b>(PG 연동 예정)</b></p>
      </div>
      <button class="ds-go" id="ds-close" style="background:#2a2b31">닫기</button>`;
    sheet.querySelector("#ds-close").addEventListener("click", close);
  }
  async function openWith(c) {
    build(); cur = c;
    await loadGc();
    renderForm();
    dim.classList.add("open");
    requestAnimationFrame(() => sheet.classList.add("open"));
  }
  async function open(issueId, creatorName) { return openWith({ issueId, creatorName }); }
  function close() {
    sheet?.classList.remove("open"); dim?.classList.remove("open");
  }
  window.openDonate = open;
  // 광장 작성자 응원 — 같은 시트, plaza RPC 사용
  window.openDonatePlaza = (postId, creatorName) => openWith({ plazaId: postId, creatorName });

  // ── 슈퍼챗 목록 렌더 + 버튼 배선 ──
  async function renderList(issueId) {
    const list = document.getElementById("donate-list");
    const totalEl = document.getElementById("donate-total");
    if (!list) return;
    const { data } = await sb().rpc("issue_donations", { p_issue_id: issueId });
    const rows = data?.rows || [];
    if (totalEl) totalEl.textContent = data?.count ? `총 ${won(data.total)} · ${data.count}명` : "";
    if (!rows.length) { list.innerHTML = `<div class="sc-empty">첫 후원의 주인공이 되어보세요 💝</div>`; return; }
    list.innerHTML = rows.map(r => {
      const c = tierColor(r.tier);
      return `<div class="sc-card" style="background:linear-gradient(135deg, ${c}, ${c}cc)">
        <div class="sc-top">
          <span class="sc-name">${A(r.name)}</span>
          <span class="sc-amt">${won(r.amount)}</span>
        </div>
        ${r.message ? `<div class="sc-msg">${A(r.message)}</div>` : ""}
        <div class="sc-time">${ago(r.created_at)}</div>
      </div>`;
    }).join("");
  }

  // ── 마이페이지: 발의자 후원 수익 카드 + 출금 신청 ──
  function earnCss() {
    if (document.getElementById("earn-css")) return;
    const s = document.createElement("style"); s.id = "earn-css";
    s.textContent = `
      .earn-card{margin:0 16px 14px;background:linear-gradient(135deg,#1a1420,#15161b);border:1px solid rgba(255,77,109,.25);border-radius:16px;padding:15px}
      .earn-h{display:flex;align-items:center;gap:6px;font-weight:900;font-size:14px;color:#fff;margin-bottom:12px}
      .earn-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px}
      .earn-b{background:#0f1014;border-radius:12px;padding:10px 8px;text-align:center}
      .earn-v{font-size:16px;font-weight:900;color:#fff}
      .earn-v.hot{color:#ff6a88}
      .earn-l{font-size:11px;color:#8a8f9a;margin-top:3px}
      .earn-out{width:100%;padding:12px;border:none;border-radius:12px;font-weight:900;font-size:14px;cursor:pointer;background:linear-gradient(135deg,#ff6a88,#ff4d6d);color:#fff}
      .earn-out:disabled{opacity:.5}
      .earn-note{font-size:11px;color:#6c7280;text-align:center;margin-top:9px;line-height:1.6}
      .earn-more{display:inline-block;margin-top:4px;color:#6b8cff;font-weight:800;text-decoration:none}
    `;
    document.head.appendChild(s);
  }
  window.GALLA_renderEarnings = async function () {
    const sec = document.getElementById("mp-earnings");
    if (!sec) return;
    const { data } = await sb().rpc("my_creator_earnings");
    if (!data?.ok || (!data.total_net && !data.supporter_count)) { sec.hidden = true; return; }
    earnCss();
    sec.innerHTML = `
      <div class="earn-card">
        <div class="earn-h">💝 발의자 후원 수익</div>
        <div class="earn-grid">
          <div class="earn-b"><div class="earn-v hot">${won(data.total_net)}</div><div class="earn-l">누적 정산액</div></div>
          <div class="earn-b"><div class="earn-v">${won(data.available)}</div><div class="earn-l">출금 가능</div></div>
          <div class="earn-b"><div class="earn-v">${data.supporter_count}명</div><div class="earn-l">후원자</div></div>
        </div>
        <button class="earn-out" id="earn-out" ${data.available < MIN_WITHDRAW ? "disabled" : ""}>${data.available < MIN_WITHDRAW ? "출금 최소 20만원" : "출금 신청"}</button>
        <div class="earn-note">후원금의 75%가 발의자에게 정산됩니다(기부 5%·수수료 20% 제외).
          <a href="creator.html" class="earn-more">수익 배분 자세히 ›</a></div>
      </div>`;
    const btn = sec.querySelector("#earn-out");
    if (btn && data.available >= MIN_WITHDRAW) btn.addEventListener("click", async () => {
      const bank = prompt("은행명 (예: 국민은행)"); if (!bank) return;
      const acc = prompt("계좌번호"); if (!acc) return;
      const holder = prompt("예금주"); if (!holder) return;
      const amt = parseInt((prompt(`출금 금액 (최대 ${won(data.available)})`, String(data.available)) || "").replace(/[^\d]/g, ""));
      if (!amt || amt < MIN_WITHDRAW) return alert("최소 20만원부터 출금할 수 있어요.");
      const { data: r } = await sb().rpc("request_withdrawal", { p_amount: amt, p_bank: bank, p_account: acc, p_holder: holder });
      if (r?.ok) { alert("출금 신청이 접수됐어요. 검토 후 처리됩니다."); window.GALLA_renderEarnings(); }
      else alert(r?.reason === "insufficient" ? "출금 가능액을 초과했어요."
        : r?.reason === "min_200000" ? "최소 20만원부터 출금할 수 있어요."
        : "출금 신청에 실패했어요.");
    });
    sec.hidden = false;
  };

  window.GALLA_initDonations = async function (issue) {
    if (!issue?.id) return;
    css();
    const btn = document.getElementById("donate-btn");
    let me = null; try { me = (await sb().auth.getUser())?.data?.user?.id; } catch (e) {}
    const isOwner = me && issue.user_id && me === issue.user_id;
    if (btn) {
      if (isOwner) { btn.textContent = "🙌 내가 발의한 이슈예요"; btn.disabled = true; btn.style.opacity = ".6"; }
      else {
        const name = document.getElementById("issue-author")?.textContent?.replace(/·.*$/, "").trim() || "발의자";
        btn.addEventListener("click", async () => {
          if (window.GALLA_requireLogin && !(await window.GALLA_requireLogin("로그인 후 후원할 수 있어요."))) return;
          open(issue.id, name);
        });
      }
    }
    renderList(issue.id);
  };
})();
