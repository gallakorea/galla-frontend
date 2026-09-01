/* =========================================================
   통합 글쓰기 허브 (+ 선택 바텀시트)
   - + 누르면 갈라 / 예측 / 광장 중 무엇을 쓸지 선택
   - 현재 페이지 유형이 최우선(맨 위 + 하이라이트)
   - 갈라: 1단계에선 운영진(admin_flag)만. 나머지는 "곧 열려요"
   - 예측/광장: 모든 유저 개방
   - 라우팅: 갈라→write.html / 예측→galla-predict.html?compose=1 /
             광장→plaza.html?compose=1  (해당 페이지면 모달 즉시 오픈)
   window.openWriteHub(context)  context: 'galla' | 'predict' | 'plaza'
   ========================================================= */
(function () {
  const TYPES = {
    galla: {
      key: 'galla', emoji: '⚔️', title: '갈라 발제',
      desc: '찬반이 갈리는 이슈를 던져 전투를 시작',
      accent: '#ff4d67',
    },
    predict: {
      key: 'predict', emoji: '📈', title: '예측 마켓',
      desc: '결과를 두고 포인트로 예측하는 마켓 개설',
      accent: '#3d6bff',
    },
    plaza: {
      key: 'plaza', emoji: '🗣️', title: '광장 글',
      desc: '자유롭게 이야기하고 토론하는 게시글',
      accent: '#c9d1e0',
    },
    report: {
      key: 'report', emoji: '🕵️', title: '제보하기',
      desc: '사진·영상·링크로 제보하고 GP 보상 받기',
      accent: '#33d17a',
    },
    /* 🎬 2026-09-01 추가 — posts(숏판·롱판)가 0행이었다. 만들 사람이 없어서가 아니라
       **허브에 진입로가 아예 없었다**(발제·예측·광장·제보 넷뿐).
       'clip' 은 최소 단위를 1초로 부순 새 경로, 'gallari' 는 숨어 있던 기존 업로드. */
    clip: {
      key: 'clip', emoji: '🎬', title: '조각 찍기',
      desc: '1초씩 모아서 한 편으로 — 편집 없이',
      accent: '#6f86ff',
    },
    gallari: {
      key: 'gallari', emoji: '📼', title: '숏판·롱판',
      desc: '이미 만든 영상을 올려 판에 겨루기',
      accent: '#ffb648',
    },
  };

  let sheet = null;

  function build() {
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'write-hub';
    sheet.className = 'wh-sheet';
    sheet.innerHTML = `
      <div class="wh-dim"></div>
      <div class="wh-card" role="dialog" aria-label="무엇을 쓸까요">
        <div class="wh-grip"></div>
        <div class="wh-head">무엇을 쓸까요?</div>
        <div class="wh-list"></div>
      </div>`;
    document.body.appendChild(sheet);
    sheet.querySelector('.wh-dim').addEventListener('click', () => closeSheet());
    return sheet;
  }

  /* ── 뒤로가기 = 시트 닫기 (히스토리 연동) ──
     ⚠️ 없으면 안드로이드 뒤로가기가 앱 히스토리를 밀어 홈으로 튀고,
     그 판엔 시트가 열린 채 남는다(사장님 재현). 열 때 상태를 쌓고
     popstate에서 시트만 닫는다. UI로 닫을 땐 그 상태를 back()으로 소모. */
  let histOpen = false;
  function openSheet() {
    sheet.classList.add('open');
    if (!histOpen) {
      histOpen = true;
      try { history.pushState({ galla_wh: 1 }, ''); } catch (_) {}
    }
  }
  function closeSheet(fromPop) {
    sheet.classList.remove('open');
    if (histOpen && !fromPop) { histOpen = false; try { history.back(); } catch (_) {} }
    else histOpen = false;
  }
  window.addEventListener('popstate', () => {
    if (sheet && sheet.classList.contains('open')) closeSheet(true);
  });

  async function isAdmin() {
    try {
      const supabase = window.supabaseClient;
      const { data: sess } = await supabase.auth.getSession();
      if (!sess?.session) return { logged: false, admin: false };
      const { data: prof } = await supabase
        .from('user_profiles').select('admin_flag')
        .eq('user_id', sess.session.user.id).maybeSingle();
      return { logged: true, admin: !!prof?.admin_flag };
    } catch (_) { return { logged: false, admin: false }; }
  }

  /* 셸 판(iframe) 안이면 최상위로 이동 — 판이 글쓰기 화면으로 오염되는 것 방지.
     compose=1 딥링크는 nav.js의 '앱=셸 복귀' 가드가 건드리지 않는다(작성 흐름 보호). */
  function nav(url) {
    /* SPA(app.html) 단일문서 — 글쓰기 진입은 문서 이탈 대신 스택 push.
       (예측/광장 compose=1·제보 등은 아직 스택 미지원 — 기존 이동 그대로) */
    if (window.GALLA_SPA && document.body && document.body.dataset.page === 'spa') {
      if (/^\.?\/?create\.html/.test(url)) { window.GALLA_SPA.push('create'); return; }
      if (/^\.?\/?write\.html/.test(url)) { window.GALLA_SPA.push('write'); return; }
    }
    if (window.top !== window.self) { try { window.top.location.href = url; return; } catch (_) {} }
    location.href = url;
  }
  /* 이동 직전 시트 정리 — history.back()은 부르지 않는다(최상위 이동과 경합).
     쌓인 상태는 무해한 셸 항목으로 남는다. */
  function leaveSheet() { sheet.classList.remove('open'); histOpen = false; }
  function go(type, context) {
    const onPage =
      (type === 'predict' && context === 'predict') ||
      (type === 'plaza' && context === 'plaza');
    if (onPage && typeof window.__openComposeModal === 'function') {
      closeSheet();
      window.__openComposeModal();
      return;
    }
    leaveSheet();
    if (type === 'galla')   nav('write.html');
    if (type === 'predict') nav('galla-predict.html?compose=1');
    if (type === 'plaza')   nav('search.html?tab=plaza&compose=1');   // 광장은 트렌드로 통합(2026-07-22)
    if (type === 'report')  nav('report.html');
    if (type === 'clip')    nav('clips.html');
    if (type === 'gallari') nav('gallari-write.html');
  }

  window.openWriteHub = async function (context) {
    context = context || 'galla';
    build();
    const { logged, admin } = await isAdmin();
    if (!logged) {
      sheet.classList.remove('open');
      if (confirm('로그인이 필요합니다. 로그인하시겠어요?')) {
        // SPA(app.html)면 로그인도 스택 push(문서 유지), 아니면 기존 이동
        if (window.GALLA_SPA && document.body && document.body.dataset.page === 'spa') window.GALLA_SPA.push('login');
        else (window.GALLA_nav||function(u){location.href=u})('login.html');
      }
      return;
    }

    // 현재 페이지 유형 우선 정렬
    const order = [context, ...Object.keys(TYPES).filter(k => k !== context)];
    const list = sheet.querySelector('.wh-list');
    list.innerHTML = order.map(k => {
      const t = TYPES[k];
      const locked = (k === 'galla' && !admin);
      return `
        <button class="wh-item${k === context ? ' wh-primary' : ''}${locked ? ' wh-locked' : ''}"
                data-type="${k}" style="--wh-accent:${t.accent}">
          <span class="wh-emoji">${t.emoji}</span>
          <span class="wh-txt">
            <span class="wh-title">${t.title}${locked ? ' <span class="wh-soon">곧 열려요</span>' : ''}</span>
            <span class="wh-desc">${locked ? '지금은 갈라 팀이 발제 중 · 곧 모두에게 열립니다' : t.desc}</span>
          </span>
          <span class="wh-arrow">${locked ? '' : '›'}</span>
        </button>`;
    }).join('');

    list.querySelectorAll('.wh-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.classList.contains('wh-locked')) {
          btn.classList.remove('wh-shake'); void btn.offsetWidth;
          btn.classList.add('wh-shake');
          return;
        }
        go(btn.dataset.type, context);
      });
    });

    requestAnimationFrame(() => openSheet());
  };

  /* 헤더 ＋ 버튼 → '새로 만들기' 선택 페이지(create.html) (2026-07-23 사장님 확정)
     모달/시트는 폐지 — ＋는 무조건 전체화면 선택 페이지로 간다.
     ⚠️ 반드시 nav()(셸이면 최상위)로 — 판에서 이동하면 판이 오염되고
     뒤로가기가 홈으로 튀었다(사장님 재현). 캡처 단계로 잡아 다른 페이지의
     구식 시트 바인딩(index.js 등)보다 먼저 처리한다. */
  // 문서 위임(캡처) — SPA에서 헤더가 늦게(뷰 mount 시) 생기고 탭마다 #hdrWrite가 중복돼도
  // 어느 판의 ＋든 동작한다. MPA에서도 동일(위임이라 바인딩 시점 무관).
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-write-hub], #hdrWrite');
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();   // 같은 버튼의 구식 시트 바인딩까지 차단
    if (el._skipClick) { el._skipClick = false; return; }   // 🕹 조그(꾹) 제스처 직후의 click은 무시 — 조그가 이동 처리
    nav('create.html');
  }, true);
})();
