/* =========================================================
   charges.js — 갈라페이 내역 (결제 · 영수증 · 환불)

   갈라페이 = 돈이 드나드는 관문.
     들어옴 : 충전(gc_charges)          → GC 적립
     나감   : 환불(gc_refunds)          → GC 회수 + 원화 환급
              출금(withdrawals)         → 크리에이터 수익 지급
   세 줄기를 gallapay_history()가 한 타임라인으로 돌려준다.

   법적 근거(전자상거래법 §6·§17, 콘텐츠이용자보호지침):
     결제내역 조회 제공 · 청약철회(7일) · 미사용분 환불 · 환불 창구.
   환불 가능액 계산과 중복/이중환불 차단은 전부 서버(gc_refund_request)에서 한다.
   ========================================================= */
(function () {   // 전역 오염·충돌 방지 — SPA 는 페이지 스크립트를 한 문서에 다 싣는다.
// galla-predict.js 등이 이미 최상위 let supa·$ 를 선언해 두어, 감싸지 않으면
// "Identifier 'supa' has already been declared" 로 이 파일이 통째로 실행되지 않는다
// (에러는 콘솔에만 남고 화면은 그냥 빈 채로 있다 — 실측 2026-08-29 GP 지갑 잔액 '–').
let supa = null, ME = null;
const $ = id => document.getElementById(id);
const fmt = n => Math.round(Number(n) || 0).toLocaleString("ko-KR");
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const won = n => "₩" + fmt(n);

function dt(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function day(ts) {
  if (!ts) return "-";
  return new Date(ts).toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

const CHANNEL = { web: "웹 결제", ios: "App Store", android: "Google Play" };
const STATUS = {
  paid: ["결제 완료", "paid"], pending: ["결제 대기", "pending"], canceled: ["취소됨", "canceled"],
  requested: ["신청 접수", "pending"], approved: ["환급 처리 중", "pending"],
  rejected: ["거절", "rejected"], done: ["완료", "done"],
};
const badge = st => {
  const [t, cls] = STATUS[st] || [st, "canceled"];
  return `<span class="cg-badge ${cls}">${esc(t)}</span>`;
};

document.addEventListener("DOMContentLoaded", async () => {
  supa = await waitForSupabaseClient();
  const { data } = await supa.auth.getSession();
  ME = data?.session?.user || null;
  if (!ME) {
    if (confirm("로그인이 필요합니다. 로그인 페이지로 이동할까요?")) (window.GALLA_nav || (u => location.href = u))("login.html");
    else (window.GALLA_nav || (u => location.href = u))("wallet.html");
    return;
  }
  document.querySelectorAll(".cg-tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  await Promise.all([loadAll(), loadCharges()]);
});

function switchTab(tab) {
  document.querySelectorAll(".cg-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
  $("cgAll").hidden = tab !== "all";
  $("cgCharge").hidden = tab !== "charge";
  $("cgRefund").hidden = tab !== "refund";
  if (tab === "refund" && !$("cgRefund").dataset.loaded) loadRefunds();
}

/* ============ 전체 타임라인 ============ */
async function loadAll() {
  const el = $("cgAll");
  el.innerHTML = `<div class="cg-loading">불러오는 중…</div>`;
  const { data } = await supa.rpc("gallapay_history", { p_limit: 100 });
  const rows = data?.rows || [];
  if (!rows.length) {
    el.innerHTML = `<div class="cg-empty">아직 갈라페이 내역이 없어요.<br>충전하면 여기에 남습니다.</div>`;
    return;
  }
  const ICON = { charge: "💳", refund: "↩️", withdraw: "💸" };
  el.innerHTML = rows.map(r => `
    <div class="cg-row ${r.dir}">
      <div class="cg-ic">${ICON[r.kind] || "•"}</div>
      <div class="cg-meta">
        <div class="cg-t">${esc(r.title)}${r.status === "pending" || r.status === "requested" ? badge(r.status) : ""}</div>
        <div class="cg-d">${dt(r.at)}${r.channel ? " · " + (CHANNEL[r.channel] || r.channel) : ""}${r.note ? " · " + esc(r.note) : ""}</div>
      </div>
      <div class="cg-amt">
        <b class="${r.dir}">${r.dir === "in" ? "+" : "−"}${won(r.krw)}</b>
        ${r.gc != null ? `<small>${r.dir === "in" ? "+" : "−"}${fmt(r.gc)} GC</small>` : ""}
      </div>
    </div>`).join("");
}

/* ============ 결제 · 영수증 · 환불 신청 ============ */
let CHARGES = [], BLOCKED = false;

/* 🍎 인앱결제(App Store / Google Play)는 우리가 돈을 쥔 적이 없다 — 스토어가 결제자다.
   우리가 현금으로 환불하면 스토어 수수료(30%)를 그대로 손실하고, 유저가 스토어에도
   환불을 요청하면 이중 환불이 된다. 서버(gc_refund_request)가 channel<>'web' 을 막고,
   화면은 스토어 환불 경로를 안내한다. */
const STORE_GUIDE = {
  ios: { name: "App Store", url: "https://reportaproblem.apple.com" },
  android: { name: "Google Play", url: "https://support.google.com/googleplay/answer/2479637" },
};
async function loadCharges() {
  const el = $("cgCharge");
  el.innerHTML = `<div class="cg-loading">불러오는 중…</div>`;
  const { data } = await supa.rpc("gc_charge_history", { p_limit: 100 });
  if (!data?.ok) { el.innerHTML = `<div class="cg-empty">내역을 불러오지 못했어요.</div>`; return; }

  CHARGES = data.charges || [];
  BLOCKED = !!data.blocked;
  $("cgBal").innerHTML = `${fmt(data.balance)}<small> GC</small>`;
  $("cgSub").innerHTML = data.held > 0
    ? `환불 신청 중 <b>${fmt(data.held)} GC</b> · 환불 가능 <b>${fmt(data.refundable_total)} GC</b>`
    : `결제·환불·출금이 여기로 지나갑니다`;

  if (!CHARGES.length) {
    el.innerHTML = `<div class="cg-empty">아직 결제 내역이 없어요.</div>`;
    return;
  }

  el.innerHTML = CHARGES.map((c, i) => {
    const rf = c.refund;
    const open = rf && (rf.status === "requested" || rf.status === "approved");
    const store = c.store_only ? STORE_GUIDE[c.channel] : null;
    const canRefund = !store && !BLOCKED && c.status === "paid" && c.refundable > 0 && !open && rf?.status !== "done";
    return `
      <div>
        <div class="cg-row in link" data-receipt="${i}">
          <div class="cg-ic">💳</div>
          <div class="cg-meta">
            <div class="cg-t">갈라페이 충전${c.status !== "paid" ? badge(c.status) : ""}</div>
            <div class="cg-d">${dt(c.paid_at || c.created_at)} · ${CHANNEL[c.channel] || c.channel}${c.within_7d && c.status === "paid" ? " · 청약철회 기간" : ""}</div>
          </div>
          <div class="cg-amt"><b class="in">${won(c.krw)}</b><small>${fmt(c.gc)} GC</small></div>
        </div>
        ${c.status === "paid" ? `
        <div class="cg-acts">
          <button class="cg-btn" data-receipt="${i}">🧾 영수증</button>
          ${store
            ? `<button class="cg-btn" data-store="${esc(c.channel)}">${esc(store.name)}에서 환불 요청</button>`
            : open
              ? `<button class="cg-btn" disabled>${rf.status === "requested" ? "환불 신청 접수됨" : "환급 처리 중"}</button>`
              : rf?.status === "done"
                ? `<button class="cg-btn" disabled>환불 완료</button>`
                : `<button class="cg-btn ${canRefund ? "primary" : ""}" data-refund="${i}" ${canRefund ? "" : "disabled"}>
                     ${canRefund ? `↩️ 환불 신청 (${won(c.refundable)})` : BLOCKED ? "환불 신청 불가" : "환불 가능 잔액 없음"}
                   </button>`}
        </div>` : ""}
      </div>`;
  }).join("");

  el.querySelectorAll("[data-receipt]").forEach(b =>
    b.addEventListener("click", () => openReceipt(CHARGES[+b.dataset.receipt].id)));
  el.querySelectorAll("[data-refund]").forEach(b =>
    b.addEventListener("click", () => openRefund(CHARGES[+b.dataset.refund])));
  el.querySelectorAll("[data-store]").forEach(b =>
    b.addEventListener("click", () => openStoreRefund(b.dataset.store)));
}

/* ============ 환불 내역 ============ */
async function loadRefunds() {
  const el = $("cgRefund");
  el.dataset.loaded = "1";
  el.innerHTML = `<div class="cg-loading">불러오는 중…</div>`;
  const { data } = await supa.from("gc_refunds")
    .select("id,gc,krw,reason,status,admin_note,created_at,processed_at")
    .eq("user_id", ME.id).order("created_at", { ascending: false }).limit(50);
  const rows = data || [];
  if (!rows.length) {
    el.innerHTML = `<div class="cg-empty">환불 내역이 없어요.<br><br>
      결제 탭에서 <b>환불 신청</b>을 누르면<br>남은 GC만큼 환불을 신청할 수 있어요.</div>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div>
      <div class="cg-row out">
        <div class="cg-ic">↩️</div>
        <div class="cg-meta">
          <div class="cg-t">환불 신청${badge(r.status)}</div>
          <div class="cg-d">${dt(r.created_at)}${r.reason ? " · " + esc(r.reason) : ""}${r.admin_note ? "<br>💬 " + esc(r.admin_note) : ""}</div>
        </div>
        <div class="cg-amt"><b class="out">${won(r.krw)}</b><small>${fmt(r.gc)} GC 회수</small></div>
      </div>
      ${r.status === "requested" ? `<div class="cg-acts"><button class="cg-btn" data-cancel="${r.id}">신청 취소</button></div>` : ""}
    </div>`).join("");
  el.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("환불 신청을 취소할까요?")) return;
    b.disabled = true;
    const { data } = await supa.rpc("gc_refund_cancel", { p_refund_id: b.dataset.cancel });
    if (!data?.ok) { alert("이미 처리된 신청이라 취소할 수 없어요."); b.disabled = false; return; }
    refreshAll();
  }));
}

/* ============ 시트 ============ */
let dim, sheet;
function buildSheet() {
  if (sheet) return;
  dim = document.createElement("div"); dim.className = "cg-dim";
  sheet = document.createElement("div"); sheet.className = "cg-sheet";
  document.body.appendChild(dim); document.body.appendChild(sheet);
  dim.addEventListener("click", closeSheet);
}
function openSheet() { dim.classList.add("open"); requestAnimationFrame(() => sheet.classList.add("open")); }
function closeSheet() { sheet?.classList.remove("open"); dim?.classList.remove("open"); }
function bindClose() { sheet.querySelector("#cgSheetClose")?.addEventListener("click", closeSheet); }

/* 🧾 영수증 — 거래명세. 세금계산서가 아니므로 그렇게 적지 않는다(허위 표시 금지). */
async function openReceipt(id) {
  buildSheet();
  sheet.innerHTML = `<div class="cg-grip"></div><div class="cg-loading">불러오는 중…</div>`;
  openSheet();
  const { data: r } = await supa.rpc("gc_receipt", { p_charge_id: id });
  if (!r?.ok) { sheet.innerHTML = `<div class="cg-grip"></div><div class="cg-empty">영수증을 불러오지 못했어요.</div>`; return; }

  const rows = [
    ["영수증 번호", r.receipt_no],
    ["결제일시", dt(r.paid_at || r.created_at)],
    ["상품", `갈라코인 ${fmt(r.gc)} GC`],
    ["결제수단", CHANNEL[r.channel] || r.channel],
    r.pg_provider ? ["결제사", r.pg_provider] : null,
    r.pg_tx_id ? ["거래번호", r.pg_tx_id] : null,
    ["상태", (STATUS[r.status] || [r.status])[0]],
  ].filter(Boolean);

  sheet.innerHTML = `
    <div class="cg-grip"></div>
    <div class="cg-sheet-t">🧾 결제 영수증</div>
    <div class="cg-sheet-s">${day(r.paid_at || r.created_at)}</div>
    <div class="cg-rc">
      ${rows.map(([k, v]) => `<div class="cg-rc-r"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
      <div class="cg-rc-r total"><span>결제 금액</span><b>${won(r.krw)}</b></div>
      ${r.refund ? `<div class="cg-rc-r"><span>환불</span><b>${won(r.refund.krw)} · ${(STATUS[r.refund.status] || [r.refund.status])[0]}</b></div>` : ""}
    </div>
    <div class="cg-rc-issuer">
      갈라페이 (GALLA)<br>
      부가세 포함 금액입니다 · 1 GC = 1원<br>
      본 영수증은 거래 확인용이며 세금계산서가 아닙니다.<br>
      문의 <a href="support.html">고객센터</a>
    </div>
    <button class="cg-close" id="cgSheetClose">닫기</button>`;
  bindClose();
}

/* ↩️ 환불 신청 */
function openRefund(c) {
  buildSheet();
  const partial = c.refundable < c.gc;
  sheet.innerHTML = `
    <div class="cg-grip"></div>
    <div class="cg-sheet-t">↩️ 환불 신청</div>
    <div class="cg-sheet-s">${day(c.paid_at)} 결제 · ${won(c.krw)} (${fmt(c.gc)} GC)</div>
    ${partial ? `<div class="cg-warn">
      충전한 ${fmt(c.gc)} GC 중 <b>${fmt(c.gc - c.refundable)} GC를 이미 사용</b>하셨어요.<br>
      남은 <b>${fmt(c.refundable)} GC</b>만 환불됩니다 (위약금 없음).
    </div>` : c.within_7d ? `<div class="cg-warn">
      결제 후 7일 이내이고 아직 쓰지 않으셨어요 — <b>전액 환불</b>됩니다.
    </div>` : ""}
    <div class="cg-rc" style="margin-bottom:13px">
      <div class="cg-rc-r"><span>회수할 갈라코인</span><b>${fmt(c.refundable)} GC</b></div>
      <div class="cg-rc-r total"><span>환불 금액</span><b>${won(c.refundable)}</b></div>
    </div>
    <textarea class="cg-ta" id="cgReason" placeholder="환불 사유를 적어주세요 (선택)" maxlength="300"></textarea>
    <div class="cg-rc-issuer" style="margin-top:10px">
      신청하면 갈라코인이 즉시 잠기고, 확인 후 결제하신 수단으로 환급됩니다 (영업일 3~5일).
    </div>
    <button class="cg-close primary" id="cgDoRefund">환불 신청하기</button>
    <button class="cg-close" id="cgSheetClose">닫기</button>`;
  bindClose();
  sheet.querySelector("#cgDoRefund").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = "신청 중…";
    const { data } = await supa.rpc("gc_refund_request", {
      p_charge_id: c.id, p_reason: sheet.querySelector("#cgReason").value.trim() || null,
    });
    if (!data?.ok) {
      const MSG = {
        already_requested: "이미 환불을 신청한 결제예요.",
        already_refunded: "이미 환불이 완료된 결제예요.",
        nothing_refundable: "환불할 수 있는 갈라코인이 남아있지 않아요.",
        not_paid: "결제가 완료되지 않은 건이에요.",
        store_purchase: "앱에서 결제한 건은 스토어에서만 환불할 수 있어요.",
        too_many_refunds: "최근 30일 환불 신청 횟수를 넘었어요. 고객센터로 문의해 주세요.",
        refund_limit: "최근 30일 환불 금액 한도를 넘었어요. 고객센터로 문의해 주세요.",
        blocked: "결제 확인이 필요한 계정이에요. 고객센터로 문의해 주세요.",
      };
      alert(MSG[data?.reason] || "환불 신청에 실패했어요.");
      btn.disabled = false; btn.textContent = "환불 신청하기";
      return;
    }
    sheet.innerHTML = `
      <div class="cg-grip"></div>
      <div class="cg-sheet-t">✅ 환불 신청이 접수됐어요</div>
      <div class="cg-sheet-s">${won(data.krw)} · ${fmt(data.gc)} GC 회수</div>
      <div class="cg-rc-issuer" style="margin:14px 0">
        확인 후 결제하신 수단으로 환급됩니다 (영업일 3~5일).<br>
        진행 상황은 <b>환불 탭</b>에서 볼 수 있어요.
      </div>
      <button class="cg-close" id="cgSheetClose">닫기</button>`;
    bindClose();
    refreshAll();
  });
  openSheet();
}

/* 🍎 스토어 환불 안내 — 우리가 대신 환불해줄 수 없는 이유까지 솔직하게 적는다.
   ⚠️ 앱스토어 anti-steering: 여기서 "웹이 더 싸다"거나 외부 결제를 권하면 심사에 걸린다.
      환불 경로 안내만 한다. */
function openStoreRefund(channel) {
  buildSheet();
  const g = STORE_GUIDE[channel] || STORE_GUIDE.ios;
  sheet.innerHTML = `
    <div class="cg-grip"></div>
    <div class="cg-sheet-t">${esc(g.name)} 환불 안내</div>
    <div class="cg-sheet-s">앱에서 결제한 건이에요</div>
    <div class="cg-warn">
      이 결제는 <b>${esc(g.name)}</b>가 처리했어요.<br>
      환불도 ${esc(g.name)}에서만 신청할 수 있습니다.
    </div>
    <div class="cg-rc">
      <div class="cg-rc-r"><span>1</span><b style="text-align:left">아래 버튼으로 ${esc(g.name)} 환불 페이지 열기</b></div>
      <div class="cg-rc-r"><span>2</span><b style="text-align:left">해당 결제 건을 선택해 환불 요청</b></div>
      <div class="cg-rc-r"><span>3</span><b style="text-align:left">환불이 승인되면 갈라코인은 자동으로 회수됩니다</b></div>
    </div>
    <div class="cg-rc-issuer" style="margin-top:11px">
      이미 사용한 갈라코인이 있으면 회수하지 못한 만큼 결제가 제한될 수 있어요.<br>
      진행이 안 되면 <a href="support.html">고객센터</a>로 알려주세요.
    </div>
    <a class="cg-close primary" style="display:block;text-align:center;text-decoration:none;box-sizing:border-box"
       href="${esc(g.url)}" target="_blank" rel="noopener">${esc(g.name)} 환불 페이지 열기</a>
    <button class="cg-close" id="cgSheetClose">닫기</button>`;
  bindClose();
  openSheet();
}

function refreshAll() {
  $("cgRefund").dataset.loaded = "";
  loadAll(); loadCharges();
  if (!$("cgRefund").hidden) loadRefunds();
}

})();
