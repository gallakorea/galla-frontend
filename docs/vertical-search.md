# 갈라 콘텐츠 버티컬 검색엔진 — 설계안 (v0 초안, 승인 대기)

작성일 2026-09-26 · 상태: **사장님 승인 전 (코드 미수정)**

---

## 0. 결론 세 줄 (근거 먼저)

1. **"새로 만들 게 거의 없다."** 하이브리드 의미검색 엔진(`galla_search` RPC: 트라이그램 + bge-m3 벡터 가중합)이 **이미 완성돼 배포**돼 있다. 이슈·광장·뉴스·맛집·여행 5개 콘텐츠에 임베딩 컬럼·인덱스·개인화까지 들어가 있다. — `migrations/20260923_galla_search_hybrid.sql`, `_phase2.sql`, `_phase3.sql`
2. **문제는 정작 프론트 통합검색이 그 엔진을 안 쓴다.** `js/search.js`의 검색 7종은 전부 테이블별 `ilike` 단순 매칭이고, 완성된 `galla_search`는 **갈비스(`galla-friend`)만** 호출한다. → 최우선 과제는 "새 엔진 구축"이 아니라 **프론트 통합검색을 기존 엔진에 연결(승격)**하는 것. 비용 0, 효과 최대.
3. **네이버 의존은 이미 대부분 자체화됐다.** 남은 실질 의존은 `local.json`(장소검색) 계열이고, 이건 공공데이터(백년가게·관광공사·착한가격)로 상당 부분 대체됐다. 잔여분은 카카오 로컬/자체 인덱스로 마저 끊는다.

즉 이 프로젝트의 실체는 **"수직 검색엔진을 새로 짓는다"가 아니라 "이미 반쯤 지어진 엔진을 하나로 통합하고, 네이버가 채우던 빈칸만 자체화한다"** 이다.

---

## 1. 현황 맵핑 (파일:라인 검증 완료)

### 1.1 3층 구조 실측

| 층 | 자산 | 상태 |
|---|---|---|
| **수집** | `collect-*` 9종 + `harvest-*` 3종 + `ingest-*` 9종 = 21개 크론 엣지함수 | 가동 중 |
| **인덱스** | pg_trgm(gin_trgm_ops) 전 콘텐츠 + bge-m3 벡터(`search_vec vector(1536)`) 5콘텐츠 | 트그램 전량 / 벡터 부분 백필 |
| **랭킹** | `unified_realtime_trends`(materialized, 10분) + `feed_signals`→`home_rank`(개인화) + `youtube_hot.velocity`(30분 델타) | 가동 중 |
| **검색 진입점** | (프론트) `js/search.js` ilike / (갈비스) `galla-friend` → `galla_search` 하이브리드 | **이원화됨 ← 통합 대상** |

### 1.2 프론트 통합검색 = 전부 ilike (엔진 미사용)

`js/search.js` `doSearch`(`:470`)가 7개를 `Promise.all` 병렬:

| 대상 | 함수:라인 | 현재 방식 | 인덱스 |
|---|---|---|---|
| 유저 | `searchUsers` :419 | `users.nickname ilike` | trgm 없음 |
| 해시태그 | `searchHashtag` :430 | `tags` 배열 contains (GIN) | tags gin ✅ |
| 이슈 | `searchIssues` :347 | `issues.title/category ilike` | title trgm ✅ (벡터 미사용) |
| 예측 | `searchMarkets` :356 | `markets.question ilike` | **인덱스 전무** |
| 뉴스 | `searchNews` :384 | `news_articles_raw.title ilike` | title trgm ✅ (원본, 발행뉴스 아님) |
| 인기영상 | `searchYoutube` :397 | `youtube_hot.title ilike` | trgm 없음 |
| 광장 | `searchPlaza` :408 | `plaza_posts.title/body ilike` | title trgm ✅ (벡터 미사용) |

- 프로젝트 전체에서 `.rpc()` 호출은 뉴스 홈/카테고리 2곳뿐(`galla_news_home` :1119, `galla_news_category` :1186). **하이브리드 검색 RPC는 프론트에서 0회 호출.**
- 뜨는 키워드 `computeHotKeywords`(:245)는 `unified_realtime_trends` 뷰 사용 — 이건 잘 연결돼 있음.

### 1.3 완성돼 있는 의미검색 엔진 (갈비스 전용)

- **임베딩**: Cloudflare Workers AI `@cf/baai/bge-m3` — `galla-friend/index.ts:111 embedCF`, `:156 embedMany`. 1024차원 → L2 정규화 후 0패딩으로 `vector(1536)` 정합. env `CF_AI_TOKEN`·`CF_ACCOUNT_ID`. **무료 한도 내.**
- **RPC 시그니처** (Phase3 최종, 6인자):
  ```
  galla_search(p_query_text text, p_query_vec vector(1536), p_sections text[],
               p_limit int, p_interest_vec vector(1536), p_dislike_vec vector(1536))
    returns table(section text, id text, title text, sub text, score real)
  ```
  점수 = `0.6*(1-코사인) + 0.4*similarity(title,q)` (맛집·여행은 0.55/0.45), 개인화 관심 +0.15 / 비선호 -0.12.
- **맛집 전용**: `food_search(text,text,vector,vector,vector,int)` — 메뉴/동네 분리.
- **콘텐츠 임베딩 백필**: `galla-friend` op `"embed_content"`(:5038), `search_vec IS NULL` 행만 50개씩 배치. **외부 크론이 `x-cron-key`로 호출** (저장소 내 스케줄 정의는 없음 — 확인 필요 항목).
- **부분 백필 정책**(bge-m3 무료한도 배려): 이슈·광장 전량 / 뉴스 최근45일·published / 맛집 평점보유 / 여행 사진보유. 미백필 행은 trgm으로 자연 degrade.

### 1.4 인덱스 커버리지 (실측)

| 콘텐츠 | 트라이그램 | 벡터(1536) | galla_search 코너 | 통합검색 승격 시 |
|---|---|---|---|---|
| issues | ✅ title | ✅ | 'issue' | 즉시 가능 |
| plaza_posts | ✅ title | ✅ | 'plaza' | 즉시 가능 |
| galla_news | ✅ title | ✅ | 'news' | 즉시 가능 |
| food_places | ✅ name+cat, addr | ✅ | 'food' | 즉시 가능 |
| travel_places | ✅ name+city | ✅ | 'travel' | 즉시 가능 |
| **markets(예측)** | ❌ | ❌ | ❌ | **인덱스+코너 추가 필요** |
| **users(유저)** | ❌ | — | ❌ | trgm 추가 권장 |
| **youtube_hot(영상)** | ❌ | — | ❌ | trgm 추가 권장 |
| news_articles_raw | ✅ title(2개) | ❌ | ❌(원본) | 발행뉴스로 대체 |

- **벡터 인덱스(ivfflat) 5개는 현재 전부 DROP됨** → exact KNN 스캔(`20260923_galla_search_exact.sql`). 사유: 수천~수만 규모에선 ivfflat(lists=100,probes=1)이 오히려 엉뚱한 결과. 규모 커지면 hnsw 재도입.
- tsvector/FTS는 미사용(한국어 사전 없이 trgm이 더 강함 — 의도적 선택).

### 1.5 네이버 API 의존 전수 (openapi.naver.com 직접 호출 9개 함수)

| 종류 | 함수 | 자체화 상태 |
|---|---|---|
| **장소 local.json** | harvest-by-blog, harvest-creator-places, harvest-travel-places, ingest-assembly, ingest-baeknyeon, ingest-good-price, ingest-gov-expense (7개) | 공공데이터로 상당부분 대체됨. 지오코딩·신규발굴 잔여 |
| **뉴스 news.json** | collect-raw-news | `collect-rss-news`(언론사 RSS 다수)로 자립 수집 병행 중 |
| **웹문서 webkr.json** | harvest-by-blog | 자체 뉴스·이슈 인덱스로 대체 가능 |
| **트렌드 datalab** | collect-travel-trends | `unified_realtime_trends` 자체 축 존재 |

- 별도: `collect-external-trends`는 `news.naver.com` 랭킹 HTML 크롤링(검색 API 아님), `collect-food-places`는 NCP Maps 지오코딩(카카오 폴백 이미 보유 `:366`).
- 네이버 호출은 `naver_take`/`naver_refund` RPC로 예산 관리 중 → 호출량은 이미 통제 하에 있음.

---

## 1.6 실시간 데이터 도구 — 이미 갈비스에 전부 붙어 있음 (핵심 발견)

콘텐츠 검색과 **성격이 다른** "지금 값이 얼마냐"(시세·환율·실거래가·항공권·날씨)는 **이미 `galla-friend`(갈비스)에 실제 API 도구로 붙어서 작동 중**이다. 새 수집 불필요, **검색·위젯 진입점에 이어붙이기만** 하면 된다.

| 데이터 | 갈비스 도구 | 실제 소스 | 합법/비용 | 근거(index.ts) |
|---|---|---|---|---|
| 국내주식 | `market_quote` kind:stock → `quoteStock` | 네이버 증권(ac/m.stock.naver.com) | 무료·**비공식(네이버 리스크)** | :915 |
| 코인 | `market_quote` kind:coin → `quoteCoin` | 업비트 공식 API | 무료·합법 | :939 |
| 환율 | `market_quote` kind:fx → `quoteFx` | Frankfurter(ECB 기준환율) | 무료·합법 | :1033 |
| 아파트 실거래가 | `apt_price` → `aptPrice` | 국토교통부 RTMS 공공API | 무료·합법 | :996 |
| 항공권 최저가 | `flight_price` → `flightPrices` | Travelpayouts 제휴(캐시 `flight_deals`) | 무료 | :1091 |
| 국내 날씨+예보 | `weather_now` → `weatherNow/Forecast` | 기상청 + 갈라 유저 제보(`weather_obs`) | 무료·합법 | :1559 |
| 해외 날씨 | (weather-sync 계열) | MET Norway(CC BY 4.0) | 무료·합법 | `travel-weather` |
| 미세먼지 | (air-sync) | 에어코리아 공공API(`air_obs`) | 무료·합법 | `air-sync` |

- 각 도구는 결과에 `_card`(qtype: stock/coin/fx…)를 만들어 **갈비스 답변에 시세 카드로 렌더**까지 한다(`index.ts:7123, 7272`).
- 지금 제약: **갈비스한테 물어야만** 나온다. 검색창/트렌드/위젯에는 노출 안 됨.
- **이어붙이기 = 같은 도구 함수를 검색 진입점(엣지 op)으로 재노출**. "환율"·"삼성전자 주가"·"강남 집값"·"도쿄 항공권" 검색 시 시세 카드를 그대로 띄운다(구글이 "달러 환율" 치면 계산기 뜨는 방식).
- **유일한 리스크 = 국내주식(네이버 증권 비공식)**. 다른 소스와 달리 언제든 차단 가능 → 한국거래소 지연시세 등 공식 소스로 갈아탈 후보만 열어둔다.

---

## 1.7 검색 결과 UI 원칙 — 구글·네이버를 이긴다 (사장님 최우선 지시 26.9.26)

갈라 철학(그 어떤 SNS보다 최고의 UI/UX)의 검색판. **결과 화면 UI는 구글·네이버보다 뛰어나야 한다.**

경쟁사 약점 → 우리 강점:
- 네이버 = 광고·잡동사니 범벅, 정보 밀도 낮음 → 우리는 **무광고·고밀도**
- 구글 = 파란 링크+회색 텍스트, 밋밋 → 우리는 콘텐츠가 원래 시각적(사진·영상·시세·진영바) → **리치 카드**

결과 종류별 리치 카드:
| 종류 | 우리 UI |
|---|---|
| 시세·환율·날씨·항공권 | 최상단 **인터랙티브 위젯 카드**: 등락 색·미니 스파크라인·탭 전환·바로 예약/길찾기 링크 (구글 원박스 이상) |
| 맛집 | 사진+지도핀+영상 미리보기, 결과 안에서 **바로 길찾기** |
| 여행 | 사진+현지 날씨 |
| 이슈 | **진영바(찬반 비율)** 미리보기, 바로 참전 |
| 뉴스 | 썸네일+출처+시간, 스니펫만(원문 재배포 금지) |
| 영상 | 썸네일 + 인라인 재생 |
| 유저/해시태그 | 아바타·팔로우 / 태그 인기순 칩 |

핵심 4원칙:
1. **무광고·고밀도·다크톤** — [galla-design-system] theme.css(순흑 배경·인디고 액센트) 준수
2. **결과 안에서 바로 액션** — 페이지 이동 없이 저장·재생·참전·길찾기·예약
3. **입력 즉시 실시간**(debounce 240ms 유지) + 스켈레톤 시머 로딩으로 속도감
4. **화려한 동적 애니메이션** (사장님 강조 26.9.26) — 구글·네이버가 못 하는 차별점:
   - 시세 카드: 숫자 카운트업, 등락 색 펄스(상승 초록/하락 빨강 글로우), 미니 스파크라인 드로잉
   - 결과 카드: 스태거드 페이드인(순차 등장), 위젯은 위에서 슬라이드+인디고 글로우
   - 트렌드: 실시간 순위 변동 애니 ([galla-vote-bar] 동적 애니 계약 재사용)
   - **제약**: 이모지 파티클 금지 → **SVG/CSS transform 기반**([galla-fx-tone]), **60fps·GPU 합성**(will-change/translate3d), 저사양·prefers-reduced-motion 폴백. 성능 함정 주의([galla-spa-perf]: 전량렌더·고정스냅)

구현 시 **실제 화면 목업(아티팩트)부터 만들어 승인받고** 코드에 반영한다 — UI·애니메이션은 봐야 판단 가능.

---

## 2. 통합 아키텍처 (목표 상태)

```
[수집층]  collect-* / harvest-* / ingest-*  (RSS·공공데이터·유튜브·커뮤니티 크롤링)
   │        └ 네이버 빈칸 → 카카오 로컬 / 공공데이터 / 자체 인덱스로 치환
   ▼
[정규화]  news_articles_raw→galla_news, food/travel_places, issues, plaza_posts, markets
   │        + locale 컬럼(default 'ko') 유지 → 국제화 대비
   ▼
[인덱스층]  pg_trgm(전 콘텐츠, 즉시) + bge-m3 search_vec(가치순 백필, 무료한도)
   │        embed_content 크론이 search_vec NULL 채움
   ▼
[랭커]  galla_search(하이브리드 0.6벡터+0.4trgm+개인화)  ←── 단일 검색 랭커로 통일
   │     unified_realtime_trends(트렌드) / home_rank(홈피드)는 별도 표면 유지
   ▼
[검색 API]  galla_search RPC (권한: authenticated+service_role; anon 정책 결정 필요)
   │
   ├── [프론트] js/search.js  ← ★현재 ilike, galla_search로 승격 (Phase A)
   └── [갈비스] galla-friend  ← 이미 사용 중
```

핵심: **랭커(galla_search)를 검색의 단일 진입점으로 통일**하고, 프론트/갈비스가 같은 엔진을 공유한다. 트렌드·홈피드는 검색과 목적이 다르므로 별도 랭커 유지.

---

## 3. 도메인별 커버리지 매트릭스 (무엇을 인덱싱/무엇은 안 하나)

| 도메인 | 인덱싱 대상 | 방식 | 재배포 정책 |
|---|---|---|---|
| 이슈/광장 | 자체 UGC 전량 | trgm+벡터 전량 | 자체 콘텐츠(전문 노출 OK) |
| 갈라뉴스 | AI 종합 발행분 | trgm+벡터(최근45일) | 자체 생성물 |
| 원본뉴스 | 수집 원본 | trgm만(검색 노출은 스니펫+링크) | **원문 재배포 금지, 제목+링크만** |
| 맛집 | 평점보유 우선 | trgm+벡터(가치순) | 자체 정제 메타 |
| 여행 | 사진보유 우선 | trgm+벡터(가치순) | 자체 정제 메타 |
| 예측(markets) | 미해결 시장 | **신규: trgm(+벡터 검토)** | 자체 콘텐츠 |
| 유저/해시태그 | 공개 프로필/태그 | trgm(유저)/GIN(태그) | 공개분만 |
| 유튜브 급상승 | 메타데이터 | trgm(제목) | **ToS: 파생지표 미표시, 링크만** |
| **비대상** | 범용 웹 | — | 범용 크롤링 안 함 |

원칙: robots.txt 준수, 원문 재배포 금지(스니펫+링크), 뉴스는 라이선스 명확한 RSS/제휴 우선. 범용 웹 검색은 하지 않는다.

---

## 4. 네이버 의존 빈칸 자체화 방안

### ① 장소검색 (local.json, 7함수) — 최우선 실질 의존
- **대체 1 (이미 있음)**: 공공데이터 파이프라인 — `ingest-baeknyeon`(백년가게), `ingest-tour-places`(관광공사 KorService2), `ingest-good-price`(착한가격), `ingest-heritage-certs`(국가유산). 이미 `food_ingest`/`travel_ingest` RPC로 자체 테이블을 채우고 있음.
- **대체 2 (지오코딩)**: `collect-food-places`가 이미 카카오 로컬(`:366`)·Nominatim(`:382`) 폴백 보유. 네이버 지오코더 → 카카오/Nominatim 우선순위로 전환.
- **잔여(신규 가게 발굴)**: 카카오 로컬 키워드검색(무료 할당 넉넉) 또는 공공데이터 소상공인 상가정보로 대체. 유료 API 추가 없음.

### ② 갈비스 웹 근거검색 (webkr.json)
- 우리가 **이미 수집하는 뉴스·이슈 인덱스에서 근거 검색**. 갈비스가 `galla_search(p_sections=['news','issue','plaza'])`로 자체 인덱스를 근거로 답변. 외부 웹문서 의존 제거.

### ③ 뉴스 (news.json)
- `collect-rss-news`가 이미 언론사 RSS 다수 자립 수집. 네이버 news.json은 보조 → RSS 소스 확대 후 제거.

### ④ 여행 트렌드 (datalab)
- `unified_realtime_trends`의 자체 축(포털검색어+뉴스+커뮤니티) 활용. datalab 없이 여행 키워드 트렌드 산출.

---

## 5. 하이브리드 랭킹 공식 (현행 유지 + 신호 결합안)

현행(galla_search): `score = w_v·(1 - cosine(search_vec, q_vec)) + w_t·similarity(title, q)` + 개인화(관심 +0.15 / 비선호 -0.12), 코너별 w_v/w_t = 0.6/0.4(텍스트형) 또는 0.55/0.45(장소형).

**결합 확장안(선택, Phase D)**: 검색 결과에 트렌드/최신성/참여 신호를 후처리 부스트로 얹는다.
```
final = galla_score
      × (1 + α·trend_boost)      -- unified_realtime_trends에 뜬 키워드면 가산
      × (1 + β·freshness)        -- 최신성 반감기(뉴스/이슈 특히)
      × (1 + γ·engagement)       -- content_signal_daily 반응배수(home_rank 재사용)
```
α/β/γ는 낮게 시작(0.1~0.2), 표면별 조정. 검색 본질(관련성) 우선, 신호는 보정.

---

## 6. 단계별 로드맵 (저비용·고효과 순)

| Phase | 내용 | 비용 | 효과 | 리스크 |
|---|---|---|---|---|
| **A. 프론트 승격** | `js/search.js` 이슈·광장·뉴스·맛집·여행 검색을 `galla_search` RPC로 전환. 질의 임베딩은 엣지 경유(anon 키 노출 없이). 유저/해시태그/영상은 현행 유지. | 0 (기존 엔진 재사용) | **최대** — 오타·동의어·의미검색 즉시 활성화 | anon 권한/질의임베딩 경로 설계 |
| **B. 예측 검색 메움** | `markets`에 title trgm 인덱스 + galla_search 'predict' 코너 추가. 유저·youtube_hot trgm 추가. | 0 | 검색 공백 해소 | 마이그레이션 1건 |
| **A′. 실시간 데이터 위젯 이어붙이기** | 갈비스에 이미 붙은 도구(`market_quote`·`apt_price`·`flight_price`·`weather_now`)를 검색창·트렌드·위젯 진입점에서 재호출. "환율/주가/집값/항공권" 검색 시 시세 카드 표시. **새 수집 없음, 재노출만.** | 0 | 큼 — 완성된 데이터를 검색에 개방 | 국내주식만 네이버 리스크(공식소스 대체 후보) |
| **C. 임베딩 크론 정식화** | 외부 크론으로만 돌던 `embed_content`를 pg_cron으로 명시·스태거. 백필 진행률 관제 노출. | 0 (무료한도) | 벡터 커버리지 안정화 | cron 인증 함정 주의 |
| **D. 네이버 장소 치환** | local.json 7함수를 카카오 로컬/공공데이터로 단계 전환. 지오코더 우선순위 변경. | 0~저 | 네이버 의존 실질 제거 | 데이터 품질 검증 |
| **E. 갈비스 웹근거 자체화** | webkr → 자체 인덱스 근거검색. news.json→RSS 완전전환. datalab→자체축. | 0 | 네이버 검색 API 완전 이탈 | 근거 품질 QA |
| **F. 규모 대응·국제화** | 콘텐츠 수만 건 초과 시 hnsw 벡터 인덱스 재도입. locale별 인덱스 분기(뉴스/트렌드 나라별). | 0~저 | 성능·글로벌 | 한국 출시 후 |

---

## 7. 열린 결정 사항 (사장님 판단 필요)

1. **Phase A 질의 임베딩 경로**: 프론트가 직접 CF 임베딩 호출은 키 노출 위험 → 엣지 함수(예: `galla-search` 신설 또는 `galla-friend` op 재사용) 경유가 안전. 신설 vs 재사용 어느 쪽?
2. **anon 검색 허용 범위**: `galla_search`는 현재 anon revoke. 비로그인 검색을 허용하려면 anon용 래퍼(개인화 벡터 없이) 필요. 비로그인도 통합검색 노출할지?
3. **로드맵 시작점**: A(프론트 승격)부터 바로 착수 vs A+B 묶어서 착수.
4. **네이버 즉시 제거 vs 병행**: 사장님 기존 방침 "일단 쓰고 문제되면 교체"에 따라 D/E는 후순위로 둘지.

---

## 8. 제약 준수 체크

- ✅ 범용 크롤링 없음 — 우리 도메인만
- ✅ 원문 재배포 금지 — 스니펫+링크
- ✅ 비용 0 지향 — pgvector 저장·CF bge-m3 무료한도·유료 API 추가 없음
- ✅ locale 컬럼 기반 국제화 연계 대비
- ✅ 코드 수정 전 승인 — 본 문서가 그 승인 대상

---

*이 문서는 설계 초안이며 코드는 아직 수정하지 않았습니다. 승인 후 Phase A부터 착수합니다.*
