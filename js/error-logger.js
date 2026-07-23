/* 🩺 GALLA 클라이언트 에러 로거 — 무료 자체 수집(Supabase client_errors).
   출시 후 실사용자 폰에서 나는 JS 에러·프로미스 거절을 관리자가 볼 수 있게 한다.
   설계: 세션당 상한·동일 메시지 중복 억제·노이즈 필터·supabase 준비 전 큐잉. */
(function () {
  if (window.__gallaErrLogger) return;
  window.__gallaErrLogger = true;

  var SENT = {};            // 메시지별 세션 중복 억제
  var count = 0, MAX = 20;  // 세션당 최대 전송(무한 루프 방지)
  var queue = [];

  // 확장프로그램·브라우저 노이즈는 버린다(신호 대비 잡음)
  var IGNORE = [
    /ResizeObserver loop/i,
    /Script error\.?$/i,           // 크로스오리진 스크립트(스택 없음) — 정보 없음
    /Non-Error promise rejection/i,
    /extension:\/\//i, /chrome-extension/i, /moz-extension/i,
    /Load failed$/i,               // 사용자 네트워크 순단(취소된 fetch)
    /The operation was aborted/i,
    /play\(\) request was interrupted/i,  // 오디오/비디오 재생 인터럽트(무해)
  ];
  function noise(msg, src) {
    var s = (msg || '') + ' ' + (src || '');
    for (var i = 0; i < IGNORE.length; i++) if (IGNORE[i].test(s)) return true;
    return false;
  }
  function ver() {
    try {
      var m = [].map.call(document.scripts, function (x) { return (x.src || '').match(/[?&]v=(\d{6})/); }).filter(Boolean)[0];
      return m ? m[1] : '';
    } catch (_) { return ''; }
  }
  function client() { return window.supabaseClient || window.supabase && window.supabase.__client || null; }

  function flush() {
    var sb = client();
    if (!sb || !sb.rpc) return;
    while (queue.length) {
      var e = queue.shift();
      try { sb.rpc('log_client_error', e).then(function () {}, function () {}); } catch (_) {}
    }
  }
  function send(kind, message, stack, source, line, col) {
    if (count >= MAX) return;
    if (!message || noise(message, source)) return;
    var key = kind + '|' + message.slice(0, 120) + '|' + (line || '');
    if (SENT[key]) return;
    SENT[key] = 1; count++;
    queue.push({
      p_kind: kind, p_message: String(message).slice(0, 500),
      p_stack: stack ? String(stack).slice(0, 4000) : null,
      p_source: source ? String(source).slice(0, 300) : null,
      p_line: line || null, p_col: col || null,
      p_ver: ver(), p_path: (location.pathname + location.search).slice(0, 200),
    });
    flush();
  }

  window.addEventListener('error', function (ev) {
    // 리소스 로드 실패(img/script 404)는 message 없음 → 스킵(별도 노이즈)
    if (!ev || !ev.message) return;
    send('error', ev.message, ev.error && ev.error.stack, ev.filename, ev.lineno, ev.colno);
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev && ev.reason;
    var msg = r && (r.message || r.toString && r.toString()) || 'unhandledrejection';
    send('promise', msg, r && r.stack, location.pathname);
  });

  // supabase 클라이언트가 늦게 뜨는 페이지 대비 — 준비되면 큐 비우기
  var tries = 0;
  var t = setInterval(function () { if (client() || ++tries > 40) { clearInterval(t); flush(); } }, 500);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) flush(); });

  // 수동 로깅 훅(원하면 catch 블록에서 window.GALLA_logError(e) 호출)
  window.GALLA_logError = function (e, ctx) {
    try { send('manual', (ctx ? ctx + ': ' : '') + (e && (e.message || e) || 'error'), e && e.stack); } catch (_) {}
  };
})();
