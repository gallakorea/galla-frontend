/* =========================================================
   🏆 시즌 랭킹 + 명예의 전당
   - 활성 시즌 리더보드(시즌 획득 GP) + 종료 카운트다운
   - 상위 3인 = 시즌한정 칭호 영구 지급 안내
   - 명예의 전당(과거 시즌 수상자)
   ========================================================= */
(function () {
  const root = () => document.getElementById("season-root");
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  function avatar(url) { return window.GALLA_avatarImg ? window.GALLA_avatarImg(url, "s-av") : ""; }
  function countdown(ends) {
    const s = (new Date(ends).getTime() - Date.now()) / 1000;
    if (s <= 0) return "정산 대기";
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}일 ${h}시간 남음`;
    if (h > 0) return `${h}시간 ${m}분 남음`;
    return `${m}분 남음`;
  }

  async function boot() {
    const sb = await waitForSupabaseClient();
    const [{ data: lb }, { data: hof }, { data: sess }] = await Promise.all([
      sb.rpc("season_leaderboard", { p_limit: 50 }),
      sb.rpc("hall_of_fame_list"),
      sb.auth.getSession(),
    ]);
    const me = sess?.session?.user?.id || null;
    if (!lb?.ok) { root().innerHTML = `<div class="s-empty">진행 중인 시즌이 없어요.</div>`; return; }

    const s = lb.season, rows = lb.rows || [];
    const top3 = rows.slice(0, 3), rest = rows.slice(3);
    const myRow = rows.find(r => r.user_id === me);

    const podium = (r, cls, medal) => r ? `
      <div class="s-pod ${cls}">
        <div class="s-pod-av" data-profile-uid="${r.user_id}">${avatar(r.avatar_url)}<span class="s-medal">${medal}</span></div>
        <div class="s-pod-name"><span class="user-name" data-user-id="${r.user_id}" data-profile-uid="${r.user_id}">${esc(r.nickname || "익명")}</span></div>
        <div class="s-pod-gp">${(r.earned || 0).toLocaleString()}</div>
      </div>` : `<div class="s-pod ${cls} empty"></div>`;

    root().innerHTML = `
      <div class="s-hero">
        <div class="s-season">${esc(s.name)} 시즌</div>
        <div class="s-cd">⏳ ${countdown(s.ends_at)}</div>
        <div class="s-prize">🏅 시즌 종료 시 <b>TOP 3</b>에게 <b>시즌한정 칭호</b> 영구 지급<br>🥇 논쟁왕 · 🥈 여론 지배자 · 🥉 논객</div>
      </div>

      <div class="s-podium">
        ${podium(top3[1], "p2", "🥈")}
        ${podium(top3[0], "p1", "🥇")}
        ${podium(top3[2], "p3", "🥉")}
      </div>

      ${myRow ? `<div class="s-me">내 순위 <b>#${myRow.rank}</b> · 이번 시즌 <b>${(myRow.earned || 0).toLocaleString()} GP</b></div>` : (me ? `<div class="s-me dim">이번 시즌 활동 기록이 아직 없어요</div>` : "")}

      <div class="s-sec">전체 순위</div>
      <div class="s-list">
        ${rest.length ? rest.map(r => `
          <div class="s-row${r.user_id === me ? " mine" : ""}">
            <span class="s-rank">${r.rank}</span>
            <span class="s-av-sm" data-profile-uid="${r.user_id}">${avatar(r.avatar_url)}</span>
            <span class="s-nick"><span class="user-name" data-user-id="${r.user_id}" data-profile-uid="${r.user_id}">${esc(r.nickname || "익명")}</span></span>
            <span class="s-gp">${(r.earned || 0).toLocaleString()}</span>
          </div>`).join("") : `<div class="s-empty small">아직 순위가 없어요. 활동해서 시즌 1위에 도전하세요!</div>`}
      </div>

      <div class="s-sec">👑 명예의 전당</div>
      <div class="s-hof">
        ${(hof && hof.length) ? hof.map(h => `
          <div class="s-hof-row">
            <span class="s-hof-title">${esc(h.title)}</span>
            <span class="s-hof-nick"><span class="user-name">${esc(h.nickname || "익명")}</span></span>
          </div>`).join("") : `<div class="s-empty small">첫 시즌이 끝나면 전설이 여기 새겨집니다.</div>`}
      </div>

      <div class="s-note">시즌 점수 = 이번 시즌 <b>누적 획득 GP</b>. 소비해도 순위는 떨어지지 않아요.</div>`;
  }
  boot();
})();
