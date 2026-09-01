/* =========================================================
   ↔️ 트렌드 탭 순서 편집 — 헤더 톱니 버튼 → 편집 시트 (2026-07-22 재설계)
   ---------------------------------------------------------
   · 롱프레스/드래그 폐지(셸 스와이프·조그와 계속 충돌해 사장님이 전면 중단 지시).
   · 헤더 하트 오른쪽 톱니(#hdrTabOrder) 클릭 → 시트에서 ▲▼ 버튼으로 순서 변경 → 저장.
   · 제스처가 전혀 없어 충돌 원천 차단. 저장 순서는 localStorage에 유지.
   ========================================================= */
(function () {
  const KEY = 'galla_trend_tab_order';
  const OV_KEY = 'galla_trend_tab_order_v';   // 마이그레이션 버전
  /* v3: 광장 다시 맨 뒤로(사장님 재지시). v2에서 앞으로 뺐던 것 원복
     v4: '놀거리' 탭을 넣었다가 설정 화면으로 뺐다(사장님: 트렌드 탭이 빡빡함).
         저장 순서에 남아 있는 'fun'은 restore()가 실제 요소를 못 찾아 그냥 무시하므로 무해.
         ORDER_V는 되돌리지 않는다 — 낮추면 이미 4를 받은 유저의 마이그레이션 상태가 꼬인다. */
  /* v5: '맛집' 탭 신설. 저장 순서가 있는 유저는 restore()가 새 탭을 맨 뒤(광장 뒤)에
         붙여버리므로, 여기서 '날씨' 바로 뒤로 옮겨준다. 둘 다 지역 기반이라 붙어 있어야 한다. */
  /* v6: '여행' 탭 신설. 저장 순서가 있는 유저는 restore()가 새 탭을 맨 뒤(광장 뒤)에
         붙여버리므로, 여기서 '맛집' 바로 뒤로 옮겨준다 — 둘 다 '가서 겪는 것'을 다루는 탭이라
         붙어 있어야 한다. ⚠️ ORDER_V 는 절대 낮추지 않는다(이미 받은 유저의 상태가 꼬인다). */
  const ORDER_V = 6;
  const header = () => document.querySelector('.tabs-header');

  function label(el) {
    // SVG 제외한 순수 텍스트(검색·핫트렌드·뉴스·핫튜브·광장)
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // 저장된 순서를 실제 탭바에 반영 (광장 포함 전 탭 대상)
  function restore() {
    const h = header(); if (!h) return;
    let saved; try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (_) {}
    // 🔁 1회성 마이그레이션 — 광장 다시 맨 뒤로(사장님 재지시, v3).
    //    v2에서 'plaza'를 맨 앞으로 당겼던 걸 원복: 저장순서가 있으면 나머지 배치는 유지한 채
    //    'plaza'만 맨 뒤로 보낸다. 저장순서가 없으면 HTML 기본(광장 맨 뒤)이 그대로 적용되게 통과.
    try {
      const ov = parseInt(localStorage.getItem(OV_KEY) || '0', 10);
      if (ov < ORDER_V) {
        if (Array.isArray(saved) && saved.length) {
          saved = saved.filter(k => k !== 'plaza'); saved.push('plaza');
          // v5 — 맛집을 날씨 바로 뒤에 꽂는다(이미 있으면 건드리지 않는다)
          if (!saved.includes('food')) {
            const wi = saved.indexOf('weather');
            if (wi >= 0) saved.splice(wi + 1, 0, 'food');
            else saved.unshift('food');
          }
          // v6 — 여행을 맛집 바로 뒤에
          if (!saved.includes('travel')) {
            const fi = saved.indexOf('food');
            if (fi >= 0) saved.splice(fi + 1, 0, 'travel');
            else saved.push('travel');
          }
          localStorage.setItem(KEY, JSON.stringify(saved));
        }
        localStorage.setItem(OV_KEY, String(ORDER_V));
      }
    } catch (_) {}
    if (!Array.isArray(saved) || !saved.length) return;
    const items = [...h.querySelectorAll('.tab-item')];
    const byKey = Object.fromEntries(items.map(el => [el.dataset.tab, el]));
    saved.forEach(k => { if (byKey[k]) h.appendChild(byKey[k]); });
    items.forEach(el => { if (el.dataset.tab && !saved.includes(el.dataset.tab)) h.appendChild(el); });
  }
  function persist(order) { try { localStorage.setItem(KEY, JSON.stringify(order)); } catch (_) {} }

  function css() {
    if (document.getElementById('tabord-css')) return;
    const s = document.createElement('style'); s.id = 'tabord-css';
    s.textContent = `
      /* 중앙 모달 — 바닥에 붙이면 저장 버튼이 하단 내비 뒤로 가려진다(사장님 재현).
         화면 중앙에 띄우고 내부 스크롤로, 내비와 절대 겹치지 않게. */
      .tabord-overlay{ position:fixed; inset:0; z-index:2147483000; display:flex;
        align-items:center; justify-content:center; padding:22px;
        background:rgba(0,0,0,.6); opacity:0; transition:opacity .2s ease; }
      .tabord-overlay.on{ opacity:1; }
      .tabord-sheet{ width:100%; max-width:440px; max-height:min(78vh,600px); overflow-y:auto;
        background:#15171e; border:1px solid rgba(255,255,255,.09);
        border-radius:20px; padding:18px 16px 20px;
        transform:scale(.95); transition:transform .22s cubic-bezier(.2,.9,.3,1);
        box-shadow:0 24px 60px rgba(0,0,0,.6); }
      .tabord-overlay.on .tabord-sheet{ transform:scale(1); }
      .tabord-head{ display:flex; align-items:center; justify-content:space-between;
        margin:2px 2px 12px; color:#eef1f7; font-size:16px; font-weight:800; }
      .tabord-head button{ background:none; border:none; color:#9aa2b2; font-size:22px;
        line-height:1; cursor:pointer; padding:4px; }
      .tabord-tip{ color:#8b93a6; font-size:12px; margin:0 2px 12px; font-weight:600; }
      .tabord-list{ list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
      .tabord-li{ display:flex; align-items:center; gap:10px;
        background:rgba(255,255,255,.045); border:1px solid rgba(255,255,255,.07);
        border-radius:13px; padding:12px 12px; color:#e7eaf2; font-weight:700; font-size:15px;
        transition:background .15s ease, transform .15s ease; }
      .tabord-li.bump{ background:rgba(111,134,255,.16); }
      .tabord-idx{ width:22px; height:22px; flex:0 0 auto; border-radius:7px;
        display:flex; align-items:center; justify-content:center;
        background:rgba(255,255,255,.08); color:#aeb6c8; font-size:12px; font-weight:800; }
      .tabord-name{ flex:1 1 auto; }
      .tabord-move{ display:flex; gap:6px; }
      .tabord-move button{ width:38px; height:38px; border-radius:10px; cursor:pointer;
        background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.08);
        color:#dfe4ef; font-size:16px; display:flex; align-items:center; justify-content:center; }
      .tabord-move button:active{ transform:scale(.9); }
      .tabord-move button:disabled{ opacity:.28; cursor:default; }
      .tabord-save{ width:100%; margin-top:16px; height:50px; border-radius:14px; border:none;
        background:#4361ff; color:#fff; font-size:16px; font-weight:800; cursor:pointer; }
      .tabord-save:active{ transform:scale(.98); }
    `;
    document.head.appendChild(s);
  }

  let overlay = null;

  function buildRows(list, keys, labels) {
    list.innerHTML = '';
    keys.forEach((k, i) => {
      const li = document.createElement('li');
      li.className = 'tabord-li'; li.dataset.tab = k;
      li.innerHTML =
        `<span class="tabord-idx">${i + 1}</span>` +
        `<span class="tabord-name"></span>` +
        `<span class="tabord-move">` +
          `<button type="button" class="tb-up" aria-label="위로"${i === 0 ? ' disabled' : ''}>▲</button>` +
          `<button type="button" class="tb-down" aria-label="아래로"${i === keys.length - 1 ? ' disabled' : ''}>▼</button>` +
        `</span>`;
      li.querySelector('.tabord-name').textContent = labels[k] || k;
      list.appendChild(li);
    });
  }

  function reindex(list) {
    const lis = [...list.children];
    lis.forEach((li, i) => {
      li.querySelector('.tabord-idx').textContent = i + 1;
      li.querySelector('.tb-up').disabled = (i === 0);
      li.querySelector('.tb-down').disabled = (i === lis.length - 1);
    });
  }

  function open() {
    const h = header(); if (!h) return;
    // 이전 시트 잔재 제거 — 안 지우면 두 번째 클릭이 안 열리는 것처럼 보인다(사장님 재현)
    document.querySelectorAll('.tabord-overlay').forEach(o => o.remove());
    overlay = null;
    css();
    const items = [...h.querySelectorAll('.tab-item')].filter(el => el.dataset.tab);
    const keys = items.map(el => el.dataset.tab);
    const labels = Object.fromEntries(items.map(el => [el.dataset.tab, label(el)]));

    overlay = document.createElement('div');
    overlay.className = 'tabord-overlay';
    overlay.innerHTML =
      `<div class="tabord-sheet" role="dialog" aria-label="탭 순서 편집">
         <div class="tabord-head"><span>탭 순서 편집</span><button type="button" class="tabord-x" aria-label="닫기">✕</button></div>
         <p class="tabord-tip">▲▼ 로 순서를 바꾸고 저장을 누르세요.</p>
         <ul class="tabord-list"></ul>
         <button type="button" class="tabord-save">저장</button>
       </div>`;
    document.body.appendChild(overlay);
    const list = overlay.querySelector('.tabord-list');
    buildRows(list, keys, labels);
    requestAnimationFrame(() => overlay.classList.add('on'));

    const close = () => {
      if (!overlay) return;
      overlay.classList.remove('on');
      const o = overlay; overlay = null;
      setTimeout(() => o.remove(), 220);
    };

    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.tb-up, .tb-down'); if (!btn) return;
      const li = btn.closest('.tabord-li');
      if (btn.classList.contains('tb-up')) {
        const prev = li.previousElementSibling; if (prev) list.insertBefore(li, prev);
      } else {
        const next = li.nextElementSibling; if (next) list.insertBefore(next, li);
      }
      li.classList.add('bump'); setTimeout(() => li.classList.remove('bump'), 180);
      try { navigator.vibrate?.(8); } catch (_) {}
      reindex(list);
    });

    overlay.querySelector('.tabord-x').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('.tabord-save').addEventListener('click', () => {
      const order = [...list.children].map(li => li.dataset.tab);
      const hh = header();
      const byKey = Object.fromEntries([...hh.querySelectorAll('.tab-item')].map(el => [el.dataset.tab, el]));
      order.forEach(k => { if (byKey[k]) hh.appendChild(byKey[k]); });
      persist(order);
      close();
    });
  }

  function boot() {
    restore();
    // 문서 위임 클릭 — 헤더가 다시 그려지거나 셸에서 재진입해도 항상 열린다.
    // (버튼에 직접 바인딩하면 재렌더 시 리스너가 날아가 '두 번째부터 안 열림'이 됐다)
    if (!document.documentElement.dataset.tabordBound) {
      document.documentElement.dataset.tabordBound = '1';
      document.addEventListener('click', (e) => {
        const g = e.target.closest && e.target.closest('#hdrTabOrder');
        if (g) { e.preventDefault(); e.stopPropagation(); open(); }
      });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
