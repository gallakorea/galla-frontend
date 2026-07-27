/* =========================================================
   📊 프로필 통계 인터랙션 — 숫자를 누르면 뭐라도 나온다
   ---------------------------------------------------------
   · My Drop  → 갈라 탭으로 이동(내 발제 목록) + 설명 토스트
   · 팔로워   → 팔로워/팔로잉 목록 시트(행 탭 = 그 사람 프로필,
                팔로우 버튼은 공용 .js-follow가 알아서 칠한다)
   · 지지/반발 → 이 숫자가 뭔지 설명 + 갈라 목록 바로가기
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient;
  const params = new URLSearchParams(location.search);
  let viewUserId = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ── 공용 시트 ── */
  let sheet = null;
  function ensureSheet() {
    if (sheet) return sheet;
    sheet = document.createElement("div");
    sheet.id = "pstat-sheet";
    sheet.innerHTML = `
      <div class="ps-dim"></div>
      <div class="ps-card">
        <div class="ps-grip"></div>
        <div class="ps-head" id="psHead"></div>
        <div class="ps-body" id="psBody"></div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector(".ps-dim").addEventListener("click", close);
    /* 상단을 끌어 내려 닫기 — 상점 시트와 같은 문법 */
    const card = sheet.querySelector(".ps-card");
    let sy = null, dy = 0, dragging = false;
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".ps-body, button, a")) return;
      sy = e.clientY; dy = 0; dragging = true; card.style.transition = "none";
      try { card.setPointerCapture(e.pointerId); } catch (_) {}
    });
    card.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - sy);
      card.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false; card.style.transition = ""; card.style.transform = "";
      if (dy > 110) close(); dy = 0;
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
    return sheet;
  }
  function open() { ensureSheet(); requestAnimationFrame(() => sheet.classList.add("open")); }
  function close() { sheet?.classList.remove("open"); }

  function toast(msg) {
    let t = document.getElementById("pstat-toast");
    if (!t) {
      t = document.createElement("div"); t.id = "pstat-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2400);
  }

  /* ── 팔로워/팔로잉 목록 ── */
  async function loadList(kind) {
    const body = sheet.querySelector("#psBody");
    body.innerHTML = `<div class="ps-empty">불러오는 중…</div>`;
    const q = kind === "followers"
      ? sb().from("follows").select("follower").eq("following", viewUserId)
      : sb().from("follows").select("following").eq("follower", viewUserId);
    const { data } = await q.limit(200);
    const ids = (data || []).map(r => r.follower || r.following);
    if (!ids.length) {
      body.innerHTML = `<div class="ps-empty">${kind === "followers" ? "아직 팔로워가 없어요." : "아직 팔로우한 사람이 없어요."}</div>`;
      return;
    }
    const [{ data: users }, giRes] = await Promise.all([
      sb().from("users").select("id,nickname,avatar_url,level").in("id", ids),
      sb().rpc("gi_of_users", { p_uids: ids }),
    ]);
    const byId = Object.fromEntries((users || []).map(u => [u.id, u]));
    const giMap = (giRes && giRes.data) || {};
    /* avatar_url은 스토리지 '경로'(uid/avatar.jpg) — 공개 URL로 변환해야 이미지가 뜬다
       (마이페이지 프로필과 동일 규약: storage.from('avatars').getPublicUrl) */
    const avaSrc = (u) => {
      if (!u.avatar_url) return null;
      if (/^https?:/.test(u.avatar_url)) return u.avatar_url;
      try { return sb().storage.from("profiles").getPublicUrl(u.avatar_url).data.publicUrl; }
      catch (_) { return null; }
    };
    /* 등급 아이콘 — 갈라리안 등급표(GI)와 일치 */
    const tierIc = (uid) => (window.GALLA_gallianTier ? window.GALLA_gallianTier(giMap[uid] || 0).icon : "🌱");
    body.innerHTML = ids.map(id => {
      const u = byId[id] || {};
      return `
        <div class="ps-row" data-uid="${id}">
          ${avaSrc(u) ? `<img class="ps-ava" src="${esc(avaSrc(u))}">` : `<span class="ps-ava ps-ava-d">👤</span>`}
          <b class="ps-nick"><span class="ps-tier">${tierIc(id)}</span>${esc(u.nickname || "익명")}</b>
          <button class="ps-follow js-follow" data-uid="${id}" type="button">+ 팔로우</button>
        </div>`;
    }).join("");
    /* 깨진 아바타(만료 URL 등) → 기본 아이콘으로 교체 */
    body.querySelectorAll("img.ps-ava").forEach(img => img.addEventListener("error", () => {
      const d = document.createElement("span");
      d.className = "ps-ava ps-ava-d"; d.textContent = "👤";
      img.replaceWith(d);
    }));
    window.GALLA_bindFollow?.(body);   // 팔로우 상태 페인트·토글·내 계정 숨김 위임
    body.querySelectorAll(".ps-row").forEach(r => r.addEventListener("click", (e) => {
      if (e.target.closest(".js-follow")) return;
      // SPA(app.html): 문서 이탈 없이 스택 push(이탈 시 nav.js 셸 복귀가 ?user를 버림) — 시트는 닫는다
      if (document.body.dataset.page === "spa" && window.GALLA_gotoProfile) { close(); window.GALLA_gotoProfile(r.dataset.uid); return; }
      location.href = "mypage.html?user=" + r.dataset.uid;
    }));
  }

  function openFollowSheet(startTab) {
    ensureSheet();
    sheet.querySelector("#psHead").innerHTML = `
      <div class="ps-tabs">
        <button class="ps-tab" data-k="followers" type="button">팔로워</button>
        <button class="ps-tab" data-k="following" type="button">팔로잉</button>
      </div>`;
    const tabs = sheet.querySelectorAll(".ps-tab");
    const go = (k) => {
      tabs.forEach(t => t.classList.toggle("on", t.dataset.k === k));
      loadList(k);
    };
    tabs.forEach(t => t.addEventListener("click", () => go(t.dataset.k)));
    go(startTab);
    open();
  }

  /* ── 지지/반발 설명 ── */
  function openVoteExplain() {
    ensureSheet();
    const sup = document.getElementById("statSupports")?.textContent || "0";
    const opp = document.getElementById("statOppose")?.textContent || "0";
    sheet.querySelector("#psHead").innerHTML = `<div class="ps-title">👍👎 지지·반발이 뭐예요?</div>`;
    sheet.querySelector("#psBody").innerHTML = `
      <div class="ps-explain">
        이 계정이 발제한 <b>갈라(이슈)들이 받은 표의 합</b>이에요.<br>
        <span class="ps-pro">👍 지지 ${esc(sup)}</span> · <span class="ps-con">👎 반발 ${esc(opp)}</span><br><br>
        지지가 많을수록 여론을 이끄는 발제자,<br>반발이 많을수록 논쟁을 부르는 발제자!
      </div>
      <button class="ps-cta" id="psGoGalla" type="button">발제한 갈라 보러 가기 →</button>`;
    sheet.querySelector("#psGoGalla").addEventListener("click", () => {
      close();
      goGallaTab();
    });
    open();
  }

  function goGallaTab() {
    const tab = document.querySelector('.tab[data-tab="galla"]');
    tab?.click();
    document.querySelector(".tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ── 배선 ── */
  async function boot() {
    for (let i = 0; i < 100 && !sb(); i++) await new Promise(r => setTimeout(r, 60));
    if (!sb()) return;
    const { data } = await sb().auth.getSession();
    viewUserId = params.get("user") || data?.session?.user?.id || null;
    if (!viewUserId) return;

    const bind = (id, fn) => {
      const unit = document.getElementById(id)?.closest(".stat-unit");
      if (!unit) return;
      unit.classList.add("ps-clickable");
      unit.addEventListener("click", fn);
    };
    bind("statDrop", () => { goGallaTab(); toast("📝 My Drop — 이 계정이 발제한 갈라 수예요"); });
    bind("statFollowers", () => openFollowSheet("followers"));
    bind("statSupports", openVoteExplain);
    bind("statOppose", openVoteExplain);

    renderDuelRecord();
  }

  /* ── ⚔️ 일기토 전적 — 끝난 대결만 센다(수락 안 된 신청·도망은 전적 아님) ── */
  async function renderDuelRecord() {
    try {
      const { data } = await sb().from("duels")
        .select("challenger,opponent,winner,result,status")
        .eq("status", "finished")
        .or(`challenger.eq.${viewUserId},opponent.eq.${viewUserId}`)
        .limit(500);
      const rows = data || [];
      if (!rows.length) return;   // 전적 없으면 칩 자체를 안 단다
      let w = 0, l = 0, d = 0;
      rows.forEach(r => {
        if (r.result === "draw") d++;
        else if (r.winner === viewUserId) w++;
        else if (r.winner) l++;
      });
      const total = w + l + d;
      if (!total) return;
      const rate = Math.round(w / total * 100);
      const host = document.querySelector(".level-row") || document.querySelector(".mp-idline");
      if (!host || document.getElementById("mpDuelRec")) return;
      const chip = document.createElement("span");
      chip.id = "mpDuelRec";
      chip.className = "mp-duel-rec";
      chip.innerHTML = `⚔️ 일기토 ${total}전 <b>${w}승</b> ${l}패${d ? " " + d + "무" : ""} · 승률 ${rate}%`;
      chip.title = "일기토 전적 (완료된 대결 기준)";
      host.appendChild(chip);
    } catch (_) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
