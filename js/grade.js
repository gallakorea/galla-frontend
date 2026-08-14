/* =========================================================
   갈라리안 등급 페이지 — 5영역(여론·논전·창작·예측·난장) 실데이터

   계산은 서버(gallian_of)가 단일 출처다. 여기선 그리기만 한다.
   창작자 트랙 카드는 폐지 — '창작' 영역으로 흡수됐다.
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    alert("로그인이 필요합니다.");
    (window.GALLA_nav||function(u){location.href=u})("login.html");
    return;
  }
  const userId = sessionData.session.user.id;

  const DESC = {
    spark:     "아직은 조용히 눈팅만… 하지만 곧 못 참고 한마디 얹을 운명.",
    breaker:   "드디어 참견 개시! 손가락에 슬슬 불이 붙기 시작했습니다.",
    vanguard:  "슬슬 판을 벌이는 중. 이슈든 숏판이든 난장이든 일단 지르고 봅니다.",
    authority: "판을 읽고 끌고 가는 사람. 당신이 뜨면 분위기가 바뀝니다.",
    dominion:  "판 자체를 몰고 가는 사람. 갈라가 당신을 중심으로 돕니다.",
    apex:      "판을 평정한 전설. 갈라리안이 오를 수 있는 최정점입니다.",
  };

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setW = (id, pct) => { const el = document.getElementById(id); if (el) requestAnimationFrame(() => el.style.width = pct + "%"); };
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  try {
    const g = await window.GALLA_gallianOf(supabase, userId);
    if (!g) return;

    // 메인 카드 — 등급 + 누적 레벨
    set("tierName", `${g.tier.name} · Lv.${g.level}`);
    set("tierDesc", DESC[g.tier.key] || "");
    setW("tierProgress", g.progress);

    /* 목표는 '다음 레벨' — 자주 차올라야 재미가 산다.
       승급(10레벨마다)은 멀리 있는 두 번째 목표로 같이 보여준다. */
    const promo = g.promotion && g.promotion.name
      ? `  ·  Lv.${g.promotion.level} 에서 ${g.promotion.name} 승급`
      : "";
    set("xpText", g.goal.remaining > 0
      ? `앞으로 ${g.goal.remaining.toLocaleString()} GI → ${g.goal.label} 🔥  (누적 ${g.gi.toLocaleString()} GI)${promo}`
      : `갈라 지수 ${g.gi.toLocaleString()} GI`);

    const aura = document.getElementById("tierAura");
    if (aura) aura.className = `tier-aura ${g.tier.key}-aura`;
    const nameEl = document.getElementById("tierName");
    if (nameEl) nameEl.style.color = g.tier.color;

    /* 🎨 주특기 — 별도 사다리가 아니라 '무엇으로 여기까지 왔나'의 색.
       한 영역이 40% 이상이면 그 색, 아니면 만능형. */
    const sp = g.specialty;
    const spEl = document.getElementById("specBadge");
    if (spEl && sp) {
      spEl.hidden = false;
      spEl.innerHTML = sp.key === "all"
        ? `<b>${esc(sp.emoji)} ${esc(sp.name)}</b> <span>어느 한쪽에 치우치지 않았습니다</span>`
        : `<b>${esc(sp.emoji)} ${esc(sp.name)}</b> <span>갈라 지수의 ${sp.pct}% 가 여기서 나왔습니다</span>`;
    }

    // 다음 등급
    set("nextTier", g.next ? g.next.name : "정점 도달 🏆");

    /* 📊 영역별 기여 — 0 인 영역도 지우지 않는다.
       '창작 0' 이 보여야 뭘 안 하고 있는지 알고, 그게 다음 행동이 된다. */
    const list = document.getElementById("domainList");
    if (list) {
      list.innerHTML = g.domains.map(d => `
        <div class="progress-item">
          <div class="pi-label">${esc(d.emoji)} ${esc(d.name)} <small style="opacity:.55;font-weight:600">${esc(d.hint)}</small></div>
          <div class="pi-bar"><div class="fill" style="width:0;background:${d.color}"></div></div>
          <div class="pi-text">${d.points.toLocaleString()} GI${d.points === 0 ? " · 아직 없음" : ` · ${d.pct}%`}</div>
        </div>`).join("");
      requestAnimationFrame(() => {
        list.querySelectorAll(".fill").forEach((el, i) => { el.style.width = g.domains[i].pct + "%"; });
      });
    }

    /* 등급 사다리 — 각 등급에 필요한 레벨과 GI.
       ⚠️ 임계값은 서버 곡선(GALLA_giForLevel)에서 가져온다. 여기에 숫자를 적지 않는다. */
    const giForLevel = window.GALLA_giForLevel;
    (window.GALLA_GALLIAN_TIERS || []).forEach(t => {
      const b = document.querySelector(`.tier-box.${t.key}`);
      if (!b || b.querySelector(".tier-req")) return;
      const req = document.createElement("div");
      req.className = "tier-req";
      req.style.cssText = "font-size:11px;font-weight:800;margin-top:6px;color:" + t.color;
      const need = giForLevel ? giForLevel(Math.max(1, t.lv)) : 0;
      req.textContent = t.lv === 0 ? "시작 등급" : `Lv.${t.lv} · 누적 ${need.toLocaleString()} GI`;
      b.querySelector(".tier-sub")?.after(req);
    });

    // 현재 등급 하이라이트
    const box = document.querySelector(`.tier-box.${g.tier.key}`);
    if (box) {
      box.style.borderColor = g.tier.color;
      box.style.boxShadow = `0 0 18px ${g.tier.color}44`;
      const t = box.querySelector(".tier-title");
      if (t) t.insertAdjacentHTML("beforeend", ` <span style="font-size:10px;font-weight:900;color:#0a0a0b;background:${g.tier.color};padding:2px 7px;border-radius:99px;vertical-align:2px;">현재 Lv.${g.level}</span>`);
    }

    /* 🏆 업적 — 영역 구조에서 바로 나온다(추가 조회 없음).
       '넓게 하라'는 설계 의도를 과제로도 반복해 말해준다. */
    const touched = g.domains.filter(d => d.points > 0).length;
    const by = k => (g.domains.find(d => d.key === k) || { points: 0 }).points;
    const ach = [
      { label: "🗣 첫 갈라 발의",            done: by("opinion")  > 0 },
      { label: "⚔️ 첫 댓글 전투",             done: by("debate")   > 0 },
      { label: "🎬 첫 창작물 발행",           done: by("creation") > 0 },
      { label: "🔮 첫 예측 참여",             done: by("predict")  > 0 },
      { label: "🎪 첫 난장 참여",             done: by("arena")    > 0 },
      { label: "🎲 3개 영역에서 점수 내기",    done: touched >= 3 },
      { label: "🌈 5개 영역 전부 찍기",        done: touched >= 5 },
      { label: "🔥 누적 10,000 GI",           done: g.gi >= 10000 },
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
