# 결제 3채널 설계 — 웹 PG · iOS IAP · 안드로이드

작성 2026-08-19. 앱스토어 심사 전 결정 사항 정리.

## 결론 한 줄
**채널마다 결제 수단이 다르고, 지갑(GC)은 하나다.** 앱은 스토어 결제만, 웹은 PG만.
앱에서 웹 가격·웹 결제를 노출하는 순간 앱이 내려간다.

## 지금 상태 (실측)

| 항목 | 상태 |
|---|---|
| 재화 | GP(무료 전용, **판매 금지**) / GC(유료) |
| 채널별 수수료 | `app_settings.charge_fees` = ios 0.3 / android 0.3 / web 0 |
| 채널별 가격 | `_charge_price(기준가, 채널)` — 수수료만큼 마크업 + 가격대 스냅 |
| 웹 패키지 | `gc_packages` 6종 (1,000 / 5,000 / 1만 / 3만 / 5만 / 10만원) |
| 스토어 카탈로그 | `gc_products` **0행** — App Store Connect 등록 후 채워야 함 |
| 앱 내 충전 | **차단**(원화 표시 자체를 안 함 — anti-steering) |
| 영수증 검증 | `verify-iap` 엣지 — Apple 동작 / **Google 미구현** |
| 지급 | `grant_gc_topup`(스토어) · `gc_charge_confirm`(웹 PG). 둘 다 service_role 전용 |

## 채널별 흐름

**웹** — `gc_charge_begin('web')` → PG 결제창 → **PG 웹훅** → `gc_charge_confirm`(service_role)
· 클라이언트가 "결제 성공"이라고 말해도 믿지 않는다. 지급은 웹훅에서만.

**iOS** — StoreKit 구매 → 영수증 → `verify-iap` → Apple 검증 → `grant_gc_topup`
· 상품ID→GC 는 `gc_products` 가 결정. 클라이언트 금액은 절대 안 믿는다.

**안드로이드** — Play Billing → purchaseToken → Play Developer API 검증 → `grant_gc_topup`
· 아직 미구현. 서비스 계정 키만 넣으면 같은 지급 경로를 쓴다.

## 이번에 막은 구멍 2개

**① 같은 영수증 이중지급** — `gc_charge_confirm` 은 charge_id 단위로만 멱등이라,
같은 스토어 거래를 서로 다른 charge 행에 태우면 우회됐다.
→ `gc_charges (pg_provider, pg_tx_id)` 유니크 인덱스. 실측: 같은 txid 2회 → 두 번째는 `dup`, 잔액 불변.

**② IAP 배선이 GP를 향하고 있었다** — `verify-iap → grant_gp_topup → paid_balance`.
IAP 를 켜는 순간 폐지한 GP 가 팔릴 뻔했다.
→ `verify-iap` 를 `gc_products`/`grant_gc_topup` 으로 재배선. `grant_gp_topup` 은 봉인.

## 남은 작업 (순서대로)

1. **App Store Connect 상품 등록** — 소모성 6종. **가격표·상품ID·등록 SQL 은 `docs/appstore-products.md`**.
   ⚠️ Apple Small Business Program(15%) 가입이 **선행**돼야 한다 — 30% 상태로 그 가격을 걸면 적자다.
2. **앱에 StoreKit 결제 UI** — 지금은 "다음 업데이트에서 열려요" 상태. 붙이면서 anti-steering 가드 유지.
3. **웹 PG 선정·연동** — 결제 시작은 `gc_charge_begin('web')`, 지급은 **웹훅에서만**.
4. **Google Play** — 서비스 계정 키 → `verify-iap` 의 google 분기 구현.
5. **환불 자동화** — App Store Server Notifications V2 / Play RTDN 수신 → `gc_clawback`.
   (`gc_clawbacks`·`gc_refunds` 테이블은 이미 있다)
6. **App Review 대비** — 신규 계정은 GC 0 이라 심사자가 AI 창작에서 막힌다.
   심사용 계정에 GC 지급 + Review Notes 에 계정 기재.

## 절대 하지 말 것

1. **앱에서 원화 가격·패키지를 렌더하지 마라.** 결제를 막는 것으로 부족하다 — 표시 자체가 거절 사유다.
   (`js/charge.js` 의 `isApp` 가드)
2. **서버 플래그로 앱에 웹결제를 켜지 마라.** 심사 통과 후 몰래 켜는 건 bait-and-switch,
   앱 삭제 사유다. 패키지를 서버 RPC 로 받는 구조라 기술적으로 가능한 게 함정이다.
3. **클라이언트가 말하는 금액·성공 여부를 믿지 마라.** 지급은 영수증 검증 또는 PG 웹훅 뒤에만.
4. **GP 를 팔지 마라.** 예측 판돈이라 규제 대상이 된다([[galla-gp-wallets]] 절대선 1·2번).

## 참고 — 한국 제3자 결제
전기통신사업법(인앱결제 강제 금지법)으로 국내 스토어는 제3자 결제가 허용되나
애플 수수료가 26% 라 30% 대비 절감 폭이 작다. 별도 신청·조건 필요. 우선순위 낮음.
