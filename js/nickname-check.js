/* 🪪 닉네임 실시간 확인 — 가입·계정수정 공용
   서버(nickname_available RPC)가 최종 판정한다. 여기 검사는 안내용일 뿐,
   저장은 DB 유니크 인덱스+트리거가 강제한다(REST 직접 호출도 못 뚫는다).

   window.GALLA_bindNickCheck(inputEl, {onState}) → 상태 요소를 자동 생성해 붙인다 */
(function () {
  const MSG = {
    length: '닉네임은 2~12자로 지어주세요',
    charset: '한글·영문·숫자와 _ . - 만 쓸 수 있어요',
    reserved: '사용할 수 없는 닉네임이에요',
    taken: '이미 누군가 쓰고 있어요',
    ok: '사용할 수 있어요',
    checking: '확인 중…',
  };

  window.GALLA_bindNickCheck = function (input, opts = {}) {
    if (!input || input.dataset.nickBound) return;
    input.dataset.nickBound = '1';
    input.setAttribute('maxlength', '12');

    let stat = document.createElement('div');
    stat.className = 'nick-stat';
    input.insertAdjacentElement('afterend', stat);

    let timer = null, lastQuery = '', state = { ok: null, value: '' };
    const paint = (cls, text) => {
      stat.className = 'nick-stat' + (cls ? ' ' + cls : '');
      stat.textContent = text || '';
      opts.onState?.(state);
    };

    const check = async () => {
      const v = input.value.trim();
      state = { ok: null, value: v };
      if (!v) { paint('', ''); return; }
      // 원래 쓰던 닉네임 그대로면 검사 생략(내 것)
      if (opts.current && v === opts.current) { state.ok = true; paint('good', '지금 쓰는 닉네임이에요'); return; }
      paint('', MSG.checking);
      lastQuery = v;
      try {
        const { data } = await window.supabaseClient.rpc('nickname_available', { p_nick: v });
        if (lastQuery !== v) return;            // 늦게 온 응답 무시(경합)
        state.ok = !!data?.ok;
        paint(data?.ok ? 'good' : 'bad', data?.ok ? MSG.ok : (MSG[data?.reason] || '사용할 수 없어요'));
      } catch (_) {
        if (lastQuery !== v) return;
        state.ok = null; paint('', '');        // 확인 실패는 막지 않는다(서버가 최종 판정)
      }
    };

    input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(check, 350); });
    input.addEventListener('blur', check);
    if (input.value.trim()) check();
    return { check, get state() { return state; } };
  };

  /* 저장 실패(서버 제약 위반)를 사람 말로 */
  window.GALLA_nickError = function (err) {
    const m = String(err?.message || err || '');
    if (/users_nickname_norm_uniq|duplicate key/i.test(m)) return MSG.taken;
    if (/nickname_length/.test(m)) return MSG.length;
    if (/nickname_charset/.test(m)) return MSG.charset;
    if (/nickname_reserved/.test(m)) return MSG.reserved;
    return null;
  };
})();
