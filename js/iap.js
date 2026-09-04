/* 💳 iap.js — 앱 안에서 구독을 산다(애플 StoreKit · 구글 Play Billing).
 *
 * 왜 프론트에 이만큼이 필요한가:
 *   결제는 스토어가 하고, '무엇을 줄지'는 서버가 정한다. 이 파일은 그 사이를 잇기만 한다.
 *   영수증을 받아 verify-iap 로 넘기고, 서버가 등급을 켠 뒤에야 화면을 갱신한다.
 *   ⚠️ 여기서 등급을 켜면 안 된다 — 클라가 켜는 등급은 공짜 구독과 같은 말이다.
 *
 * ⚠️ 가격은 우리가 적지 않는다. 스토어가 준 현지 표시가(product.pricing.price)를 그대로 쓴다.
 *    ₩ 를 우리가 하드코딩하면 통화·세율·지역이 어긋나고, 심사에서도 문제가 된다.
 *
 * 노출:
 *   GALLA_iapReady()            결제를 걸 수 있는 상태인가
 *   GALLA_subOffers()           [{tier, id, price, raw}] — 스토어가 준 상품·표시가
 *   GALLA_buySub(tier)          구매 → 검증 → 등급 반영까지
 *   GALLA_restorePurchases()    기기 바꿨을 때 되살리기(스토어 심사 필수 항목)
 */
(function () {
  const PRODUCTS = {
    ios: {
      /* ⚠️ 상품 ID 는 만들면 삭제·재사용 불가. 2026-09-04 에 im.galla.app.* → im.galla.*
         (옛 iOS 번들을 가리키던 이름을 정리). 아직 미등록이라 지금이 유일한 기회였다. */
      companion_sometimes: "im.galla.sub.sometimes",
      companion_daily: "im.galla.sub.daily",
      companion_always: "im.galla.sub.always",
    },
    android: {
      companion_sometimes: "sub_sometimes",
      companion_daily: "sub_daily",
      companion_always: "sub_always",
    },
  };

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
  const _offers = new Map();     // tier → { id, price, raw }

  window.GALLA_iapReady = () => _ready;
  window.GALLA_subOffers = () =>
    [...(_offers.entries())].map(([tier, o]) => ({ tier, id: o.id, price: o.price, raw: o.raw }));

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

        st.register(Object.values(PRODUCTS[plat]).map((id) => ({
          id, type: P.ProductType.PAID_SUBSCRIPTION, platform: platformId,
        })));

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
    for (const [tier, id] of Object.entries(PRODUCTS[plat])) {
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
    const id = PRODUCTS[plat][tier];
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
