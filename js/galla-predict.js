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
  if (!ME) { $('pointBalance').textContent = '로그인'; return; }
  const { data, error } = await supa.rpc('ensure_balance');
  if (!error && data != null) { MY_POINTS = data; $('pointBalance').textContent = fmt(data) + 'P'; }
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
      $('createFab').style.display = v === 'markets' ? '' : 'none';
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

  // 생성 모달
  $('createFab').addEventListener('click', () => {
    if (!ME) { location.href = 'login.html'; return; }
    // 기본 마감: 7일 뒤
    const d = new Date(Date.now() + 7 * 86400000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $('mCloseAt').value = d.toISOString().slice(0, 16);
    $('createModal').hidden = false;
  });
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

  // 이미지 선택
  $('mImageBtn').addEventListener('click', () => $('mImage').click());
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
  renderMarkets();
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
        <div class="mc-prob-legend"><span class="mc-yes">YES ${p}%</span><span class="mc-no">NO ${100 - p}%</span></div>
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
        <span>💰 ${fmt(m.volume)}P</span>
        <span class="mc-go">${closed ? '결과 보기' : '예측하기'} ›</span>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.market-card').forEach(c => {
    c.onclick = () => location.href = `predict-market.html?id=${c.dataset.id}`;
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
