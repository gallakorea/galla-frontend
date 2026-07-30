/* ===========================================================
   owner-actions.js
   - 작성 콘텐츠(이슈/예측/광장) 소유자·관리자용 수정/삭제 공용 모듈
   - window.GALLA_openOwnerMenu(cfg) : ⋯ 눌렀을 때 바텀시트 열기
       cfg = {
         table:  'issues' | 'plaza_posts' | 'markets',
         id, ownerId,                 // 콘텐츠 id, 소유자 uuid
         label:  '갈라' | '광장 글' | '예측',
         editFields: [{ key, label, type:'text'|'textarea'|'datetime', value }],
         onSaved(patch),              // 수정 저장 성공 콜백(부분 갱신용)
         onDeleted(),                 // 삭제 성공 콜백(리다이렉트/카드제거)
         deleteHint                   // 삭제 관련 안내(예측: 거래 있으면 불가)
       }
   - RLS가 실제 방어선. 여기선 소유자/관리자만 메뉴를 노출(UX)하고,
     실제 update/delete는 RLS가 재차 검증한다.
=========================================================== */
(function () {
  let ME = null; // { uid, admin }

  /* 시트 아이콘 — 이모지는 기기마다 모양·크기가 제각각이라 SVG로 통일.
     24×24 · stroke 1.7 · currentColor (위험 항목은 부모 색을 그대로 물려받음) */
  const svg = (d) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

  const IC = {
    edit:  svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>'),
    trash: svg('<path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M19 6l-.8 13.1a2 2 0 0 1-2 1.9H7.8a2 2 0 0 1-2-1.9L5 6"/><path d="M10 11v6M14 11v6"/>'),
    boost: svg('<path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1 0-2.9a2.1 2.1 0 0 0-3-.1z"/><path d="M12 15l-3-3a12 12 0 0 1 3-6.5C13.7 3.7 16 3 19.5 3c.7 0 1.3.1 1.5.3.2.2.3.8.3 1.5 0 3.5-.7 5.8-2.5 7.5A12 12 0 0 1 12 15z"/><path d="M14.5 9.5h.01"/>'),
    dot:   svg('<circle cx="12" cy="12" r="2.5"/>'),
  };

  // 앱 공통 카테고리(write.html select와 동일) — 수정 시 드롭다운으로 노출
  const CATEGORIES = ["정치·사회","경제·투자","직장·경력","연애·결혼","생활·일상","패션·뷰티","엔터·스포츠","세계·여행","음식·맛집","19금","기타"];
  window.GALLA_CATEGORIES = CATEGORIES;

  // 페이지마다 클라이언트를 window.supabaseClient 또는 window.supabase 에 둠 → 둘 다 지원
  function sb() {
    const c = window.supabaseClient;
    if (c && c.auth && c.from) return c;
    const s = window.supabase;
    if (s && s.auth && s.from) return s;
    return null;
  }

  async function getMe() {
    if (ME) return ME;
    const client = sb();
    if (!client) return { uid: null, admin: false };
    const { data } = await client.auth.getUser();
    const uid = data?.user?.id || null;
    let admin = false;
    if (uid) {
      const { data: prof } = await client.from('user_profiles').select('admin_flag').eq('user_id', uid).maybeSingle();
      admin = !!prof?.admin_flag;
    }
    ME = { uid, admin };
    return ME;
  }

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // 앱 셸(app-shell) 안의 iframe pane인지 — 셸 하단 네비가 iframe 위를 덮으므로
  // 바텀시트 하단(닫기)이 가리지 않도록 여백을 더해준다
  function inShell() {
    try { return window.top !== window.self && !!window.top.document.getElementById('shell-track'); }
    catch (_) { return false; }
  }

  function closeSheet() {
    const ex = document.querySelector('.oa-overlay');
    if (ex) ex.remove();
  }

  function overlay() {
    closeSheet();
    const ov = el('div', 'oa-overlay');
    ov.addEventListener('click', e => { if (e.target === ov) closeSheet(); });
    document.body.appendChild(ov);
    return ov;
  }

  async function openMenu(cfg) {
    const me = await getMe();
    const canManage = me.uid && (me.uid === cfg.ownerId || me.admin);
    if (!canManage) return false; // 소유자/관리자 아님 → 메뉴 없음(호출측이 기존 동작 유지)

    const ov = overlay();
    const sheet = el('div', 'oa-sheet');
    if (inShell()) sheet.classList.add('oa-shell-pad');
    sheet.appendChild(el('div', 'oa-grab'));
    sheet.appendChild(el('div', 'oa-title', `${cfg.label || '콘텐츠'} 관리`));

    const edit = el('button', 'oa-item', `<span class="oa-ic">${IC.edit}</span> 수정하기`);
    edit.onclick = () => { closeSheet(); openEdit(cfg); };
    if (cfg.editFields && cfg.editFields.length) sheet.appendChild(edit);

    // 추가 액션(부스트 등): cfg.extra = [{ icon, label, onClick }]
    // icon 은 IC 의 키('boost' 등)거나 직접 넘긴 SVG 문자열
    (cfg.extra || []).forEach(x => {
      const ic = IC[x.icon] || x.icon || IC.dot;
      const b = el('button', 'oa-item', `<span class="oa-ic">${ic}</span> ${x.label}`);
      b.onclick = () => { closeSheet(); x.onClick && x.onClick(); };
      sheet.appendChild(b);
    });

    const del = el('button', 'oa-item oa-danger', `<span class="oa-ic">${IC.trash}</span> 삭제하기`);
    del.onclick = () => { closeSheet(); confirmDelete(cfg); };
    sheet.appendChild(del);

    const cancel = el('button', 'oa-item oa-cancel', '닫기');
    cancel.onclick = closeSheet;
    sheet.appendChild(cancel);

    ov.appendChild(sheet);
    requestAnimationFrame(() => sheet.classList.add('show'));
    return true;
  }

  function openEdit(cfg) {
    const ov = overlay();
    const modal = el('div', 'oa-modal');
    modal.appendChild(el('div', 'oa-modal-title', `${cfg.label || '콘텐츠'} 수정`));

    const inputs = {};
    (cfg.editFields || []).forEach(f => {
      const wrap = el('div', 'oa-field');
      wrap.appendChild(el('label', 'oa-label', f.label));
      let input;
      if (f.type === 'textarea') {
        input = el('textarea', 'oa-input oa-textarea');
        input.value = f.value || '';
      } else if (f.type === 'select') {
        input = el('select', 'oa-input oa-select');
        const opts = (f.options || CATEGORIES).slice();
        // 현재 값이 옵션에 없으면 맨 앞에 넣어 그대로 선택 — 기존 카테고리가
        // 첫 항목으로 뒤바뀌어 저장되는 오염(예: 광장 '일상' → '정치·사회')을 차단
        if (f.value && !opts.includes(f.value)) opts.unshift(f.value);
        opts.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt; o.textContent = opt;
          if (opt === f.value) o.selected = true;
          input.appendChild(o);
        });
      } else if (f.type === 'datetime') {
        input = el('input', 'oa-input');
        input.type = 'datetime-local';
        input.value = f.value ? toLocalDT(f.value) : '';
      } else {
        input = el('input', 'oa-input');
        input.type = 'text';
        input.value = f.value || '';
      }
      inputs[f.key] = { input, type: f.type };
      wrap.appendChild(input);
      modal.appendChild(wrap);
    });

    const row = el('div', 'oa-row');
    const cancel = el('button', 'oa-btn oa-btn-ghost', '취소');
    cancel.onclick = closeSheet;
    const save = el('button', 'oa-btn oa-btn-gold', '저장');
    save.onclick = async () => {
      save.disabled = true; save.textContent = '저장 중…';
      const patch = {};
      Object.entries(inputs).forEach(([k, { input, type }]) => {
        let v = input.value;
        if (type === 'datetime') v = v ? new Date(v).toISOString() : null;
        else v = (v || '').trim();
        patch[k] = v;
      });
      try {
        const client = sb();
        const { error } = await client.from(cfg.table).update(patch).eq('id', cfg.id);
        if (error) throw error;
        closeSheet();
        (window.GALLA_toast || toast)('✅ 수정되었습니다');
        // 이동/리로드(onSaved)가 토스트를 덮지 않게 잠깐 뒤에 실행
        setTimeout(() => { if (cfg.onSaved) cfg.onSaved(patch); }, 1000);
      } catch (e) {
        save.disabled = false; save.textContent = '저장';
        alert('수정 실패: ' + (e.message || e));
      }
    };
    row.appendChild(cancel); row.appendChild(save);
    modal.appendChild(row);

    ov.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  function confirmDelete(cfg) {
    const ov = overlay();
    const modal = el('div', 'oa-modal');
    modal.appendChild(el('div', 'oa-modal-title', `${cfg.label || '콘텐츠'} 삭제`));
    modal.appendChild(el('p', 'oa-desc', '삭제하면 되돌릴 수 없습니다.' + (cfg.deleteHint ? '<br>' + cfg.deleteHint : '')));
    const row = el('div', 'oa-row');
    const cancel = el('button', 'oa-btn oa-btn-ghost', '취소');
    cancel.onclick = closeSheet;
    const del = el('button', 'oa-btn oa-btn-danger', '삭제');
    del.onclick = async () => {
      del.disabled = true; del.textContent = '삭제 중…';
      try {
        const client = sb();
        if (!client) throw new Error('연결 준비 중이에요. 잠시 후 다시 시도해주세요.');
        // 자식 행까지 정리하는 SECURITY DEFINER RPC 사용(FK 제약 회피)
        const rpc = { issues: 'delete_issue', plaza_posts: 'delete_plaza_post', markets: 'delete_market', posts: 'delete_post' }[cfg.table];
        // 무한 스피너 방지: 8초 내 응답 없으면 실패 처리(토큰 갱신 스톨 등 대비)
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('응답이 지연되고 있어요. 다시 시도해주세요.')), 8000));
        const { error } = await Promise.race([client.rpc(rpc, { p_id: cfg.id }), timeout]);
        if (error) {
          if ((error.message || '').includes('has_trades'))
            throw new Error('거래가 있는 예측은 삭제할 수 없습니다. (마감/정산을 이용하세요)');
          if ((error.message || '').includes('not_authorized'))
            throw new Error('삭제 권한이 없습니다.');
          throw error;
        }
        closeSheet();
        (window.GALLA_toast || toast)('🗑️ 삭제되었습니다');
        // 페이지 이동(onDeleted)이 토스트를 덮지 않게 잠깐 뒤에 실행
        setTimeout(() => { if (cfg.onDeleted) cfg.onDeleted(); }, 1100);
      } catch (e) {
        del.disabled = false; del.textContent = '삭제';
        alert('삭제 실패: ' + (e.message || e));
      }
    };
    row.appendChild(cancel); row.appendChild(del);
    modal.appendChild(row);
    ov.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  }

  function toLocalDT(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function toast(msg) {
    const t = el('div', 'oa-toast', msg);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
  }

  // 소유자/관리자인지 미리 확인(버튼 노출 제어용)
  window.GALLA_canManage = async function (ownerId) {
    const me = await getMe();
    return !!(me.uid && (me.uid === ownerId || me.admin));
  };
  window.GALLA_openOwnerMenu = openMenu;
})();
