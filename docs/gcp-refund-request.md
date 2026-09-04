# Google Cloud 청구 조정(환불) 요청

**제출 경로**: Google Cloud Console → Billing → 좌측 하단 `?` 또는
https://console.cloud.google.com/billing/018D2D-3896A6-D80AF3/support
(결제 관련 문의는 무료 지원 대상입니다)

---

## 한국어

**제목: 설정 오류로 발생한 Places API 과금에 대한 청구 조정 요청 (₩200,000)**

안녕하세요.

결제 계정 **018D2D-3896A6-D80AF3** 사용자입니다.
2026년 9월 4일 22:53에 기준액 청구로 **₩200,000**(Visa 4091,
거래 ID LGU687191570684499961)이 결제되었습니다. 이 금액에 대해 청구 조정을 요청드립니다.

### 발생 경위

저희는 출시 준비 중인 국내 서비스로, Places API를 장소 사진·정보 보강에 사용하고 있습니다.

일일 호출 상한을 **1,000건에서 20,000건으로 상향**하는 설정 변경을 했는데, 이때 단가를
**Text Search Essentials(무료 등급)** 기준으로 잘못 계산했습니다. 실제 호출은
**Text Search Enterprise + Atmosphere(건당 약 ₩46)** 등급으로 과금되었고,
저희 예상보다 약 7배 높은 단가가 적용되었습니다.

또한 보유 중이던 무료 크레딧(₩435,523 흡수)이 사용 도중 소진되면서
이후 발생분이 정가로 청구되었습니다. 저희는 크레딧 잔액이 전체를 충당할 것으로
오인하고 있었습니다.

### 발생 규모 (2026년 9월 1일~4일, 4일간)

| SKU | 사용량 | 정가 |
|---|---|---|
| Places API Text Search Enterprise + Atmosphere | 6,096건 | ₩281,968 |
| Places API Place Details Pro | 9,475건 | ₩105,233 |
| Places API Place Details Photos | 10,695건 | ₩93,876 |
| **합계** | | **₩481,077** |

크레딧 ₩435,523 차감 후 ₩188,080 + VAT ₩18,808 이 발생했고,
이 중 ₩200,000이 기준액 청구로 결제되었습니다.

### 조치 사항

문제를 인지한 직후 다음을 즉시 완료했습니다.

1. Places API를 호출하는 서버리스 함수 3개를 **애플리케이션 코드 수준에서 차단**
   (요청 시 503 반환, 재기동만으로는 복구되지 않도록 조치)
2. 관련 스케줄러(cron) 작업 3건 중지
3. 내부 호출 상한을 **0**으로 설정

2026년 9월 5일부터 해당 SKU의 사용량은 0입니다.

### 요청 사항

본 건은 악의적 사용이나 서비스 남용이 아니라, 요금 등급을 오인한 설정 오류로 인해
4일간 집중 발생한 건입니다. 인지 즉시 전면 차단하였고 재발 방지를 위해
예산 알림 및 API 할당량 제한을 설정할 예정입니다.

**₩200,000 결제 건에 대한 청구 조정(환불)을 요청드립니다.**

가능하지 않다면 부분 조정이라도 검토해 주시면 감사하겠습니다.

감사합니다.

---

## English

**Subject: Request for billing adjustment — Places API charges from a configuration error (KRW 200,000)**

Hello,

I am writing regarding billing account **018D2D-3896A6-D80AF3**.

On September 4, 2026 at 22:53 KST, a threshold charge of **KRW 200,000** was applied to
Visa ending 4091 (transaction ID LGU687191570684499961). I would like to request a
billing adjustment for this charge.

### What happened

We are a pre-launch consumer service in Korea using the Places API to enrich place
photos and details.

We raised an internal call limit from 1,000 to 20,000 per day. In doing so we
miscalculated the unit price based on the **Text Search Essentials (free tier)** rate.
In practice the calls billed at the **Text Search Enterprise + Atmosphere** tier
(approximately KRW 46 per call) — roughly 7× our assumption.

In addition, our promotional credit (which absorbed KRW 435,523) was exhausted partway
through, so subsequent usage billed at list price. We had incorrectly believed the
remaining credit would cover the full amount.

### Usage (September 1–4, 2026 — four days)

| SKU | Usage | List price |
|---|---|---|
| Places API Text Search Enterprise + Atmosphere | 6,096 | KRW 281,968 |
| Places API Place Details Pro | 9,475 | KRW 105,233 |
| Places API Place Details Photos | 10,695 | KRW 93,876 |
| **Total** | | **KRW 481,077** |

After KRW 435,523 in credits, KRW 188,080 plus VAT KRW 18,808 was incurred, of which
KRW 200,000 was charged at the billing threshold.

### Remediation already completed

1. Blocked all three serverless functions that call the Places API **at the application
   code level** (they now return 503; a restart alone will not re-enable them)
2. Disabled the three related cron jobs
3. Set the internal call cap to **0**

Usage for these SKUs is zero as of September 5, 2026.

### Request

This was not abuse or malicious use — it was a configuration error stemming from a
misread pricing tier, concentrated in four days. We shut it down immediately upon
discovery and will configure budget alerts and API quota limits to prevent recurrence.

**We respectfully request a billing adjustment (refund) for the KRW 200,000 charge.**
If a full adjustment is not possible, we would be grateful for any partial consideration.

Thank you for your time.
