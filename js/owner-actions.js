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
    sheet.appendChild(el('div', 'oa-grab'));
    sheet.appendChild(el('div', 'oa-title', `${cfg.label || '콘텐츠'} 관리`));

    const edit = el('button', 'oa-item', '<span class="oa-ic">✏️</span> 수정하기');
    edit.onclick = () => { closeSheet(); openEdit(cfg); };
    if (cfg.editFields && cfg.editFields.length) sheet.appendChild(edit);

    // 추가 액션(부스트 등): cfg.extra = [{ icon, label, onClick }]
    (cfg.extra || []).forEach(x => {
      const b = el('button', 'oa-item', `<span class="oa-ic">${x.icon || '•'}</span> ${x.label}`);
      b.onclick = () => { closeSheet(); x.onClick && x.onClick(); };
      sheet.appendChild(b);
    });

    const del = el('button', 'oa-item oa-danger', '<span class="oa-ic">🗑</span> 삭제하기');
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
        const opts = f.options || CATEGORIES;
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
        if (cfg.onSaved) cfg.onSaved(patch);
        toast('수정되었습니다');
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
        // 자식 행까지 정리하는 SECURITY DEFINER RPC 사용(FK 제약 회피)
        const rpc = { issues: 'delete_issue', plaza_posts: 'delete_plaza_post', markets: 'delete_market' }[cfg.table];
        const { error } = await client.rpc(rpc, { p_id: cfg.id });
        if (error) {
          if ((error.message || '').includes('has_trades'))
            throw new Error('거래가 있는 예측은 삭제할 수 없습니다. (마감/정산을 이용하세요)');
          if ((error.message || '').includes('not_authorized'))
            throw new Error('삭제 권한이 없습니다.');
          throw error;
        }
        closeSheet();
        toast('삭제되었습니다');
        if (cfg.onDeleted) cfg.onDeleted();
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
