/* =========================================================
   데일리 미션 — 실제 활동 기반 진행도 + GP 보상(통합 지갑)
   백엔드: daily_mission_status() / claim_mission(key)
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) { alert("로그인이 필요합니다."); location.href = "login.html"; return; }

  const dailyWrapper = document.getElementById("daily-list");
  let MISSIONS = [];

  async function loadMissions() {
    const { data, error } = await supabase.rpc("daily_mission_status");
    if (error || !data?.ok) { console.error("[mission]", error || data); return; }
    MISSIONS = data.missions || [];
    renderDaily();
    updateRing();
    updateTodayReward();
  }

  function cardHtml(q) {
    const pct = Math.min(100, Math.round((q.progress / q.goal) * 100));
    const done = q.progress >= q.goal;
    let btn;
    if (q.claimed) btn = `<button class="q-claim done" disabled>수령 완료 ✓</button>`;
    else if (done) btn = `<button class="q-claim ready" data-key="${q.key}">+${q.reward} GP 받기</button>`;
    else btn = `<button class="q-claim" disabled>+${q.reward} GP</button>`;
    return `
      <div class="quest-card ${q.claimed ? "completed" : ""}" data-key="${q.key}">
        <div class="quest-top">
          <div class="quest-icon">${q.icon}</div>
          <div>
            <div class="quest-title">${q.title}</div>
            <div class="quest-sub">${q.claimed ? "완료" : done ? "달성! 보상을 받으세요" : "+" + q.reward + " GP"}</div>
          </div>
        </div>
        <div class="quest-progress">
          ${q.progress} / ${q.goal}
          <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
        </div>
        ${btn}
      </div>`;
  }

  function renderDaily() {
    dailyWrapper.innerHTML = MISSIONS.map(cardHtml).join("");
    dailyWrapper.querySelectorAll(".q-claim.ready").forEach(b => {
      b.addEventListener("click", (e) => { e.stopPropagation(); claim(b.dataset.key, b); });
    });
  }

  async function claim(key, btn) {
    if (btn) { btn.disabled = true; btn.textContent = "받는 중…"; }
    const { data, error } = await supabase.rpc("claim_mission", { p_key: key });
    if (error || !data?.ok) {
      if (data?.reason === "already") { await loadMissions(); return; }
      alert("보상 수령에 실패했어요. 잠시 후 다시 시도해주세요.");
      if (btn) { btn.disabled = false; }
      return;
    }
    toast(`🎉 +${data.reward} GP 획득! (보유 ${Math.round(data.balance).toLocaleString()} GP)`);
    await loadMissions();
  }

  function updateRing() {
    const total = MISSIONS.length || 1;
    const cleared = MISSIONS.filter(q => q.claimed).length;
    const percent = Math.round((cleared / total) * 100);
    const pctEl = document.getElementById("progress-percent");
    if (pctEl) pctEl.innerText = percent + "%";
    const ring = document.querySelector(".ring-progress");
    if (ring) ring.style.strokeDashoffset = 440 - (440 * percent) / 100;
  }

  function updateTodayReward() {
    const totalGP = MISSIONS.reduce((s, q) => s + q.reward, 0);
    const gotGP = MISSIONS.reduce((s, q) => s + (q.claimed ? q.reward : 0), 0);
    const setTx = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    setTx("tr-total-gp", totalGP + " GP");
    setTx("tr-progress-text", `${gotGP} / ${totalGP} GP`);
    const fill = document.getElementById("tr-bar-fill");
    if (fill) fill.style.width = (totalGP ? (gotGP / totalGP) * 100 : 0) + "%";

    const claimBtn = document.getElementById("tr-claim-btn");
    if (!claimBtn) return;
    const claimable = MISSIONS.filter(q => q.progress >= q.goal && !q.claimed);
    if (claimable.length) {
      claimBtn.classList.remove("disabled");
      claimBtn.textContent = `완료 미션 ${claimable.length}개 한번에 받기`;
      claimBtn.onclick = async () => {
        claimBtn.classList.add("disabled");
        for (const q of claimable) await claim(q.key, null);
      };
    } else {
      claimBtn.classList.add("disabled");
      claimBtn.textContent = gotGP && gotGP === totalGP ? "오늘 보상 모두 수령 완료 ✓" : "미션을 먼저 완료하세요";
      claimBtn.onclick = null;
    }
  }

  function toast(msg) {
    let t = document.getElementById("q-toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "q-toast";
      t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9999;background:#16171c;border:1px solid #f5cf6b;color:#f5cf6b;font-weight:800;font-size:13.5px;padding:11px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .2s,transform .2s;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(-6px)"; });
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%)"; }, 2600);
  }

  // 주간 퀘스트는 다음 단계 — 자리표시
  const weekly = document.getElementById("weekly-list");
  if (weekly) weekly.innerHTML = `<div style="color:#7a7f8a;font-size:13px;padding:16px 4px;">주간 퀘스트는 곧 열립니다 🔜</div>`;

  loadMissions();
});

document.querySelectorAll(".nav-item").forEach(icon => {
  icon.addEventListener("click", () => {
    const target = icon.dataset.target;
    if (target) location.href = target;
  });
});
