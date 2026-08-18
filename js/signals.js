/* ===========================================================
   signals.js — 공통 신호 층(추천 알고리즘의 연료)
   ───────────────────────────────────────────────────────────
   표면(숏판·롱판·광장·이슈·예측)이 달라도 여기서 쓰는 스키마는 하나다.
   지금까지는 "본 것"만 남고 **보여줬는데 안 본 것 / 얼마나 봤는지**가 없어서
   어떤 랭킹을 얹어도 검증할 수가 없었다.

   설계
   ① 카드가 화면에 1초 이상 보이면 '노출' 1건 — 랭킹의 분모다(노출 대비 클릭·완주율).
   ② 영상은 최대 시청률(%)과 머문 시간을 재서 떠날 때 1건으로 보낸다.
   ③ 전송은 **배치**(10초마다 / 탭 숨김 / 페이지 이탈). 카드마다 쏘면 요금·배터리가 죽는다.
   ④ 로그인 사용자만. 실패는 조용히 버린다 — 신호 때문에 화면이 멈추면 안 된다.
=========================================================== */
(function () {
  if (window.GALLA_signal) return;

  var Q = [], timer = null, MAX = 200;

  function sb() { return window.supabaseClient || null; }

  function push(row) {
    if (!row || !row.id || !row.kind) return;
    if (Q.length >= MAX) Q.shift();          // 넘치면 오래된 것부터 버린다(신호는 통계라 몇 건 손실 무해)
    Q.push(row);
    if (!timer) timer = setTimeout(flush, 10000);
  }

  async function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!Q.length) return;
    var c = sb(); if (!c) { Q = []; return; }
    var rows = Q.splice(0, MAX);
    try {
      var s = await c.auth.getSession();
      if (!s || !s.data || !s.data.session) return;   // 비로그인은 기록하지 않는다
      await c.rpc("log_signals", { p_rows: rows });
    } catch (e) { /* 조용히 버린다 */ }
  }

  /* 👁 카드 노출 — 1초 이상 화면에 보이면 1건. 같은 카드는 화면당 한 번만. */
  var io = null, seen = new WeakMap();
  function ensureIO() {
    if (io || !("IntersectionObserver" in window)) return io;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        var m = seen.get(e.target); if (!m) return;
        if (e.isIntersecting && e.intersectionRatio >= 0.5) {
          if (!m.t0) m.t0 = Date.now();
          if (!m.timer) m.timer = setTimeout(function () {
            if (!m.sent) { m.sent = true; push({ kind: m.kind, id: m.id, surface: m.surface, imp: 1 }); }
          }, 1000);
        } else {
          if (m.timer) { clearTimeout(m.timer); m.timer = null; }
          if (m.t0) { m.ms = (m.ms || 0) + (Date.now() - m.t0); m.t0 = 0; }
        }
      });
    }, { threshold: [0, 0.5, 1] });
    return io;
  }
  function card(el, info) {
    if (!el || !info || !info.id) return;
    if (!ensureIO()) { push({ kind: info.kind, id: info.id, surface: info.surface, imp: 1 }); return; }
    seen.set(el, { kind: info.kind, id: String(info.id), surface: info.surface || "", sent: false });
    io.observe(el);
  }

  /* ▶ 영상 시청 — 최대 시청률(%)과 머문 시간. 되감아 다시 봐도 '최대'라 부풀지 않는다. */
  function video(v, info) {
    if (!v || !info || !info.id || v.__galSig) return;
    v.__galSig = true;
    var st = { pct: 0, ms: 0, last: 0 };
    v.addEventListener("timeupdate", function () {
      var d = v.duration || 0;
      if (d > 0.5) st.pct = Math.max(st.pct, Math.min(100, Math.round((v.currentTime / d) * 100)));
      var now = Date.now();
      if (st.last && now - st.last < 2000) st.ms += now - st.last;
      st.last = now;
    });
    function done() {
      st.last = 0;
      if (st.pct <= 0 && st.ms <= 0) return;
      push({ kind: info.kind, id: String(info.id), surface: info.surface || "", ms: st.ms, pct: st.pct });
      st.pct = 0; st.ms = 0;
    }
    ["pause", "ended", "emptied"].forEach(function (ev) { v.addEventListener(ev, done); });
  }

  /* 👆 행동 — 진입·좋아요·댓글·공유·북마크. 랭킹의 분자다. */
  function act(kind, id, action, surface) {
    push({ kind: kind, id: String(id), surface: surface || "", act: action });
    if (action === "open") flush();     // 진입은 이탈 직전일 때가 많아 바로 보낸다
  }

  document.addEventListener("visibilitychange", function () { if (document.hidden) flush(); });
  window.addEventListener("pagehide", flush);

  window.GALLA_signal = { card: card, video: video, act: act, flush: flush };
})();
