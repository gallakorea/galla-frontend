/* =========================================================
   hot-videos.js — 검색 > 🎬 핫영상 (유튜브 인기 급상승)
   - youtube_hot 테이블(30분마다 크론 수집)을 순위대로 렌더
   - 재생은 공식 유튜브 iframe (우리가 영상을 호스팅하지 않음 = ToS 준수)
   - '이걸로 갈라치기' → 제목·본문을 미리 채워 발제 화면으로
========================================================= */
(function () {
  let loaded = false;

  const listEl = () => document.getElementById("hot-video-list");
  const player = () => document.getElementById("hv-player");

  const esc = (s) =>
    String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // 12345678 → 1.2만
  function shortNum(n) {
    n = Number(n) || 0;
    if (n >= 100000000) return (n / 100000000).toFixed(1).replace(/\.0$/, "") + "억";
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, "") + "만";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "천";
    return String(n);
  }

  // PT1H2M3S → 1:02:03
  function dur(iso) {
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
    if (!m) return "";
    const h = +(m[1] || 0), mi = +(m[2] || 0), s = +(m[3] || 0);
    const p = (x) => String(x).padStart(2, "0");
    return h ? `${h}:${p(mi)}:${p(s)}` : `${mi}:${p(s)}`;
  }

  function timeAgo(iso) {
    if (!iso) return "";
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 3600) return Math.floor(d / 60) + "분 전";
    if (d < 86400) return Math.floor(d / 3600) + "시간 전";
    return Math.floor(d / 86400) + "일 전";
  }

  function cardHTML(v) {
    return `
      <button type="button" class="hv-card" data-id="${esc(v.video_id)}"
              data-title="${esc(v.title)}" data-ch="${esc(v.channel_title || "")}">
        <span class="hv-thumb">
          <img src="${esc(v.thumbnail || "")}" alt="" loading="lazy">
          <span class="hv-rank">${v.rank}</span>
          ${v.duration ? `<span class="hv-dur">${dur(v.duration)}</span>` : ""}
        </span>
        <span class="hv-meta">
          <span class="hv-t">${esc(v.title)}</span>
          <span class="hv-ch">${esc(v.channel_title || "")}</span>
          <span class="hv-stat">조회 ${shortNum(v.view_count)} · 👍 ${shortNum(v.like_count)} · ${timeAgo(v.published_at)}</span>
        </span>
      </button>`;
  }

  async function load() {
    const el = listEl();
    el.innerHTML = `<div class="hv-empty">불러오는 중…</div>`;

    const sb = window.supabaseClient ||
      (window.waitForSupabaseClient ? await window.waitForSupabaseClient() : null);
    if (!sb) return;

    const { data, error } = await sb
      .from("youtube_hot")
      .select("video_id,title,channel_title,thumbnail,view_count,like_count,duration,published_at,rank")
      .order("rank", { ascending: true })
      .limit(50);

    if (error) {
      el.innerHTML = `<div class="hv-empty">영상을 불러오지 못했어요.</div>`;
      return;
    }
    if (!data || !data.length) {
      el.innerHTML = `<div class="hv-empty">아직 수집된 영상이 없어요.<br>잠시 후 다시 확인해 주세요.</div>`;
      return;
    }
    el.innerHTML = data.map(cardHTML).join("");
  }

  function openPlayer(id, title, ch) {
    const p = player();
    document.getElementById("hvTitle").textContent = title;
    document.getElementById("hvOpen").href = `https://www.youtube.com/watch?v=${id}`;
    // youtube-nocookie: 재생 전 추적 쿠키를 심지 않음
    document.getElementById("hvFrame").innerHTML =
      `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0"
               title="${esc(title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write;
               encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
    p.dataset.id = id;
    p.dataset.title = title;
    p.dataset.ch = ch || "";
    p.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closePlayer() {
    const p = player();
    p.classList.add("hidden");
    document.getElementById("hvFrame").innerHTML = "";   // 재생 중지
    document.body.style.overflow = "";
  }

  function bind() {
    // 탭이 눌리면 최초 1회 로드
    document.querySelector('.tab-item[data-tab="hot"]')?.addEventListener("click", () => {
      if (loaded) return;
      loaded = true;
      load();
    });

    listEl()?.addEventListener("click", (e) => {
      const card = e.target.closest(".hv-card");
      if (!card) return;
      openPlayer(card.dataset.id, card.dataset.title, card.dataset.ch);
    });

    document.getElementById("hvClose")?.addEventListener("click", closePlayer);
    player()?.querySelector(".hv-dim")?.addEventListener("click", closePlayer);

    // ⚔️ 이걸로 갈라치기 — 제목·본문을 미리 채워 발제 화면으로
    document.getElementById("hvGalla")?.addEventListener("click", () => {
      const p = player();
      const url = `https://www.youtube.com/watch?v=${p.dataset.id}`;
      try {
        sessionStorage.setItem("GALLA_SEED", JSON.stringify({
          title: p.dataset.title,
          source: p.dataset.ch,
          url,
        }));
      } catch (_) {}
      location.href = "write.html";
    });
  }

  document.addEventListener("DOMContentLoaded", bind);
})();
