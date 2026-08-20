/* =========================================================
   갈라리안 등급 페이지 — 두 트랙 + 시즌 순위 + 혜택 + 주간 미션

     ① 평생 레벨(리니지)  누적, 안 내려감
     ② 시즌 등급(롤)      상위 % + 최소 GI, 시즌마다 재출발

   계산은 서버(gallian_of)가 단일 출처다. 여기선 그리기만 한다.
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
    apex:      "판을 평정한 전설. 이번 시즌 최상위 0.1%.",
  };

  const $  = id => document.getElementById(id);
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  const n = v => (Number(v) || 0).toLocaleString();

  try {
    const g = await window.GALLA_gallianOf(supabase, userId);
    if (!g) return;

    /* ── ② 시즌 등급 (메인) ── */
    const rankChip = g.rank ? `<span class="rank-chip">${g.rank}위 · 상위 ${g.pct}%</span>` : "";
    const nameEl = $("tierName");
    if (nameEl) {
      nameEl.innerHTML = `${esc(g.tier.name)}${rankChip}`;
      nameEl.style.color = g.tier.color;
    }
    set("tierDesc", DESC[g.tier.key] || "");

    /* 다음 등급까지 — '더 하면 되는지'와 '남들보다 잘해야 하는지'는 다른 얘기다.
       둘을 뭉뚱그리면 유저는 뭘 해야 할지 모른다. */
    const nt = g.nextTier;
    if (nt) {
      const bar = $("tierProgress");
      const pctDone = Math.min(100, Math.round(g.giSeason / Math.max(1, nt.floor_gi) * 100));
      if (bar) requestAnimationFrame(() => bar.style.width = pctDone + "%");
      set("xpText", nt.needs_rank
        ? `최소 GI는 넘었습니다 — 이제 상위 ${nt.top_pct}% 안에 들어야 ${nt.emoji} ${nt.name} 입니다 (현재 상위 ${g.pct}%)`
        : `${nt.emoji} ${nt.name} 까지 ${n(nt.gi_short)} GI  ·  상위 ${nt.top_pct}% 조건도 함께 충족해야 합니다`);
    } else {
      const bar = $("tierProgress");
      if (bar) requestAnimationFrame(() => bar.style.width = "100%");
      set("xpText", `이번 시즌 최정점입니다 · 시즌 ${n(g.giSeason)} GI`);
    }
    const aura = $("tierAura");
    if (aura) aura.className = `tier-aura ${g.tier.key}-aura`;

    /* 주특기 */
    const sp = g.specialty, spEl = $("specBadge");
    if (spEl && sp) {
      spEl.hidden = false;
      spEl.innerHTML = sp.key === "all"
        ? `<b>${esc(sp.emoji)} ${esc(sp.name)}</b> <span>어느 한쪽에 치우치지 않았습니다</span>`
        : `<b>${esc(sp.emoji)} ${esc(sp.name)}</b> <span>이번 시즌 GI의 ${sp.pct}% 가 여기서 나왔습니다</span>`;
    }

    /* ── ① 평생 레벨 (안 내려가는 축) ── */
    const lt = $("lifeTrack");
    if (lt) {
      lt.hidden = false;
      set("ltLv", `Lv.${g.level}`);
      set("ltName", "평생 레벨 · 내려가지 않습니다");
      requestAnimationFrame(() => { const f = $("ltFill"); if (f) f.style.width = g.levelProgress + "%"; });
      set("ltSub", `Lv.${g.level + 1} 까지 ${n(g.toNextLevel)} GI  ·  누적 ${n(g.giLife)} GI`);
    }

    /* 시즌 헤더 */
    if (g.season) {
      const t = document.querySelector(".st-title");
      if (t) t.textContent = `갈라리안 · ${g.season.name} (${g.season.days_left}일 남음)`;
    }

    /* ── 혜택 — 약속이 아니라 지금 적용되는 것 ── */
    const pc = $("perkCard");
    if (pc) {
      pc.innerHTML = (g.perks || []).map(p =>
        `<div class="perk-row"><span>✅</span><span>${esc(p)}</span></div>`).join("")
        + (g.next ? `<div class="perk-row" style="opacity:.45"><span>🔒</span><span>${esc(g.next.name)} 승급 시 ${esc((window.GALLA_TIER_PERKS||{})[g.next.lv]?.[0] || "")}</span></div>` : "");
    }

    /* ── 영역별 기여 ── */
    const list = $("domainList");
    if (list) {
      /* 영역마다 자기 레벨과 진행바를 가진다 — 통합 레벨 하나만으로는
         "숏판에서 내가 어디쯤인가"가 안 보인다. */
      list.innerHTML = g.domains.map(d => `
        <div class="progress-item${d.isKing ? " is-king" : ""}">
          <div class="pi-label">
            <span class="pi-dom">${esc(d.emoji)} ${esc(d.name)}</span>
            <span class="pi-tier" style="--tc:${d.tier.color}">${esc(d.tier.emoji)} ${esc(d.tier.name)}</span>
            <span class="pi-lv" style="background:${d.band.color}22;color:${d.band.color};border-color:${d.band.color}55">Lv.${d.level}</span>
            ${d.isKing ? `<span class="pi-crown">👑 ${esc(d.king)}</span>` : ""}
          </div>
          <div class="pi-bar"><div class="fill" style="width:0;background:${d.color} !important;box-shadow:0 0 10px ${d.color}66"></div></div>
          <div class="pi-text">${n(d.points)} GI · ${d.nextTier
            ? `${esc(d.nextTier.name)}까지 ${n(d.tierShort)}`
            : "이 판 최고 등급 · 남은 건 왕좌"}</div>
        </div>`).join("");
      requestAnimationFrame(() => {
        list.querySelectorAll(".fill").forEach((el, i) => {
          const d = g.domains[i], lo = d.tier.floor;
          const hi = d.nextTier ? d.nextTier.floor : lo + 1;
          el.style.width = (d.nextTier
            ? Math.max(2, Math.min(100, Math.round((d.points - lo) / (hi - lo) * 100)))
            : 100) + "%";
        });
      });
    }

    /* ── 왕 다섯 — 시즌마다 영역별 한 명 ── */
    await renderKings();


    /* ── 판별 등급 사다리 — 서버 domain_tiers() 를 그대로 그린다.
       예전 HTML 에는 '상단 노출 증가·추천 가중치 상승·알고리즘 최우선' 이 박혀 있었다.
       그런 코드는 없다(피드는 created_at 순). 못 지킬 약속이라 걷어냈다. ── */
    const ladder = $("tierLadder");
    if (ladder) {
      const { data: dt } = await supabase.rpc("domain_tiers");
      const mine = {};
      (g.domains || []).forEach(d => { (mine[d.tier.lv] = mine[d.tier.lv] || []).push(d.name); });
      ladder.innerHTML = (dt || []).map(t => {
        const meta = (window.GALLA_DOM_TIERS || []).find(x => x.lv === t.tier_lv) || {};
        const where = mine[t.tier_lv];
        return `<div class="tier-box" style="border-left-color:${meta.color};${
          where ? `box-shadow:0 0 18px ${meta.color}33` : "opacity:.45"}">
          <div class="tier-title">${esc(t.emoji)} ${esc(t.name)}${
            where ? `<span class="tier-mine" style="background:${meta.color}">${esc(where.join(" · "))}</span>` : ""}</div>
          <div class="tier-sub">${esc(t.sub)}</div>
          <div class="tier-req" style="color:${meta.color}">${
            t.floor_gi === 0 ? "시작 등급" : `그 판에서 ${n(t.floor_gi)} GI`}</div>
        </div>`;
      }).join("");
    }

    /* ── 주간 미션 — 보상이 GI 다(짧은 루프를 사다리에 꽂는 자리) ── */
    await renderWeekly();

    /* ── 업적 ── */
    const touched = g.domains.filter(d => d.points > 0).length;
    const by = k => (g.domains.find(d => d.key === k) || { points: 0 }).points;
    const ach = [
      { label: "⚔️ 이번 시즌 첫 이슈",     done: by("issue")   > 0 },
      { label: "🎪 이번 시즌 첫 광장",      done: by("arena")   > 0 },
      { label: "📱 이번 시즌 첫 숏판",      done: by("short")   > 0 },
      { label: "🎞 이번 시즌 첫 롱판",      done: by("long")    > 0 },
      { label: "🔮 이번 시즌 첫 예측",      done: by("predict") > 0 },
      { label: "👑 왕좌 하나 차지",         done: (g.crowns || []).length > 0 },
      { label: "🌈 5개 영역 전부 찍기",     done: touched >= 5 },
      { label: "🏅 시즌 순위 진입",         done: !!g.rank },
      { label: "🧬 평생 Lv.20 돌파",        done: g.level >= 20 },
    ];
    const achList = $("achList");
    if (achList) {
      achList.innerHTML = ach.map(a => `
        <div class="ach-item"><span>${a.label}</span>
          <span class="ach-status ${a.done ? "done" : "locked"}">${a.done ? "획득" : "미획득"}</span>
        </div>`).join("");
    }

    async function renderKings() {
      const kc = $("kingsCard"), oc = $("overlordCard");
      if (!kc) return;
      const { data: k } = await supabase.rpc("kings_now");
      if (!k || !k.ok) { kc.innerHTML = `<div class="king-empty">불러오지 못했습니다</div>`; return; }
      /* 왕중왕 — 판 다섯 위 한 자리. 전체에서 내가 몇 등인지도 같이 보여준다. */
      if (oc) {
        const o = k.overlord;
        oc.innerHTML = `<div class="ovl${o ? "" : " vacant"}${o && o.user_id === userId ? " mine" : ""}">
            <div class="ovl-seat">👑 왕중왕</div>
            <div class="ovl-who">${o ? esc(o.nickname || "이름 없음") : "빈 자리"}</div>
            <div class="ovl-gi">${o ? n(o.gi) + " GI" : `시즌 ${n(k.overlord_floor)} GI부터`}</div>
          </div>
          <div class="ovl-me">전체 ${g.rank ? `<b>${n(g.rank)}위</b> / ${n(k.contenders)}명` : "아직 순위 밖"}${
            g.pct != null ? ` · 상위 ${g.pct}%` : ""}</div>`;
      }
      const meta = window.GALLA_GALLIAN_DOMAINS || [];
      kc.innerHTML = (k.kings || []).map(x => {
        const d = meta.find(m => m.key === x.domain) || {};
        const mine = x.user_id && x.user_id === userId;
        return `<div class="king-row${x.nickname ? "" : " vacant"}${mine ? " mine" : ""}"
                     style="--kc:${d.color || "#9aa0ad"}">
          <span class="king-seat">${esc(x.emoji)} ${esc(x.name)}</span>
          <span class="king-who">${x.nickname ? esc(x.nickname) : "빈 자리"}</span>
          <span class="king-gi">${x.nickname ? n(x.gi) + " GI" : `${n(k.floor)} GI부터`}</span>
        </div>`;
      }).join("");
    }

    async function renderWeekly() {
      const wc = $("weeklyCard");
      if (!wc) return;
      const { data: w } = await supabase.rpc("weekly_missions");
      if (!w || !w.ok) { wc.innerHTML = `<div class="wk-p">불러오지 못했습니다</div>`; return; }
      wc.innerHTML = w.missions.map(m => {
        const btn = m.claimed ? `<button class="wk-b done" disabled>받음</button>`
                  : m.done   ? `<button class="wk-b on" data-k="${esc(m.key)}">+${m.reward} GI</button>`
                             : `<button class="wk-b off" disabled>+${m.reward} GI</button>`;
        return `<div class="wk-row">
          <span>${esc(m.icon)}</span>
          <span class="wk-t">${esc(m.title)}<div class="wk-p">${m.progress} / ${m.goal}</div></span>
          ${btn}</div>`;
      }).join("");
      wc.querySelectorAll(".wk-b.on").forEach(b => {
        b.onclick = async () => {
          b.disabled = true;
          const { data: r } = await supabase.rpc("claim_weekly", { p_key: b.dataset.k });
          if (r && r.ok) { if (window.GALLA_toast) GALLA_toast(`+${r.gi} GI 획득!`); location.reload(); }
          else { b.disabled = false; alert("수령 실패: " + ((r && r.reason) || "")); }
        };
      });
    }
  } catch (e) {
    console.error("[gallian]", e);
  }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".nav-item").forEach(el => {
        el.onclick = () => { location.href = el.dataset.target; };
    });
});
