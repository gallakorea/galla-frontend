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
    spark:     "아직은 조용히 눈팅만… 하지만 곧 참지 못하고 첫 댓글을 달 운명.",
    breaker:   "드디어 발끈해서 참전 개시! 손가락에 슬슬 불이 붙기 시작했습니다.",
    vanguard:  "키보드에 불나는 참전러. 이제 웬만한 떡밥은 그냥 못 지나칩니다.",
    authority: "판을 읽고 흔드는 입담꾼. 당신 한 마디에 댓글창 분위기가 바뀝니다.",
    dominion:  "댓글창을 쥐락펴락하는 여론몰이. 전장이 당신을 중심으로 돕니다.",
    apex:      "전장을 평정한 전설의 논객. 갈라리안이 오를 수 있는 최정점입니다.",
  };

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setW = (id, pct) => { const el = document.getElementById(id); if (el) requestAnimationFrame(() => el.style.width = pct + "%"); };

  try {
    const g = await window.GALLA_gallianOf(supabase, userId);

    // 메인 카드 — 등급 + 서브레벨(Lv), 진행바는 '다음 목표'까지의 잦은 진척도
    set("tierName", `${g.tier.name} · Lv.${g.subLevel}`);
    set("tierDesc", DESC[g.tier.key] || "");
    setW("tierProgress", g.subProgress);
    // 근접목표 프레이밍: "앞으로 N GI면 ○○!" (이탈방지)
    set("xpText", g.goal.remaining > 0
      ? `앞으로 ${g.goal.remaining.toLocaleString()} GI → ${g.goal.label} 🔥  (누적 ${g.gi.toLocaleString()} GI)`
      : `갈라 지수 ${g.gi.toLocaleString()} GI`);
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

    // 등급 사다리: 각 등급에 필요 갈라 지수(GI) 표시 — 위로 갈수록 급격히 어려워짐을 시각화
    (window.GALLA_GALLIAN_TIERS || []).forEach(t => {
      const b = document.querySelector(`.tier-box.${t.key}`);
      if (!b || b.querySelector(".tier-req")) return;
      const req = document.createElement("div");
      req.className = "tier-req";
      req.style.cssText = "font-size:11px;font-weight:800;margin-top:6px;color:" + t.color;
      req.textContent = t.min === 0 ? "시작 등급" : `필요 ${t.min.toLocaleString()} GI · 각 등급 Lv.1~5`;
      b.querySelector(".tier-sub")?.after(req);
    });

    // 현재 등급 하이라이트
    const box = document.querySelector(`.tier-box.${g.tier.key}`);
    if (box) {
      box.style.borderColor = g.tier.color;
      box.style.boxShadow = `0 0 18px ${g.tier.color}44`;
      const t = box.querySelector(".tier-title");
      if (t) t.insertAdjacentHTML("beforeend", ` <span style="font-size:10px;font-weight:900;color:#0a0a0b;background:${g.tier.color};padding:2px 7px;border-radius:99px;vertical-align:2px;">현재 Lv.${g.subLevel}</span>`);
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
