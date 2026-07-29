/* =========================================================
   🎰 갈라 뽑기(가챠) — 700GP 소비 후 랜덤 보상(코스메틱/GP)
   window.GALLA_openGacha() · gacha_draw RPC · 자체 CSS/애니메이션
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient || window.supabase;
  const SPIN = ["🏷️","🎨","🔥","💢","💠","👑","🎯","🧠","💎","✨","🕵️","🌪️"];
  const GRADE = { bust: "#6c7280", common: "#9aa0ad", rare: "#4fc3f7", epic: "#a17bff", legendary: "#c9d1e0" };

  function css() {
    if (document.getElementById("gacha-css")) return;
    const s = document.createElement("style"); s.id = "gacha-css";
    s.textContent = `
      .ga-sheet{position:fixed;inset:0;z-index:99997;display:flex;align-items:flex-end;justify-content:center}
      .ga-sheet .dim{position:absolute;inset:0;background:rgba(0,0,0,.6)}
      .ga-card{position:relative;width:100%;max-width:480px;background:radial-gradient(120% 80% at 50% 0%,#1c1430,#0e0f14);
        border-radius:22px 22px 0 0;padding:20px 16px max(16px,env(safe-area-inset-bottom));animation:gaUp .24s ease;text-align:center}
      @keyframes gaUp{from{transform:translateY(100%)}}
      .ga-title{font-weight:900;font-size:19px;color:#f5f5f2}
      .ga-bal{color:#c9d1e0;font-weight:900;font-size:14px;margin-top:2px}
      .ga-machine{width:150px;height:150px;margin:18px auto;border-radius:24px;display:flex;align-items:center;justify-content:center;
        font-size:76px;background:linear-gradient(180deg,#23243a,#14141f);border:2px solid rgba(255,255,255,.12);box-shadow:0 0 40px rgba(123,92,255,.25)}
      .ga-machine.spin{animation:gaShake .35s linear infinite}
      @keyframes gaShake{25%{transform:translateX(-4px) rotate(-3deg)}75%{transform:translateX(4px) rotate(3deg)}}
      .ga-reward{margin:14px auto;padding:16px;border-radius:16px;border:2px solid;max-width:320px;animation:gaPop .4s cubic-bezier(.2,1.4,.5,1) both}
      @keyframes gaPop{from{opacity:0;transform:scale(.6)}}
      .ga-reward .rg{font-size:12px;font-weight:900;letter-spacing:1px;text-transform:uppercase}
      .ga-reward .rl{font-size:18px;font-weight:900;color:#fff;margin-top:6px}
      .ga-draw{width:100%;margin-top:14px;padding:15px;border:none;border-radius:14px;font-weight:900;font-size:16px;cursor:pointer;
        background:linear-gradient(135deg,#7b5cff,#a17bff);color:#fff;box-shadow:0 8px 24px -8px rgba(123,92,255,.7)}
      .ga-draw:disabled{opacity:.6}
      .ga-odds-btn{width:100%;margin-top:8px;padding:9px;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:transparent;color:#c9d1e0;font-weight:800;font-size:12.5px;cursor:pointer}
      .ga-odds{margin-top:8px;background:rgba(255,255,255,.04);border-radius:12px;padding:6px 10px}
      .ga-odds table{width:100%;font-size:12px;color:#c9d1e0;border-collapse:collapse}
      .ga-odds td{padding:5px 2px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left}
      .ga-odds td:last-child{text-align:right;font-weight:900;color:#c9d1e0}
      .ga-note{color:#8a8f9a;font-size:11.5px;margin-top:10px;line-height:1.5}
      .ga-note b{color:#ff8098}
      .ga-close{width:100%;margin-top:8px;padding:12px;border:none;border-radius:12px;background:rgba(255,255,255,.06);color:#c9d1e0;font-weight:800;cursor:pointer}
    `;
    document.head.appendChild(s);
  }

  let sheet, spinTimer;
  async function refreshBal() {
    const { data } = await sb().rpc("ensure_balance");
    const el = sheet?.querySelector("#ga-bal"); if (el) el.textContent = "보유 " + Math.round(data || 0).toLocaleString() + " GP";
  }

  async function draw() {
    const btn = sheet.querySelector("#ga-draw"), machine = sheet.querySelector("#ga-machine"), rewardBox = sheet.querySelector("#ga-reward-wrap");
    btn.disabled = true; rewardBox.innerHTML = "";
    machine.classList.add("spin");
    let i = 0; spinTimer = setInterval(() => { machine.textContent = SPIN[i++ % SPIN.length]; }, 80);
    window.BattleFX?.haptic?.("tap");

    const { data } = await sb().rpc("gacha_draw");
    await new Promise(r => setTimeout(r, 1100)); // 연출 시간
    clearInterval(spinTimer); machine.classList.remove("spin");

    if (!data?.ok) {
      machine.textContent = "🎰";
      let msg = "뽑기 실패";
      if (data?.reason === "insufficient") msg = "GP가 부족해요 (700GP 필요)";
      else if (data?.reason === "daily_limit") msg = `오늘 뽑기 한도(${data.limit}회)를 다 썼어요. 내일 다시!`;
      rewardBox.innerHTML = `<div style="color:#ff8098;font-weight:800;margin-top:8px">${msg}</div>`;
      if (data?.reason === "daily_limit") btn.textContent = "오늘 한도 소진";
      else btn.disabled = false;
      return;
    }
    if (data.limit) btn.textContent = `🎰 뽑기 (700 GP) · 오늘 ${data.used}/${data.limit}`;
    const color = GRADE[data.grade] || GRADE.common;
    machine.textContent = data.type === "bust" ? "💨" : (data.type === "gp" ? "💰" : "🎁");
    rewardBox.innerHTML = `<div class="ga-reward" style="border-color:${color};background:${color}22">
      <div class="rg" style="color:${color}">${({bust:"꽝",common:"COMMON",rare:"RARE",epic:"EPIC",legendary:"LEGENDARY"})[data.grade] || ""}</div>
      <div class="rl">${data.label}</div></div>`;
    if (data.grade === "legendary" || data.grade === "epic") window.BattleFX?.banner?.(data.label, "cheer");
    document.dispatchEvent(new CustomEvent("galla:items-changed"));
    await refreshBal();
    // 코스메틱을 뽑았으면 내 배지 캐시 무효화
    if (window.GALLA_decoCache) { const me = (await sb().auth.getSession()).data?.session?.user?.id; if (me) delete window.GALLA_decoCache[me]; }
    btn.disabled = false;
  }

  window.GALLA_openGacha = async function () {
    const { data: s } = await sb().auth.getSession();
    if (!s?.session) { (window.GALLA_nav||function(u){location.href=u})("login.html"); return; }
    css();
    document.getElementById("ga-sheet")?.remove();
    sheet = document.createElement("div"); sheet.id = "ga-sheet"; sheet.className = "ga-sheet";
    sheet.innerHTML = `<div class="dim"></div><div class="ga-card">
      <div class="ga-title">🎰 갈라 뽑기</div>
      <div class="ga-bal" id="ga-bal">보유 – GP</div>
      <div class="ga-machine" id="ga-machine">🎰</div>
      <div id="ga-reward-wrap"></div>
      <button class="ga-draw" id="ga-draw">🎰 뽑기 (700 GP)</button>
      <button class="ga-odds-btn" id="ga-odds-btn">📊 확률 공개 보기</button>
      <div class="ga-odds" id="ga-odds" hidden>
        <table>
          <tr><td>🗑️ 꽝</td><td>30%</td></tr>
          <tr><td>+100 GP</td><td>20%</td></tr>
          <tr><td>+300 GP</td><td>16%</td></tr>
          <tr><td>스티커팩(미보유)·+400GP</td><td>13%</td></tr>
          <tr><td>+1,000 GP</td><td>9%</td></tr>
          <tr><td>+800 GP</td><td>7%</td></tr>
          <tr><td>닉스타일(미보유)·+1,500GP</td><td>2.5%</td></tr>
          <tr><td>🔥 +2,000 GP</td><td>1.5%</td></tr>
          <tr><td>💎 대박 보너스 +5,000 GP</td><td>1%</td></tr>
        </table>
      </div>
      <div class="ga-note">GP는 서비스 내 재화이며 <b>현금으로 환전·환급되지 않습니다.</b> 확률형 아이템 확률은 위와 같이 공개됩니다.</div>
      <button class="ga-close">닫기</button></div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".dim").onclick = () => sheet.remove();
    sheet.querySelector(".ga-close").onclick = () => sheet.remove();
    sheet.querySelector("#ga-draw").onclick = draw;
    sheet.querySelector("#ga-odds-btn").onclick = () => {
      const o = sheet.querySelector("#ga-odds"); o.hidden = !o.hidden;
      sheet.querySelector("#ga-odds-btn").textContent = o.hidden ? "📊 확률 공개 보기" : "📊 확률 접기";
    };
    await refreshBal();
  };
})();
