# YouTube API Compliance — 2차 회신 초안

> ⚠️ **보내기 전에 사장님이 채워야 할 것 2개** — 아래 `[[ ]]` 부분입니다.
> 날짜는 사업 약속이라 제가 정할 수 없습니다. 한 번 적어 보내면 그게 기준이 되니,
> **여유를 두고** 잡으시는 걸 권합니다(못 지키면 다시 해명해야 합니다).

---

## 그쪽이 물은 것

1. **어느 플랫폼에서 API를 쓰는지 확인해 달라**
2. **Android·iOS 앱 출시 타임라인을 구체적 날짜로 달라** (영업일 7일 내)

## 우리 사실관계 (확인 완료)

| 항목 | 실제 |
|---|---|
| API 호출 위치 | **서버에서만** — Supabase Edge Function `collect-youtube-hot` |
| 클라이언트 직접 호출 | **없음** (웹·앱 어디서도 API 키를 다루지 않음) |
| 호출 내용 | `videos.list` (chart=mostPopular, regionCode=KR) |
| 주기 | 30분마다 |
| 보관 | 매 수집 시 **이전 데이터 전량 삭제 후 교체** (누적 저장 없음) |
| 현재 라이브 플랫폼 | **웹만** — https://galla.im/search?tab=hot (로그인 불필요) |
| iOS / Android | Capacitor 프로젝트는 있으나 **미출시** (스토어 등록 전) |

핵심: 앱이 나와도 **API 호출은 서버 한 곳에서만** 일어나고, 앱은 그 결과를 우리 서버에서
받아 보는 구조입니다. 플랫폼이 늘어도 API 사용 방식·쿼터는 달라지지 않습니다.

---

## 회신 전문 (영문)

```
Hello,

Thank you for the follow-up. Please find our responses below.

1) Platforms on which the YouTube API Services are used

The YouTube Data API v3 is called exclusively from our server side — a single
backend job (Supabase Edge Function) that runs every 30 minutes and requests
videos.list (chart=mostPopular, regionCode=KR).

No API request is ever made from a client. Neither our web front-end nor our
mobile applications hold or use an API key; they only read the results from our
own backend. Adding a platform therefore does not change how the API is used or
how much quota we consume.

Currently the service is live on the web only:
  https://galla.im/search?tab=hot   (publicly accessible, no login required)

The feature displays the official "Trending" list for Korea. Each item links to
the video and is played through the standard YouTube IFrame Player. We do not
download, re-host, or modify any video content. Collected metadata is fully
replaced on every 30-minute cycle — we do not accumulate or retain historical
API data.

2) Launch timeline for the Android and iOS applications

  - iOS (App Store):        [[YYYY-MM-DD 목표 출시일]]
  - Android (Google Play):  [[YYYY-MM-DD 목표 출시일]]

Both applications are built with Capacitor and wrap the same web experience,
so the API usage described in (1) applies unchanged: all YouTube Data API calls
remain server-side, and the apps consume only our own backend responses.

We will notify you if these dates change materially.

Please let us know if you need any further information — we are happy to provide
screenshots, a demo account, or a walkthrough of the implementation.

Best regards,
GALLA Team
gallakorea@gmail.com
```

---

## 날짜 고를 때 고려할 것

- **여유 있게.** 심사(애플 1~7일)·리젝 재제출까지 감안해 원하는 시점 + 3~4주를 권합니다.
- **iOS가 먼저**인 게 자연스럽습니다 — 현재 iOS 쪽 작업이 더 진행돼 있습니다
  (패스키 Associated Domains, 오디오 세션 등).
- **"미정"은 답이 안 됩니다.** 그쪽이 구체적 날짜를 요구했으므로 비워 보내면 조사가 길어집니다.
  지키기 어려우면 늦게 잡고 앞당기는 편이 안전합니다.

## 아직 막혀 있는 것

`galla-youtube` GCP 프로젝트에 YouTube Data API v3가 켜져 있는지 확인이 안 됐습니다
(Chrome이 blackid@gmail.com으로 로그인돼 있어 gallakorea 계정 콘솔을 못 봄).
회신 전에 한 번 확인해 주세요 — 그쪽이 프로젝트 번호로 대조합니다.
