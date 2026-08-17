/* =========================================================
   데일리 미션 — 실제 활동 기반 진행도 + GP 보상(통합 지갑)
   백엔드: daily_mission_status() / claim_mission(key)
   ========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
  const supabase = await waitForSupabaseClient();
  const { data: sess } = await supabase.auth.getSession();
  if (!sess?.session) { alert("로그인이 필요합니다."); (window.GALLA_nav||function(u){location.href=u})("login.html"); return; }

  const dailyWrapper = document.getElementById("daily-list");
  let MISSIONS = [];

  async function loadMissions() {
    const { data, error } = await supabase.rpc("daily_mission_status");
    if (error || !data?.ok) { console.error("[mission]", error || data); return; }
    MISSIONS = data.missions || [];
    renderDaily();
    updateRing();
    updateTodayReward();
    initChest(data.chest_opened);
  }

  // 미션별 '하러 가기' 목적지 — 예측은 갈라예측, 그 외(투표·댓글·전투·광장·DM)는 홈 피드(이슈)
  function goFor(key) {
    if (/predict/.test(key)) return "galla-predict.html";
    // 공유 미션은 '놀거리' 탭으로 — 거기 카드마다 공유 버튼이 1급으로 붙어 있다
    if (key === "share") return "search.html?tab=fun";
    return "index.html";
  }

  function cardHtml(q) {
    const pct = Math.min(100, Math.round((q.progress / q.goal) * 100));
    const done = q.progress >= q.goal;
    let btn;
    if (q.claimed) btn = `<button class="q-claim done" disabled>수령 완료 ✓</button>`;
    else if (done) btn = `<button class="q-claim ready" data-key="${q.key}">+${q.reward} GP 받기</button>`;
    // 미완료: 죽은 '+N GP' 버튼 대신 실제 활동으로 보내는 딥링크(고도화 — 미션을 바로 수행 가능)
    else btn = `<a class="q-claim go" href="${goFor(q.key)}">하러 가기 →</a>`;
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
      if (data?.reason === "already") { await refreshAll(); return; }
      alert("보상 수령에 실패했어요. 잠시 후 다시 시도해주세요.");
      if (btn) { btn.disabled = false; }
      return;
    }
    toast(`🎉 +${data.reward} GP 획득! (보유 ${Math.round(data.balance).toLocaleString()} GP)`);
    await refreshAll();
  }

  // 일간·주간·스페셜을 한번에 새로고침(수령 후 전 섹션 반영)
  async function refreshAll() { await Promise.all([loadMissions(), loadWeekly(), loadSpecial()]); }

  /* ---------- 주간 퀘스트(실데이터) ---------- */
  const weeklyWrapper = document.getElementById("weekly-list");
  async function loadWeekly() {
    if (!weeklyWrapper) return;
    const { data, error } = await supabase.rpc("weekly_mission_status");
    if (error || !data?.ok) { weeklyWrapper.innerHTML = ""; return; }
    weeklyWrapper.innerHTML = (data.missions || []).map(cardHtml).join("");
    weeklyWrapper.querySelectorAll(".q-claim.ready").forEach(b =>
      b.addEventListener("click", (e) => { e.stopPropagation(); claim(b.dataset.key, b); }));
  }

  /* ---------- 스페셜 이벤트(실데이터) ---------- */
  async function loadSpecial() {
    const card = document.getElementById("special-card");
    if (!card) return;
    const { data, error } = await supabase.rpc("special_event_status");
    const ev = data?.event;
    if (error || !data?.ok || !ev) { card.style.display = "none"; return; }
    const pct = Math.min(100, Math.round((ev.progress / ev.goal) * 100));
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set("sp-desc", ev.title.replace(/^[^—]*—\s*/, "")); // '— ' 뒤 설명만
    set("sp-progtext", `${ev.progress} / ${ev.goal}`);
    const fill = document.getElementById("sp-fill"); if (fill) fill.style.width = pct + "%";
    const btn = document.getElementById("sp-btn");
    if (!btn) return;
    const done = ev.progress >= ev.goal;
    btn.disabled = false;
    if (ev.claimed) { btn.textContent = `+${ev.reward} GP 수령 완료 ✓`; btn.disabled = true; btn.onclick = null; }
    else if (done) { btn.textContent = `+${ev.reward} GP 받기`; btn.onclick = () => claim("special", btn); }
    else { btn.textContent = `핫이슈로 가기 → (+${ev.reward} GP)`; btn.onclick = () => (location.href = "index.html"); }
  }

  /* ---------- 오늘의 상자(하루 1회 랜덤 GP) ---------- */
  async function initChest(chestOpened) {
    const btn = document.getElementById("reward-btn");
    if (!btn) return;
    if (chestOpened) { btn.textContent = "오늘 상자 열기 완료 ✓"; btn.disabled = true; return; }
    btn.disabled = false;
    btn.textContent = "오늘 상자 열기 →";
    btn.onclick = async () => {
      btn.disabled = true; btn.textContent = "여는 중…";
      const { data, error } = await supabase.rpc("claim_daily_chest");
      if (error || !data?.ok) {
        if (data?.reason === "already") { btn.textContent = "오늘 상자 열기 완료 ✓"; return; }
        btn.disabled = false; btn.textContent = "오늘 상자 열기 →";
        alert("상자를 여는 데 실패했어요. 잠시 후 다시 시도해주세요."); return;
      }
      btn.textContent = "오늘 상자 열기 완료 ✓";
      toast(`🎁 상자에서 +${data.reward} GP! (보유 ${Math.round(data.balance).toLocaleString()} GP)`);
    };
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
      t.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:9999;background:#16171c;border:1px solid #c9d1e0;color:#c9d1e0;font-weight:800;font-size:13.5px;padding:11px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.5);opacity:0;transition:opacity .2s,transform .2s;";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    requestAnimationFrame(() => { t.style.opacity = "1"; t.style.transform = "translateX(-50%) translateY(-6px)"; });
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = "0"; t.style.transform = "translateX(-50%)"; }, 2600);
  }

  refreshAll();
});

document.querySelectorAll(".nav-item").forEach(icon => {
  icon.addEventListener("click", () => {
    const target = icon.dataset.target;
    if (target) location.href = target;
  });
});

/* ---------------------------------------------------------
   🎁 친구 초대 카드 — 내 코드(my_ref_code)·실적(my_referral_stats)
   링크 복사/공유. 비로그인은 로그인 유도.
   --------------------------------------------------------- */
// 🏆 초대 랭킹 — 아무도 없으면 '첫 초대자가 되어보세요'로 동기 부여(빈 상태를 기회로)
async function paintInviteLb(sb) {
  const box = document.getElementById("iv-lb-list");
  if (!box) return;
  const { data } = await sb.rpc("referral_leaderboard", { p_limit: 5 });
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    box.innerHTML = `<div class="iv-lb-empty">아직 아무도 초대하지 않았어요 —<br><b>1호 초대자</b>가 되어보세요 👑</div>`;
    return;
  }
  const medal = i => ["🥇", "🥈", "🥉"][i] || `${i + 1}`;
  box.innerHTML = rows.map((r, i) => `
    <div class="iv-lb-row">
      <span class="iv-lb-rk">${medal(i)}</span>
      <span class="iv-lb-nm">${(r.nickname || "익명").replace(/[<>&"]/g, "")}</span>
      <span class="iv-lb-ct">${r.invited}명</span>
    </div>`).join("");
}

(async function initInvite() {
  const card = document.getElementById("invite-card");
  if (!card) return;
  const linkEl = document.getElementById("iv-link");
  const stats = document.getElementById("iv-stats");
  const sb = await (window.waitForSupabaseClient ? waitForSupabaseClient() : Promise.resolve(window.supabaseClient));
  paintInviteLb(sb);   // 랭킹은 로그인 여부와 무관하게 표시
  const { data: s } = await sb.auth.getSession();
  const copyBtn = document.getElementById("iv-copy");
  const shareBtn = document.getElementById("iv-share");

  if (!s?.session) {
    stats.textContent = "로그인하고 시작하세요";
    copyBtn.onclick = shareBtn.onclick = () => ((window.GALLA_nav||function(u){location.href=u})("login.html"));
    return;
  }
  const [{ data: code }, { data: st }] = await Promise.all([
    sb.rpc("my_ref_code"), sb.rpc("my_referral_stats"),
  ]);
  if (!code) { stats.textContent = "잠시 후 다시 시도해주세요"; return; }
  const url = "https://galla.im/?ref=" + code;
  linkEl.value = url;
  stats.textContent = `지금까지 ${st?.invited || 0}명 초대 · +${Number(st?.gp || 0).toLocaleString()} GP`;

  const flash = (btn, t) => { const o = btn.textContent; btn.textContent = t; setTimeout(() => (btn.textContent = o), 1400); };
  copyBtn.onclick = async () => {
    try { await navigator.clipboard.writeText(url); } catch (e) { linkEl.select(); document.execCommand("copy"); }
    flash(copyBtn, "복사됨!");
  };
  shareBtn.onclick = async () => {
    // 🎁 초대 허브 — 갈라/갈비스/갈라톡 트랙을 골라 차별화된 카피로 공유
    if (window.GALLA_openInvite) { window.GALLA_openInvite(); return; }
    const msg = "내 편이 있는 콘텐츠 세상, 갈라. 내 링크로 가입하면 +500 GP! " + url;
    if (window.GALLA_share) { window.GALLA_share({ url, title: "GALLA 갈라", text: msg }); return; }
    if (navigator.share) { try { await navigator.share({ title: "GALLA 갈라", text: msg, url }); } catch (e) {} }
    else { try { await navigator.clipboard.writeText(msg); flash(shareBtn, "복사됨!"); } catch (e) {} }
  };
})();
