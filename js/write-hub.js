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
      desc: '결과를 두고 포인트로 베팅하는 마켓 개설',
      accent: '#3d6bff',
    },
    plaza: {
      key: 'plaza', emoji: '🗣️', title: '광장 글',
      desc: '자유롭게 이야기하고 토론하는 게시글',
      accent: '#f5cf6b',
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
    const close = () => sheet.classList.remove('open');
    sheet.querySelector('.wh-dim').addEventListener('click', close);
    return sheet;
  }

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

  function go(type, context) {
    const onPage =
      (type === 'predict' && context === 'predict') ||
      (type === 'plaza' && context === 'plaza');
    if (onPage && typeof window.__openComposeModal === 'function') {
      sheet.classList.remove('open');
      window.__openComposeModal();
      return;
    }
    if (type === 'galla')   location.href = 'write.html';
    if (type === 'predict') location.href = 'galla-predict.html?compose=1';
    if (type === 'plaza')   location.href = 'plaza.html?compose=1';
  }

  window.openWriteHub = async function (context) {
    context = context || 'galla';
    build();
    const { logged, admin } = await isAdmin();
    if (!logged) {
      sheet.classList.remove('open');
      if (confirm('로그인이 필요합니다. 로그인하시겠어요?')) location.href = 'login.html';
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

    requestAnimationFrame(() => sheet.classList.add('open'));
  };

  // 헤더 + 버튼 자동 바인딩: [data-write-hub="context"] 또는 #hdrWrite
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-write-hub]').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        window.openWriteHub(el.getAttribute('data-write-hub'));
      });
    });
  });
})();
