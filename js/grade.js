/* =========================================================
   갈라리안 등급 페이지 — 갈라 지수(활동+전투+예측) 실데이터
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인이 필요합니다.");
    location.href = "login.html";
    return;
  }
  const userId = sessionData.session.user.id;

  const DESC = {
    spark:     "이제 막 불씨를 얻은 갈라리안입니다. 참전할수록 지수가 오릅니다.",
    breaker:   "논리를 깨우는 각성자. 전장에서 존재감이 드러나기 시작했습니다.",
    vanguard:  "전장의 선봉에서 의견의 흐름을 바꾸는 정예 갈라리안입니다.",
    authority: "발언에 무게가 실리는 권력자. 전장이 당신을 주목합니다.",
    dominion:  "전장을 지배하는 존재. 흐름이 당신을 중심으로 움직입니다.",
    apex:      "초월자 · 정점. 갈라리안이 도달할 수 있는 마지막 형태입니다.",
  };

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setW = (id, pct) => { const el = document.getElementById(id); if (el) requestAnimationFrame(() => el.style.width = pct + "%"); };

  try {
    const g = await window.GALLA_gallianOf(supabase, userId);

    // 메인 카드
    set("tierName", g.tier.name);
    set("tierDesc", DESC[g.tier.key] || "");
    setW("tierProgress", g.progress);
    set("xpText", g.next
      ? `갈라 지수 ${g.gi.toLocaleString()} / ${g.next.min.toLocaleString()} GI`
      : `갈라 지수 ${g.gi.toLocaleString()} GI · 최고 등급`);
    const aura = document.getElementById("tierAura");
    if (aura) aura.className = `tier-aura ${g.tier.key}-aura`;
    const nameEl = document.getElementById("tierName");
    if (nameEl) nameEl.style.color = g.tier.color;

    // 다음 등급 + 지수 분해 (GI 기여도)
    set("nextTier", g.next ? g.next.name : "정점 도달 🏆");
    const total = Math.max(1, g.gi);
    setW("giActivity", Math.round((g.parts.activity / total) * 100));
    setW("giBattle",   Math.round((g.parts.battle   / total) * 100));
    setW("giPredict",  Math.round((g.parts.predict  / total) * 100));
    set("giActivityText", `${g.parts.activity.toLocaleString()} GI`);
    set("giBattleText",   `${g.parts.battle.toLocaleString()} GI`);
    set("giPredictText",  `${g.parts.predict.toLocaleString()} GI`);

    // 등급 계층 리스트에서 현재 등급 하이라이트
    const box = document.querySelector(`.tier-box.${g.tier.key}`);
    if (box) {
      box.style.borderColor = g.tier.color;
      box.style.boxShadow = `0 0 18px ${g.tier.color}44`;
      const t = box.querySelector(".tier-title");
      if (t) t.insertAdjacentHTML("beforeend", ' <span style="font-size:10px;font-weight:900;color:#0a0a0b;background:' + g.tier.color + ';padding:2px 7px;border-radius:99px;vertical-align:2px;">현재</span>');
    }

    // 업적 도감 (실데이터)
    const r = g.raw;
    const ach = [
      { label: "🔥 첫 갈라 발의",            done: r.issues >= 1 },
      { label: "💬 참전 댓글 50회",           done: r.comments >= 50 },
      { label: "⚔️ 전투 액션 100회",          done: r.acts >= 100 },
      { label: "🗳️ 투표 100회",              done: r.votes >= 100 },
      { label: "📈 예측 거래 30회",           done: r.trades >= 30 },
      { label: "💰 보유 GP 50,000 달성",      done: r.balance >= 50000 },
    ];
    const achList = document.getElementById("achList");
    if (achList) {
      achList.innerHTML = ach.map(a => `
        <div class="ach-item"><span>${a.label}</span>
          <span class="ach-status ${a.done ? "done" : "locked"}">${a.done ? "획득" : "미획득"}</span>
        </div>`).join("");
    }
  } catch (e) {
    console.error("[gallian]", e);
  }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-item").forEach(el => {
        el.onclick = () => {
            location.href = el.dataset.target;
        };
    });
});
