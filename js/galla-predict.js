/* =========================================================
   galla-predict.js — 갈라예측 (폴리마켓식 예측시장, 가상 포인트)
========================================================= */

let supa = null;
let ME = null;
let allMarkets = [];
let curCat = '';
let curSort = 'volume';

const $ = id => document.getElementById(id);

function toast(msg) {
  const t = $('pmToast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 2200);
}

function pct(m) {
  const y = m.pool_yes, n = m.pool_no;
  return Math.round((n / (y + n)) * 100); // YES 확률
}
function fmt(n) {
  return Math.round(n).toLocaleString('ko-KR');
}
function timeLeft(closeAt) {
  const ms = new Date(closeAt) - Date.now();
  if (ms <= 0) return '마감';
  const d = Math.floor(ms / 86400000);
  if (d >= 1) return `D-${d}`;
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h}시간 남음`;
  return `${Math.max(1, Math.floor(ms / 60000))}분 남음`;
}

/* ============ 초기화 ============ */
document.addEventListener('DOMContentLoaded', async () => {
  supa = await waitForSupabaseClient();

  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;

  await refreshBalance();
  bindUI();
  await loadMarkets();
});

let MY_POINTS = 0;
async function refreshBalance() {
  // 비로그인: 로그인 버튼을 노출하지 않고 포인트 pill 자체를 숨김
  if (!ME) { const p = $('pointPill'); if (p) p.hidden = true; return; }
  const p = $('pointPill'); if (p) p.hidden = false;
  const { data, error } = await supa.rpc('ensure_balance');
  if (!error && data != null) { MY_POINTS = data; $('pointBalance').textContent = fmt(data) + 'P'; }
}

// 예측 마켓 생성 모달 열기 (헤더 + / FAB / ?compose=1 공용)
function openCreateModal() {
  if (!ME) { if (confirm('로그인이 필요합니다. 로그인하시겠어요?')) location.href = 'login.html'; return; }
  const d = new Date(Date.now() + 7 * 86400000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $('mCloseAt').value = d.toISOString().slice(0, 16);
  $('createModal').hidden = false;
}

function renderMyTier() {
  const card = $('myTierCard');
  if (!card) return;
  if (!ME) { card.innerHTML = `<div class="tier-card-guest">로그인하고 예언가 등급에 도전하세요</div>`; return; }
  const t = window.GALLA_tierOf(MY_POINTS);
  const nextTxt = t.next
    ? `${t.next.icon} ${t.next.name}까지 ${fmt(t.next.min - MY_POINTS)}P`
    : '최고 등급 달성! 🎉';
  card.innerHTML = `
    <div class="tier-card-top">
      <span class="tier-emoji" style="background:${t.color}22;border-color:${t.color}">${t.icon}</span>
      <div class="tier-card-info">
        <div class="tier-card-name" style="color:${t.color}">${t.name}</div>
        <div class="tier-card-pts">${fmt(MY_POINTS)}P 보유</div>
      </div>
    </div>
    <div class="tier-progress"><div class="tier-progress-fill" style="width:${t.progress}%;background:${t.color}"></div></div>
    <div class="tier-next">${nextTxt}</div>`;
}

/* ============ UI 바인딩 ============ */
function bindUI() {
  // 포인트 pill → 출석 지급
  $('pointPill').addEventListener('click', async () => {
    if (!ME) { location.href = 'login.html'; return; }
    const { data, error } = await supa.rpc('claim_daily');
    if (error) return toast('오류가 발생했습니다.');
    if (data.ok) { toast(`출석 완료! +${fmt(data.claimed)}P`); $('pointBalance').textContent = fmt(data.balance) + 'P'; }
    else if (data.reason === 'already') toast('오늘 출석 포인트는 이미 받았어요.');
  });

  // 세그먼트 탭 (마켓 / 랭킹)
  document.querySelectorAll('.seg-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.seg-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const v = t.dataset.view;
      $('view-markets').hidden = v !== 'markets';
      $('view-rank').hidden = v !== 'rank';
      if (v === 'rank') { renderMyTier(); loadLeaderboard('galla'); }
    });
  });

  // 랭킹 서브탭 (종합 / 예측왕 / 예측의 신)
  document.querySelectorAll('.rank-subtab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.rank-subtab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const r = t.dataset.rank;
      $('rankGalla').hidden = r !== 'galla';
      $('rankKing').hidden = r !== 'king';
      $('rankGod').hidden = r !== 'god';
      loadLeaderboard(r);
    });
  });

  // 카테고리 칩
  $('catChips').addEventListener('click', e => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    curCat = chip.dataset.cat;
    renderMarkets();
  });

  // 정렬
  $('sortSelect').addEventListener('change', e => { curSort = e.target.value; renderMarkets(); });

  // 생성 모달: 헤더 + 글쓰기 허브('예측') 또는 ?compose=1로 오픈
  window.__openComposeModal = openCreateModal;
  if (new URLSearchParams(location.search).get('compose') === '1') {
    setTimeout(openCreateModal, 60);
  }
  $('createClose').addEventListener('click', () => { $('createModal').hidden = true; });
  $('createModal').addEventListener('click', e => { if (e.target.id === 'createModal') $('createModal').hidden = true; });

  // 마켓 유형 토글
  document.querySelectorAll('.pm-type-tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.pm-type-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      window.__NEW_TYPE__ = t.dataset.type;
      $('mOutcomesWrap').hidden = t.dataset.type !== 'multi';
      if (t.dataset.type === 'multi' && $('mOutcomes').children.length === 0) {
        addOutcomeRow(); addOutcomeRow();
      }
    });
  });
  $('mAddOutcome').addEventListener('click', () => {
    if ($('mOutcomes').children.length >= 8) return toast('최대 8개까지 가능합니다.');
    addOutcomeRow();
  });

  // 이미지 선택 (label[for]이 파일창을 염 — 모바일 안전)
  $('mImage').addEventListener('change', e => {
    const f = e.target.files[0];
    $('mImagePreview').innerHTML = f ? `<img src="${URL.createObjectURL(f)}">` : '';
  });

  $('createSubmit').addEventListener('click', submitMarket);
}

/* ============ 마켓 로드/렌더 ============ */
let OUTCOMES_BY_MARKET = {};
async function loadMarkets() {
  const { data, error } = await supa
    .from('markets')
    .select('id,question,category,image_url,close_at,resolved,outcome,resolved_outcome_id,market_type,volume,created_at')
    .order('created_at', { ascending: false });
  if (error) { console.error(error); return; }
  allMarkets = data || [];

  // 후보 일괄 로드
  OUTCOMES_BY_MARKET = {};
  const ids = allMarkets.map(m => m.id);
  if (ids.length) {
    const { data: outs } = await supa.from('market_outcomes')
      .select('id,market_id,label,pool_yes,pool_no,sort_order,is_winner').in('market_id', ids);
    outs?.forEach(o => (OUTCOMES_BY_MARKET[o.market_id] ||= []).push(o));
    Object.values(OUTCOMES_BY_MARKET).forEach(a => a.sort((x, y) => x.sort_order - y.sort_order));
  }
  await loadReactionsAndSaves(ids);
  renderMarkets();
}

/* 좋아요/싫어요 집계 + 내 반응 + 저장 상태 */
let RX_AGG = {};       // market_id → {up, down}
let MY_RX = {};        // market_id → 1|-1
let MY_SAVED = {};     // market_id → true
async function loadReactionsAndSaves(ids) {
  RX_AGG = {}; MY_RX = {}; MY_SAVED = {};
  if (!ids.length) return;
  const [rxRes, myRxRes, savedRes] = await Promise.all([
    supa.from('market_reactions').select('market_id,value').in('market_id', ids),
    ME ? supa.from('market_reactions').select('market_id,value').eq('user_id', ME.id).in('market_id', ids) : Promise.resolve({ data: [] }),
    ME ? supa.from('market_bookmarks').select('market_id').eq('user_id', ME.id).in('market_id', ids) : Promise.resolve({ data: [] })
  ]);
  (rxRes.data || []).forEach(r => {
    const a = RX_AGG[r.market_id] ||= { up: 0, down: 0 };
    if (r.value === 1) a.up++; else a.down++;
  });
  (myRxRes.data || []).forEach(r => { MY_RX[r.market_id] = r.value; });
  (savedRes.data || []).forEach(b => { MY_SAVED[b.market_id] = true; });
}
function outcomePct(o) { return Math.round(o.pool_no / (o.pool_yes + o.pool_no) * 100); }

function renderMarkets() {
  let list = allMarkets.slice();
  if (curCat) list = list.filter(m => m.category === curCat);

  if (curSort === 'volume') list.sort((a, b) => b.volume - a.volume);
  else if (curSort === 'new') list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (curSort === 'closing') list.sort((a, b) => new Date(a.close_at) - new Date(b.close_at));

  const wrap = $('marketList');
  $('marketsEmpty').hidden = list.length > 0;
  wrap.innerHTML = list.map(m => {
    const closed = m.resolved || new Date(m.close_at) <= Date.now();
    const statusBadge = m.resolved
      ? `<span class="mc-resolved yes">✔ 정산 완료</span>`
      : `<span class="mc-time">${timeLeft(m.close_at)}</span>`;
    const outs = OUTCOMES_BY_MARKET[m.id] || [];

    let probBlock;
    if (m.market_type === 'multi' && outs.length) {
      // 확률 높은 순 top 3
      const top = outs.map(o => ({ label: o.label, p: outcomePct(o), win: o.is_winner }))
        .sort((a, b) => b.p - a.p).slice(0, 3);
      probBlock = `<div class="mc-multi">
        ${top.map(o => `<div class="mc-multi-row ${o.win ? 'win' : ''}">
          <span class="mc-multi-label">${escapeHtml(o.label)}${o.win ? ' 👑' : ''}</span>
          <span class="mc-multi-pct">${o.p}%</span>
        </div>`).join('')}
        ${outs.length > 3 ? `<div class="mc-multi-more">+${outs.length - 3}개 선택지</div>` : ''}
      </div>`;
    } else {
      const p = outs[0] ? outcomePct(outs[0]) : 50;
      probBlock = `<div class="mc-prob">
        <div class="mc-prob-bar"><div class="mc-prob-yes" style="width:${p}%"></div></div>
        <div class="mc-prob-legend"><span class="mc-yes">👍 YES ${p}%</span><span class="mc-no">👎 NO ${100 - p}%</span></div>
      </div>`;
    }

    return `
    <div class="market-card" data-id="${m.id}">
      <div class="mc-top">
        ${m.image_url ? `<img class="mc-thumb" src="${m.image_url}" loading="lazy">` : `<div class="mc-thumb mc-thumb-ph">🔮</div>`}
        <div class="mc-head">
          <div class="mc-q">${escapeHtml(m.question)}</div>
          <div class="mc-meta">${m.category || ''} · ${statusBadge}${m.market_type === 'multi' ? ' · 여러 선택지' : ''}</div>
        </div>
      </div>
      ${probBlock}
      <div class="mc-foot">
        <span class="mc-stats">
          <span>💰 ${fmt(m.volume)}P</span>
          <button class="mc-act mc-like ${MY_RX[m.id] === 1 ? 'on' : ''}" data-act="like" data-id="${m.id}">👍 <span>${RX_AGG[m.id]?.up || 0}</span></button>
          <button class="mc-act mc-dislike ${MY_RX[m.id] === -1 ? 'on' : ''}" data-act="dislike" data-id="${m.id}">👎 <span>${RX_AGG[m.id]?.down || 0}</span></button>
          <button class="mc-act mc-save ${MY_SAVED[m.id] ? 'on' : ''}" data-act="save" data-id="${m.id}" aria-label="저장"><svg class="ic-bookmark" viewBox="0 0 24 24"><path d="M17 21L12 17.25L7 21V5C7 3.89543 7.89543 3 9 3H15C16.1046 3 17 3.89543 17 5V21Z"/></svg></button>
          <button class="mc-act mc-share" data-act="share" data-id="${m.id}" data-title="${escapeHtml(m.question)}" aria-label="공유"><svg class="ic-share" viewBox="0 0 24 24"><path d="M22 3L11 14"/><path d="M22 3L15 21L11 14L2 10L22 3Z"/></svg></button>
        </span>
        <span class="mc-go">${closed ? '결과 보기' : '예측하기'} ›</span>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.market-card').forEach(c => {
    c.onclick = (e) => {
      if (e.target.closest('.mc-actions')) return; // 액션 버튼은 이동 막음
      location.href = `predict-market.html?id=${c.dataset.id}`;
    };
  });
  bindMarketActions(wrap);
}

/* 카드 액션: 좋아요/싫어요/저장 (이벤트 위임) */
function bindMarketActions(wrap) {
  wrap.querySelectorAll('.mc-act').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const id = Number(btn.dataset.id);
      const act = btn.dataset.act;

      if (act === 'share') {
        const url = new URL(`predict-market.html?id=${id}`, location.href).href;
        if (navigator.share) {
          try { await navigator.share({ title: btn.dataset.title || 'GALLA', url }); return; }
          catch (err) { if (err.name === 'AbortError') return; }
        }
        try { await navigator.clipboard.writeText(url); toast('링크가 복사되었습니다.'); }
        catch { toast('링크 복사에 실패했습니다.'); }
        return;
      }

      if (!ME) { if (confirm('로그인이 필요합니다. 로그인하시겠어요?')) location.href = 'login.html'; return; }
      btn.disabled = true;
      try {
        if (act === 'save') {
          if (MY_SAVED[id]) {
            await supa.from('market_bookmarks').delete().eq('market_id', id).eq('user_id', ME.id);
            delete MY_SAVED[id];
          } else {
            await supa.from('market_bookmarks').insert({ market_id: id, user_id: ME.id });
            MY_SAVED[id] = true;
          }
          btn.classList.toggle('on', !!MY_SAVED[id]);
        } else {
          const val = act === 'like' ? 1 : -1;
          const mine = MY_RX[id];
          const agg = RX_AGG[id] ||= { up: 0, down: 0 };
          if (mine === val) {
            await supa.from('market_reactions').delete().eq('market_id', id).eq('user_id', ME.id);
            delete MY_RX[id];
            if (val === 1) agg.up--; else agg.down--;
          } else {
            await supa.from('market_reactions').upsert({ market_id: id, user_id: ME.id, value: val }, { onConflict: 'market_id,user_id' });
            if (mine === 1) agg.up--; else if (mine === -1) agg.down--;
            if (val === 1) agg.up++; else agg.down++;
            MY_RX[id] = val;
          }
          // 두 버튼 갱신
          const card = btn.closest('.market-card');
          const likeB = card.querySelector('.mc-like'), disB = card.querySelector('.mc-dislike');
          likeB.querySelector('span').textContent = agg.up;
          disB.querySelector('span').textContent = agg.down;
          likeB.classList.toggle('on', MY_RX[id] === 1);
          disB.classList.toggle('on', MY_RX[id] === -1);
        }
      } catch (err) {
        console.error('[predict action]', err);
      } finally {
        btn.disabled = false;
      }
    };
  });
}

function addOutcomeRow(val = '') {
  const row = document.createElement('div');
  row.className = 'pm-outcome-row';
  row.innerHTML = `<input class="pm-input pm-outcome-input" maxlength="30" placeholder="선택지 이름" value="${val}">
    <button type="button" class="pm-outcome-del">✕</button>`;
  row.querySelector('.pm-outcome-del').addEventListener('click', () => {
    if ($('mOutcomes').children.length <= 2) return toast('최소 2개는 필요합니다.');
    row.remove();
  });
  $('mOutcomes').appendChild(row);
}

/* ============ 마켓 생성 ============ */
async function submitMarket() {
  const q = $('mQuestion').value.trim();
  const closeAt = $('mCloseAt').value;
  const type = window.__NEW_TYPE__ || 'binary';
  if (!q) return toast('질문을 입력하세요.');
  if (!closeAt) return toast('마감 일시를 선택하세요.');
  if (new Date(closeAt) <= new Date()) return toast('마감은 미래 시각이어야 합니다.');

  let outcomes = null;
  if (type === 'multi') {
    const labels = [...document.querySelectorAll('.pm-outcome-input')].map(i => i.value.trim()).filter(Boolean);
    if (labels.length < 2) return toast('선택지를 2개 이상 입력하세요.');
    outcomes = labels.map(l => ({ label: l }));
  }

  const btn = $('createSubmit');
  btn.disabled = true; btn.textContent = '만드는 중…';
  try {
    let imageUrl = null;
    const f = $('mImage').files[0];
    if (f) {
      btn.textContent = '이미지 업로드 중…';
      imageUrl = await window.GALLA_UPLOAD_MEDIA(f, 'image');
    }
    const { data, error } = await supa.rpc('create_market', {
      p_question: q,
      p_description: $('mDesc').value.trim() || null,
      p_category: $('mCategory').value,
      p_image_url: imageUrl,
      p_close_at: new Date(closeAt).toISOString(),
      p_outcomes: outcomes,
      p_liquidity: 1000
    });
    if (error) throw error;
    $('createModal').hidden = true;
    $('mQuestion').value = ''; $('mDesc').value = ''; $('mImage').value = ''; $('mImagePreview').innerHTML = '';
    toast('예측 마켓이 생성되었습니다!');
    location.href = `predict-market.html?id=${data}`;
  } catch (e) {
    console.error(e);
    toast('마켓 생성에 실패했습니다.');
  } finally {
    btn.disabled = false; btn.textContent = '마켓 만들기';
  }
}

/* ============ 리더보드 ============ */
async function loadLeaderboard(kind) {
  const map = { galla: 'gallaList', king: 'kingList', god: 'godList' };
  const el = $(map[kind]);
  if (!el || el.dataset.loaded) return;
  el.innerHTML = `<div class="lb-loading">불러오는 중…</div>`;
  const badge = window.GALLA_tierBadge;

  if (kind === 'galla') {
    const { data } = await supa.from('galla_rank')
      .select('*').order('rank', { ascending: true }).limit(50);
    el.innerHTML = (data || []).map((r, i) => `
      <div class="lb-row">
        <span class="lb-rank ${i < 3 ? 'top' : ''}">${medal(i)}</span>
        <span class="lb-name">${escapeHtml(r.nickname || '익명')}<br>${badge(r.points)}</span>
        <span class="lb-stat">${fmt(r.points)}P</span>
      </div>`).join('') || emptyLB();
  } else if (kind === 'king') {
    const { data } = await supa.from('predict_king_leaderboard')
      .select('*').order('profit', { ascending: false }).limit(50);
    el.innerHTML = (data || []).map((r, i) => `
      <div class="lb-row">
        <span class="lb-rank ${i < 3 ? 'top' : ''}">${medal(i)}</span>
        <span class="lb-name">${escapeHtml(r.nickname || '익명')} ${title(i, 'king')}<br><span class="lb-sub">적중 ${r.wins}회</span></span>
        <span class="lb-stat">${r.profit >= 0 ? '+' : ''}${fmt(r.profit)}P</span>
      </div>`).join('') || emptyLB();
  } else {
    const { data } = await supa.from('predict_god_leaderboard')
      .select('*').order('total_volume', { ascending: false }).limit(50);
    el.innerHTML = (data || []).map((r, i) => `
      <div class="lb-row">
        <span class="lb-rank ${i < 3 ? 'top' : ''}">${medal(i)}</span>
        <span class="lb-name">${escapeHtml(r.nickname || '익명')} ${title(i, 'god')}<br><span class="lb-sub">마켓 ${r.markets_created}개</span></span>
        <span class="lb-stat">💰 ${fmt(r.total_volume)}P · 👥 ${r.participants}</span>
      </div>`).join('') || emptyLB();
  }
  el.dataset.loaded = '1';
}
function medal(i) { return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1); }
function title(i, kind) {
  if (i !== 0) return '';
  return kind === 'king' ? '<span class="lb-title king">👑 예측왕</span>' : '<span class="lb-title god">🔮 예측의 신</span>';
}
function emptyLB() { return `<div class="empty-zone">아직 랭킹이 없습니다.</div>`; }

function escapeHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
