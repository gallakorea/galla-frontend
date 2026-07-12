/* =========================================================
   ⚔️ 진영 밀어주기 — GP로 진영 전황에 힘싣기 (자체 완결)
   - 투표 바로 아래 "진영 액션". 발의자 후원(현금)과 명확히 분리(GP 소비)
   - push_faction(GP 차감) · GP 부족 → 충전 유도
   - window.GALLA_initFaction(issue)
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient;
  const gp = (n) => (n || 0).toLocaleString() + " GP";
  const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const TIERS = [100, 500, 1000, 3000, 10000];

  let issue = null, faA = "찬성", faB = "반대";

  function css() {
    if (document.getElementById("fac-css")) return;
    const s = document.createElement("style"); s.id = "fac-css";
    s.textContent = `
      .faction-section{padding:14px 16px}
      .fac-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:4px}
      .fac-title{font-weight:900;font-size:15px;color:#fff}
      .fac-mine{font-size:12px;font-weight:800;color:#f5cf6b}
      .fac-desc{font-size:12.5px;color:#8a8f9a;margin:0 0 12px;line-height:1.5}
      .fac-bar{display:flex;height:12px;border-radius:99px;overflow:hidden;background:#20222a}
      .fac-pro{background:linear-gradient(90deg,#3d6bff,#5b8cff)}
      .fac-con{background:linear-gradient(90deg,#ff6a5b,#ff4d6d)}
      .fac-amts{display:flex;justify-content:space-between;margin:7px 1px 12px;font-size:12.5px;font-weight:800}
      .fac-amts .pro{color:#7fa0ff}.fac-amts .con{color:#ff8f9c}
      .fac-btns{display:flex;gap:10px}
      .fac-btn{flex:1;padding:13px;border:none;border-radius:13px;font-weight:900;font-size:14px;cursor:pointer;color:#fff}
      .fac-btn.pro{background:linear-gradient(135deg,#3d6bff,#5b8cff)}
      .fac-btn.con{background:linear-gradient(135deg,#ff5b6e,#ff4d6d)}
      .fac-btn:active{transform:scale(.98)}

      .fac-dim{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9990;opacity:0;transition:opacity .2s}
      .fac-dim.open{opacity:1}
      .fac-sheet{position:fixed;left:0;right:0;bottom:0;z-index:9991;background:#15161b;border-radius:20px 20px 0 0;
        border-top:1px solid rgba(255,255,255,.1);padding:16px 16px calc(16px + env(safe-area-inset-bottom));max-width:520px;margin:0 auto;
        transform:translateY(100%);transition:transform .26s cubic-bezier(.2,.8,.2,1)}
      .fac-sheet.open{transform:translateY(0)}
      .fac-grip{width:38px;height:4px;border-radius:2px;background:rgba(255,255,255,.25);margin:2px auto 12px}
      .fac-s-title{font-weight:900;font-size:17px;color:#fff;text-align:center}
      .fac-s-sub{font-size:12.5px;color:#8a8f9a;text-align:center;margin:5px 0 14px}
      .fac-tiers{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}
      .fac-tier{border:2px solid rgba(255,255,255,.12);background:#1c1d23;border-radius:12px;padding:12px 4px;cursor:pointer;
        text-align:center;font-weight:900;font-size:14px;color:#e7ebf3}
      .fac-tier.on{border-color:var(--c)}
      .fac-custom{display:flex;align-items:center;gap:8px;background:#0f1014;border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:0 12px;margin-bottom:12px}
      .fac-custom input{flex:1;background:none;border:none;color:#fff;font-size:16px;font-weight:800;padding:13px 0;font-family:inherit;text-align:right}
      .fac-custom input:focus{outline:none}.fac-custom .u{color:#8a8f9a;font-weight:800}
      .fac-go{width:100%;padding:14px;border:none;border-radius:13px;font-weight:900;font-size:15px;color:#fff;cursor:pointer}
      .fac-go:disabled{opacity:.5}
      .fac-note{font-size:11px;color:#6c7280;text-align:center;margin-top:10px;line-height:1.5}
    `;
    document.head.appendChild(s);
  }

  function render(d) {
    const sec = document.getElementById("faction-section"); if (!sec) return;
    const pro = +(d?.pro || 0), con = +(d?.con || 0), total = pro + con || 1;
    const pct = Math.round(pro / total * 100);
    sec.innerHTML = `
      <div class="fac-head"><span class="fac-title">⚔️ 진영 밀어주기</span>${d?.mine ? `<span class="fac-mine">내 기여 ${gp(d.mine)}</span>` : ""}</div>
      <div class="fac-desc">GP를 실어 내 진영의 전황을 밀어붙이세요. 발의자 후원과 별개인 <b>GP 소비</b> 액션입니다.</div>
      <div class="fac-bar"><div class="fac-pro" style="width:${pro ? pct : 50}%"></div><div class="fac-con" style="width:${con ? 100 - pct : 50}%"></div></div>
      <div class="fac-amts"><span class="pro">👍 ${A(faA)} ${gp(pro)}</span><span class="con">${gp(con)} ${A(faB)} 👎</span></div>
      <div class="fac-btns">
        <button class="fac-btn pro" data-side="pro">👍 힘싣기</button>
        <button class="fac-btn con" data-side="con">👎 힘싣기</button>
      </div>`;
    sec.querySelectorAll(".fac-btn").forEach(b => b.addEventListener("click", () => openPicker(b.dataset.side)));
  }
  async function load() {
    if (!issue?.id) return;
    const { data } = await sb().rpc("issue_faction", { p_issue_id: issue.id });
    render(data);
  }

  // ── GP 금액 선택 시트 ──
  let dim, sheet, curSide = "pro";
  function build() {
    if (sheet) return; css();
    dim = document.createElement("div"); dim.className = "fac-dim";
    sheet = document.createElement("div"); sheet.className = "fac-sheet";
    document.body.appendChild(dim); document.body.appendChild(sheet);
    dim.addEventListener("click", close);
  }
  function pickAmt() { const c = sheet.querySelector("#fac-amt"); return c ? parseInt(String(c.value).replace(/[^\d]/g, "") || "0") : 0; }
  function refresh() {
    const a = pickAmt(), go = sheet.querySelector("#fac-go");
    const col = curSide === "pro" ? "#5b8cff" : "#ff4d6d";
    go.style.background = `linear-gradient(135deg, ${col}, ${col}cc)`;
    go.disabled = a < 100; go.textContent = a >= 100 ? `${gp(a)} 힘싣기` : "최소 100 GP";
  }
  function openPicker(side) {
    build(); curSide = side;
    const col = side === "pro" ? "#5b8cff" : "#ff4d6d";
    const name = side === "pro" ? faA : faB;
    sheet.innerHTML = `
      <div class="fac-grip"></div>
      <div class="fac-s-title">${side === "pro" ? "👍" : "👎"} ${A(name)} 진영에 힘싣기</div>
      <div class="fac-s-sub">실은 GP만큼 진영 전황·노출 가중치가 올라가요</div>
      <div class="fac-tiers">${TIERS.map(t => `<button class="fac-tier" data-amt="${t}" style="--c:${col}">${gp(t)}</button>`).join("")}</div>
      <div class="fac-custom"><input id="fac-amt" inputmode="numeric" placeholder="직접 입력"><span class="u">GP</span></div>
      <button class="fac-go" id="fac-go" disabled>최소 100 GP</button>
      <div class="fac-note">밀어주기는 GP를 소비합니다(환급·현금화 없음). GP가 부족하면 충전할 수 있어요.</div>`;
    sheet.querySelectorAll(".fac-tier").forEach(b => b.addEventListener("click", () => {
      sheet.querySelectorAll(".fac-tier").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); sheet.querySelector("#fac-amt").value = (+b.dataset.amt).toLocaleString(); refresh();
    }));
    sheet.querySelector("#fac-amt").addEventListener("input", () => {
      sheet.querySelectorAll(".fac-tier").forEach(x => x.classList.remove("on")); refresh();
    });
    sheet.querySelector("#fac-go").addEventListener("click", push);
    refresh();
    dim.classList.add("open"); requestAnimationFrame(() => sheet.classList.add("open"));
  }
  function close() { sheet?.classList.remove("open"); dim?.classList.remove("open"); }
  async function push() {
    const a = pickAmt(); if (a < 100) return;
    const go = sheet.querySelector("#fac-go"); go.disabled = true; go.textContent = "처리 중…";
    const { data, error } = await sb().rpc("push_faction", { p_issue_id: issue.id, p_stance: curSide, p_amount: a });
    if (error || !data?.ok) {
      if (data?.reason === "insufficient") {
        close();
        const need = a - (data.balance || 0);
        if (window.GALLA_needGP) window.GALLA_needGP(need > 0 ? need : a, "밀어주기에 GP가 부족해요");
        else alert("GP가 부족해요.");
      } else if (data?.reason === "unauthorized") { alert("로그인이 필요해요."); go.disabled = false; refresh(); }
      else { alert("밀어주기에 실패했어요."); go.disabled = false; refresh(); }
      return;
    }
    window.BattleFX?.haptic?.("tap");
    close();
    render({ pro: data.pro, con: data.con, mine: 0 });
    load(); // 내 기여 갱신
  }

  window.GALLA_initFaction = function (iss) {
    issue = iss; faA = iss?.faction_a || "찬성"; faB = iss?.faction_b || "반대";
    if (!document.getElementById("faction-section")) return;
    css(); load();
  };
})();
