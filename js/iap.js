/* 💳 iap.js — 앱 안에서 구독과 GC 충전을 산다(애플 StoreKit · 구글 Play Billing).
 *
 * 왜 프론트에 이만큼이 필요한가:
 *   결제는 스토어가 하고, '무엇을 줄지'는 서버가 정한다. 이 파일은 그 사이를 잇기만 한다.
 *   영수증을 받아 verify-iap 로 넘기고, 서버가 등급·잔액을 올린 뒤에야 화면을 갱신한다.
 *   ⚠️ 여기서 등급이나 GC 를 켜면 안 된다 — 클라가 켜는 재화는 공짜 재화와 같은 말이다.
 *
 * ⚠️ 가격은 우리가 적지 않는다. 스토어가 준 현지 표시가(offer.pricingPhases[0].price)를 그대로 쓴다.
 *    ₩ 를 우리가 하드코딩하면 통화·세율·지역이 어긋나고, 심사에서도 문제가 된다(anti-steering).
 *
 * ⚠️ 상품 ID 의 진실은 서버다.
 *   구독 = `sub_products`, 소모성(GC) = `gc_products`. 여기 적힌 ID 가 서버와 어긋나면
 *   결제는 되는데 지급이 안 된다(verify-iap 가 상품을 못 찾아 조용히 실패한다).
 *   그래서 GC 목록은 아예 서버(`gc_charge_packages`)에서 받아 등록한다 — 손으로 옮겨 적지 않는다.
 *
 * 노출:
 *   GALLA_iapReady()            결제를 걸 수 있는 상태인가
 *   GALLA_subOffers()           [{tier, id, price, raw}] — 스토어가 준 구독 상품·표시가
 *   GALLA_buySub(tier)          구독 구매 → 검증 → 등급 반영까지
 *   GALLA_gcOffers()            [{pkg, gc, id, price}] — GC 패키지·스토어 표시가
 *   GALLA_ensureGcProducts()    GC 카탈로그를 서버에서 받아 등록하고 오퍼를 돌려준다(충전 시트가 부른다)
 *   GALLA_buyGC(pkg)            GC 충전 구매 → 검증 → 잔액 반영까지
 *   GALLA_tipOffers()           [{id, price}] — 후원 티어·스토어 표시가
 *   GALLA_buyTip(productId)     후원 구매(받는 사람은 서버 pending 에 적혀 있다)
 *   GALLA_restorePurchases()    기기 바꿨을 때 되살리기(스토어 심사 필수 항목)
 */
(function () {
  /* 구독 상품 — 서버 `sub_products` 의 active 행과 1:1 이어야 한다.
     ⚠️ 상품 ID 는 만들면 삭제·재사용 불가. 2026-09-04 에 im.galla.app.* → im.galla.* 로 정리했다.
     ⚠️ 안드로이드도 iOS 와 같은 ID 를 쓴다(2026-09-09). 예전엔 `sub_daily` 였는데 서버 표는
        android 채널에도 `im.galla.sub.daily` 로 들어 있었다 — 그대로 뒀으면 Play 결제가
        성공한 뒤 verify-iap 가 상품을 못 찾아 **돈만 내고 등급이 안 켜졌을** 것이다.
        Play 에 구독을 아직 안 만들었으므로 지금이 맞출 수 있는 마지막 시점이었다.
     ⚠️ `companion_sometimes`(999원)·`companion_plus` 는 2026-09-08 에 폐기됐다.
        서버 ai_tiers·sub_products 에서 이미 빠졌으므로 여기서도 지운다. */
  const SUBS = {
    ios: {
      companion_daily: "im.galla.sub.daily",
      companion_always: "im.galla.sub.always",
      companion_soul: "im.galla.sub.soul",
    },
    android: {
      companion_daily: "im.galla.sub.daily",
      companion_always: "im.galla.sub.always",
      companion_soul: "im.galla.sub.soul",
    },
  };

  /* 등록용 상품 ID 폴백 — 서버 카탈로그를 못 받아도 스토어 등록 자체는 해둔다.
     ⚠️ 지급량(gc)은 여기 없다. 그건 끝까지 서버(`gc_products`)가 진실이고,
     카탈로그를 못 받으면 수량을 모르므로 충전 시트에 아무것도 그리지 않는다.
     ID 만 미리 등록해 두는 이유: register 는 initialize 前에만 유효한데,
     그 시점엔 로그인·네트워크가 아직 아닐 수 있기 때문이다. */
  const GC_FALLBACK = {
    ios: ["im.galla.gc.c1", "im.galla.gc.c5", "im.galla.gc.c10"],
    android: ["im.galla.gc.c1", "im.galla.gc.c5", "im.galla.gc.c10"],
  };

  /* 💝 후원 상품 — 스토어 직접결제. 소모성이지만 GC 와 달리 '무엇을 줄지'가 아니라
     '누구에게 갈지'가 서버 pending 에 적혀 있다(tip_begin).
     ⚠️ 여기도 register 는 initialize 前에 끝나야 한다 — 소모성 GC 에서 겪은 그 함정. */
  const TIP_IDS = [
    "im.galla.tip.1k", "im.galla.tip.3k", "im.galla.tip.5k",
    "im.galla.tip.10k", "im.galla.tip.30k", "im.galla.tip.50k",
  ];

  const sb = () => window.supabaseClient;
  function platform() {
    try {
      const C = window.Capacitor;
      if (!(C && C.isNativePlatform && C.isNativePlatform())) return null;
      return (C.getPlatform && C.getPlatform()) === "android" ? "android" : "ios";
    } catch (_) { return null; }
  }
  const store = () => window.CdvPurchase && window.CdvPurchase.store;

  let _ready = false, _initing = null;
  const _offers = new Map();     // tier → { id, price, raw }   (구독)
  let _gcCat = [];               // [{ pkg, gc, id }]            (서버가 준 GC 카탈로그)
  const _registered = new Set(); // 이미 store.register 한 상품 id

  window.GALLA_iapReady = () => _ready;
  window.GALLA_subOffers = () =>
    [...(_offers.entries())].map(([tier, o]) => ({ tier, id: o.id, price: o.price, raw: o.raw }));

  /* GC 카탈로그는 서버가 준다 — 수량(gc)과 상품 id 를 손으로 옮겨 적으면 반드시 어긋난다.
     ⚠️ 실패하면 빈 배열을 돌려준다. 그때는 충전 버튼을 아예 안 보여주는 게 맞다:
        수량을 모르는 채 '얼마 준다'고 쓰면 그게 곧 표시 오류이자 환불 사유다. */
  async function loadGcCatalog(plat) {
    try {
      const c = sb(); if (!c) return [];
      const { data } = await Promise.resolve(c.rpc("gc_charge_packages", { p_channel: plat }));
      if (!data || data.source !== "catalog") return [];   // 'computed' 는 웹 계산가다 — 앱에서 쓰면 안 된다
      return (data.packages || [])
        .filter((p) => p && p.product_id && p.gc > 0)
        .map((p) => ({ pkg: p.key, gc: p.gc, id: p.product_id }));
    } catch (_) { return []; }
  }

  /* 소모성(GC) 상품 등록 — 구독과 달리 카탈로그를 받아야 알 수 있으므로 init 과 분리했다.
     충전 시트를 열 때 부르면 되고, 여러 번 불러도 이미 등록한 건 건너뛴다. */
  window.GALLA_ensureGcProducts = async function () {
    const plat = platform(); if (!plat) return [];
    if (!(await init())) return [];
    const st = store(), P = window.CdvPurchase;
    if (!st || !P) return [];
    /* 상품 등록은 init() 에서 이미 끝났다(initialize 前이어야 하므로).
       여기서는 수량을 아직 모를 때 카탈로그만 다시 받아 채운다 —
       앱 시작 직후엔 supabaseClient 가 아직 없어 카탈로그가 비어 있을 수 있다. */
    if (!_gcCat.length) {
      _gcCat = await loadGcCatalog(plat);
      if (_gcCat.length) { try { await st.update(); } catch (_) {} }
    }
    return window.GALLA_gcOffers();
  };

  /* 스토어에 실제로 붙은 것만 돌려준다 — 가격은 스토어 표시가 그대로(원화 하드코딩 금지). */
  window.GALLA_gcOffers = function () {
    const st = store(); if (!st) return [];
    const out = [];
    for (const x of _gcCat) {
      try {
        const p = st.get(x.id);
        const offer = p && p.getOffer && p.getOffer();
        const price = offer && offer.pricingPhases && offer.pricingPhases[0] && offer.pricingPhases[0].price;
        if (p && price) out.push({ pkg: x.pkg, gc: x.gc, id: x.id, price });
      } catch (_) { /* 이 상품만 건너뛴다 */ }
    }
    return out;
  };

  /* 스토어 붙이기 — 앱에서만, 한 번만. */
  function init() {
    if (_initing) return _initing;
    const plat = platform(), st = store();
    if (!plat || !st) { _initing = Promise.resolve(false); return _initing; }

    _initing = (async () => {
      try {
        const P = window.CdvPurchase;
        const platformId = plat === "android" ? P.Platform.GOOGLE_PLAY : P.Platform.APPLE_APPSTORE;

        /* 🔑 승인 단계 — 스토어가 "이 사람이 샀다"고 알려주는 지점.
           여기서 서버 검증을 태우고, 서버가 ok 를 준 뒤에만 finish 한다.
           순서를 바꾸면(먼저 finish) 검증이 실패했을 때 '돈만 내고 아무것도 못 받은'
           거래가 스토어에서 사라져 되살릴 수도 없다. */
        st.when().approved(async (tx) => {
          try {
            const ok = await verify(tx, plat);
            if (ok) tx.finish();
          } catch (e) { console.warn("[iap] verify", e); }
        });
        st.when().receiptUpdated(() => refreshPrices());

        st.error((e) => console.warn("[iap] store", e && e.code, e && e.message));

        /* ⚠️ register 는 initialize 前에 전부 끝나야 한다.
           2026-09-10: 소모성(GC)을 initialize 뒤에 register 했더니 스토어가 상품을 안 물어와
           충전 시트가 계속 "지금은 충전을 열 수 없어요" 로 떨어졌다(시뮬 로컬 StoreKit 실측).
           구독만 뜨고 충전만 안 뜨던 증상의 원인이 이것이다. */
        _gcCat = await loadGcCatalog(plat);
        const gcIds = _gcCat.length ? _gcCat.map((x) => x.id) : GC_FALLBACK[plat];
        st.register([
          ...Object.values(SUBS[plat]).map((id) => ({
            id, type: P.ProductType.PAID_SUBSCRIPTION, platform: platformId,
          })),
          ...gcIds.map((id) => ({
            id, type: P.ProductType.CONSUMABLE, platform: platformId,
          })),
          ...TIP_IDS.map((id) => ({
            id, type: P.ProductType.CONSUMABLE, platform: platformId,
          })),
        ]);
        gcIds.forEach((id) => _registered.add(id));
        TIP_IDS.forEach((id) => _registered.add(id));

        await st.initialize([platformId]);
        await st.update();
        refreshPrices();
        _ready = true;
        return true;
      } catch (e) {
        console.warn("[iap] init 실패", e);
        return false;
      }
    })();
    return _initing;
  }

  /* 스토어가 준 표시가를 모은다. 상품이 아직 스토어에 없으면 그냥 비어 있다 —
     그때는 결제 버튼을 안 보여주는 게 맞다(눌러도 안 되는 버튼은 이탈이다). */
  function refreshPrices() {
    const plat = platform(), st = store();
    if (!plat || !st) return;
    _offers.clear();
    for (const [tier, id] of Object.entries(SUBS[plat])) {
      try {
        const p = st.get(id);
        const offer = p && p.getOffer && p.getOffer();
        const price = offer && offer.pricingPhases && offer.pricingPhases[0] && offer.pricingPhases[0].price;
        if (p && price) _offers.set(tier, { id, price, raw: p });
      } catch (_) { /* 이 상품만 건너뛴다 */ }
    }
    try { document.dispatchEvent(new Event("galla:iap-offers")); } catch (_) {}
  }

  /* 영수증 → 서버. 서버만이 등급을 켠다. */
  async function verify(tx, plat) {
    const payload = plat === "android"
      ? { productId: (tx.products && tx.products[0] && tx.products[0].id) || "", purchaseToken: tx.purchaseId || tx.transactionId }
      : { receipt: tx.nativePurchase && (tx.nativePurchase.appStoreReceipt || tx.nativePurchase.transactionReceipt) };
    if (!window.GALLA_verifyPurchase) return false;
    const out = await window.GALLA_verifyPurchase(plat === "android" ? "google" : "apple", payload);
    if (out && out.ok) {
      try { document.dispatchEvent(new Event("galla:entitlement-changed")); } catch (_) {}
      return true;
    }
    console.warn("[iap] 서버 검증 실패", out && out.reason);
    return false;
  }

  /* 구매 — 화면은 이걸 부르고 결과만 기다린다. */
  window.GALLA_buySub = async function (tier) {
    const plat = platform();
    if (!plat) return { ok: false, reason: "not_native" };
    if (!(await init())) return { ok: false, reason: "store_unavailable" };
    const id = SUBS[plat][tier];
    if (!id) return { ok: false, reason: "unknown_tier" };
    try {
      const p = store().get(id);
      const offer = p && p.getOffer && p.getOffer();
      if (!offer) return { ok: false, reason: "no_offer" };
      const err = await offer.order();
      // 유저가 창을 닫은 것도 여기로 온다 — 실패로 시끄럽게 알리지 않는다
      if (err) return { ok: false, reason: err.code === 6777006 ? "canceled" : (err.message || "order_failed") };
      return { ok: true };                       // 실제 지급은 approved → verify 에서
    } catch (e) { return { ok: false, reason: String(e).slice(0, 80) }; }
  };

  /* 💝 후원 구매 — 받는 사람은 이미 서버 pending 에 적혀 있다(donate.js 가 tip_begin 을 먼저 부른다).
     여기서는 '결제만' 한다. 지급 확정은 approved → verify-iap → tip_confirm 이다. */
  window.GALLA_tipOffers = function () {
    const st = store(); if (!st) return [];
    const out = [];
    for (const id of TIP_IDS) {
      try {
        const p = st.get(id);
        const offer = p && p.getOffer && p.getOffer();
        const price = offer && offer.pricingPhases && offer.pricingPhases[0] && offer.pricingPhases[0].price;
        if (p && price) out.push({ id, price });
      } catch (_) { /* 이 상품만 건너뛴다 */ }
    }
    return out;
  };

  window.GALLA_buyTip = async function (productId) {
    const plat = platform();
    if (!plat) return { ok: false, reason: "not_native" };
    if (!(await init())) return { ok: false, reason: "store_unavailable" };
    if (TIP_IDS.indexOf(productId) < 0) return { ok: false, reason: "unknown_product" };
    try {
      const p = store().get(productId);
      const offer = p && p.getOffer && p.getOffer();
      if (!offer) return { ok: false, reason: "no_offer" };
      const err = await offer.order();
      if (err) return { ok: false, reason: err.code === 6777006 ? "canceled" : (err.message || "order_failed") };
      return { ok: true };
    } catch (e) { return { ok: false, reason: String(e).slice(0, 80) }; }
  };

  /* GC 충전 구매 — 지급량은 서버 gc_products 가 정한다. 여기서 gc 를 더하지 않는다. */
  window.GALLA_buyGC = async function (pkg) {
    const plat = platform();
    if (!plat) return { ok: false, reason: "not_native" };
    const offers = await window.GALLA_ensureGcProducts();
    const hit = offers.find((o) => o.pkg === pkg);
    if (!hit) return { ok: false, reason: "no_offer" };
    try {
      const p = store().get(hit.id);
      const offer = p && p.getOffer && p.getOffer();
      if (!offer) return { ok: false, reason: "no_offer" };
      const err = await offer.order();
      if (err) return { ok: false, reason: err.code === 6777006 ? "canceled" : (err.message || "order_failed") };
      return { ok: true };                       // 실제 지급은 approved → verify 에서
    } catch (e) { return { ok: false, reason: String(e).slice(0, 80) }; }
  };

  /* 복구 — 기기를 바꾸거나 지웠다 깔았을 때. 스토어 심사에서 반드시 확인하는 항목이다. */
  window.GALLA_restorePurchases = async function () {
    if (!platform()) return { ok: false, reason: "not_native" };
    if (!(await init())) return { ok: false, reason: "store_unavailable" };
    try {
      await store().restorePurchases();          // 영수증이 다시 흘러와 approved 를 태운다
      return { ok: true };
    } catch (e) { return { ok: false, reason: String(e).slice(0, 80) }; }
  };

  // 앱이면 조용히 미리 붙여 둔다 — 요금제 화면을 열 때 가격이 이미 있어야 한다
  if (platform()) {
    if (document.readyState === "complete") setTimeout(init, 1200);
    else window.addEventListener("load", () => setTimeout(init, 1200));
  }
})();
