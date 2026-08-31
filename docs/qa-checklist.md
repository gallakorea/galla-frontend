# 갈라 전수 QA 체크리스트

배포 전·정기 점검용. **기억에 의존하면 반드시 빠진다** — 이 목록은 코드베이스에서 기계적으로 뽑은
표면(페이지 68 · 엣지함수 47 · JS 154 · 데이터 테이블)을 기준으로 만들었다.

상태 표기: `✅` 확인함(DB까지) · `🔶` 부분 · `❌` 미확인 · `⛔` 막힘(사유 명시)
마지막 갱신: 2026-08-31 (9차 — 출시 차단 19건 착수. 보안 4건 감사(광장 점수 조작·업로드 타입 위조 수정), 법무 표시 6건 + AI 국외이전 고지 완료)

---

## 0. 기계 검사 — 배포 전 매번 (5분)

사람이 못 세는 것을 센다. 넷 다 서로 다른 결함을 잡고, **앞의 것이 놓친 걸 뒤의 것이 잡는다.**

| # | 검사 | 실행 | 잡는 것 |
|---|---|---|---|
| 0-1 | 정적 버튼 | `python3 scripts/dead-buttons.py` | HTML 버튼 중 어떤 경로로도 안 잡히는 것 |
| 0-2 | 앱 origin·스탬프 | `python3 scripts/check-app-urls.py` | 앱에서만 죽는 링크 · 캐시 안 깨지는 자산 · GALLA_V 상수화 |
| 0-3 | 도달성(런타임) | `scripts/audit-buttons.js` 브라우저 | **JS가 만든 버튼**(정적 검사가 못 봄, 실측 2,025개) |
| 0-4 | 클릭 결과 | `scripts/click-buttons.js` 브라우저 | 눌렀을 때 나는 예외·무반응 |
| 0-5 | 가림 | `scripts/occlusion-audit.js` 브라우저 | 덮여서 **손가락으로 못 누르는** 것 |
| 0-6 | **스탬프 누락** | `python3 scripts/stale-stamps.py HEAD~N` | 바꾼 JS 인데 HTML `?v=` 가 옛날 값 — **고친 코드가 전달 안 됨** |
| 0-7 | 죽은 버튼 회귀 | 위 결과 0건 유지 | — |

⚠️ 0-3~0-5는 **로그인 상태로** 돌려야 한다. 로그아웃이면 화면이 비어 전부 통과한다.
⚠️ 0-4는 쓰기를 막고 누르므로 **하네스가 만드는 오탐**이 있다. 보고 전 소스 확인 필수.

---

## 1. 인증·계정

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 이메일 가입 → 인증메일 → `/auth/confirm` | ❌ | ❌ | ❌ |
| 이메일 로그인 | ✅ | ✅ | ✅ |
| 소셜 로그인 — 구글 | ⛔ provider 키 미설정 | ⛔ | ⛔ |
| 소셜 로그인 — 카카오 | ⛔ | ⛔ | ⛔ |
| 소셜 로그인 — 네이버 | ⛔ | ⛔ | ⛔ |
| 패스키 등록·로그인 | ❌ | ❌ | ❌ |
| 비밀번호 변경 | ❌ | ❌ | 🔶 검증만 |  <!-- 8자미만·불일치 가드 동작 확인, 실제 변경은 미수행 -->
| 비밀번호 재설정 메일 | ❌ | — | — |
| 로그인 기록 | ❌ | ❌ | ✅ |  <!-- 0830 결함: 기록기 부재→log_login RPC 신설. 활성기기+이력 렌더 확인 -->
| 로그아웃 | ❌ | ❌ | ✅ |  <!-- 세션 제거 확인. 재로그인은 비번 필요라 사장님 몫 -->
| 계정 삭제(탈퇴) | ❌ | ❌ | ❌ |
| 세션 유지(앱 재시작) | — | ✅ | ✅ |

---

## 2. 콘텐츠 생성

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 이슈 발제 | ⛔ 잠김('곧 열려요') | ⛔ | ⛔ |
| 광장 글 (텍스트) | ✅ | ✅ | ❌ |
| 광장 글 — 사진·영상·링크 첨부 | ❌ | ✅ | ❌ |  <!-- Supabase Storage plaza-images 업로드, body 에 [IMAGE] 마커 + thumbnail 저장, 목록·상세 렌더 확인 -->
| 숏판(세로) 업로드 | ✅ | ❌ | ✅ |  <!-- CDN 200·PNG→JPG·표지·태그 -->
| 숏판 — 캐러셀 여러 장 | 🔶 UI만 | ❌ | ❌ |
| 롱판(가로) 업로드 | ❌ | ✅ | ❌ |  <!-- post kind=horizontal, Cloudflare Stream HLS+자동썸네일 둘 다 200. ※ Stream 과금 확인 필요 -->
| 예측 마켓 생성 | ⛔ 잠김 | ⛔ | ⛔ |
| 제보하기 (+100 GP) | ✅ | ❌ | ✅ |  <!-- tips + point_ledger tip:submit, 하루 3회 상한 서버강제 -->
| 제보 — 미디어 첨부 | ❌ | ❌ | ❌ |
| 임시저장·복원 | 🔶 광장만 | ✅ | ❌ |
| 수정·삭제(owner-actions) | ❌ | ❌ | ❌ |

---

## 3. 상호작용

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 이슈 투표(찬반) | ✅ | ✅ | ✅ |
| 투표 후 진영 잠금 안내 | ✅ | ✅ | ✅ |
| 이슈 댓글(참전) | ✅ | ❌ | ❌ |
| **이슈 대댓글** | ✅ | ❌ | ❌ |
| **이슈 전투 — 공격** | ✅ | ❌ | ✅ |  <!-- HP 90→80(c_atk=14, 풀 100-dmg+heal), 쿨다운 60s·리셋권 유도 확인 -->
| 이슈 전투 — 방어·지원 | 🔶 SQL시뮬 | ❌ | 🔶 SQL시뮬 |  <!-- 방어+6·지원+8 healed 반영, 카운터 증가. 회복은 받은피해의 30%까지만(_hp_of) — 14피해면 최대4. 가드 4종 정확: 아군공격=same_faction, 적진방어/지원=cross_faction. 쿨다운은 행동종류별 60s -->
| **적진 침투(3/3 제한)** | ✅ | ❌ | ✅ |  <!-- 내 진영 pro인데 댓글 faction=con 저장, 3→2 차감 -->
| 격파·재참전 잠금·부활권 | 🔶 코드확인 | ❌ | 🔶 코드확인 |  <!-- battle_action: v_ko = hp_before>0 && hp=0. 실제 격파까지는 미도달 -->
| 릴스 댓글 | ✅ | ✅ | ✅ |
| **릴스 대댓글** | ✅ | ❌ | ✅ |  <!-- parent_id 저장·hv-cmt-r 22px 들여쓰기·1뎁스·부모삭제 FK CASCADE -->
| 광장 댓글 | ✅ | ✅ | 🔶 버튼만 |
| **광장 대댓글** | ✅ | ❌ | ❌ |
| 광장 추천/비추천 | ✅ | ❌ | ❌ |
| **숏판 댓글·대댓글** | ✅ | ❌ | ✅ |  <!-- post_comments parent_id 저장·카운트 반영 -->
| **뉴스 댓글·대댓글** | ✅ | ❌ | ❌ |
| **핫튜브 댓글·대댓글** | ✅ | ❌ | ❌ |
| **예측 의견배틀 댓글** | ✅ | ❌ | ❌ |
| **날씨 동네 한마디** | ✅ | ❌ | ❌ |
| 댓글 좋아요 | ✅ | ❌ | ❌ |
| 좋아요·북마크(저장) | 🔶 토글만 | ❌ | ✅ |
| 공유 — 링크가 galla.im 인지 | ✅ | ✅ | ✅ |
| 팔로우·언팔로우 | ✅ | ❌ | ❌ |
| 신고(콘텐츠) | ✅ | ❌ | ❌ |
| **차단(유저)** | ✅ | ❌ | ❌ |
| 버그 신고 | ✅ | ❌ | ❌ |
| 유령 모드(익명) — 유령권 게이팅 | ✅ | ❌ | ❌ |

---

## 4. 소통 — 갈라톡

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 유저 검색 | ✅ | ✅ | ❌ |
| DM 대화방 생성·전송 | ✅ | 🔶 입력만 | ❌ |
| DM 수신·읽음 | ❌ | ❌ | ❌ |
| DM 이미지·GIF·스티커 | ❌ | ❌ | ❌ |
| DM 폴더·즐겨찾기·숨김 | ❌ | ❌ | ❌ |
| E2E 암호화 | ❌ | ❌ | ❌ |
| **친구 추가·목록** | ✅ | ❌ | ❌ |
| **난장(오픈챗) 개설** | ✅ | ❌ | ❌ |
| **난장 입장·대화** | ✅ | ❌ | ❌ |
| 난장 나가기·방장 권한 | ❌ | ❌ | ❌ |
| 난장 방장 권한(강퇴·밴) | ❌ | ❌ | ❌ |
| **육성 난장(라이브)** | ❌ | ❌ | ❌ |
| **삐삐 개통(랜덤)** | ✅ | ❌ | ❌ |
| 삐삐 번호 골라 개통 | ❌ | ❌ | ❌ |
| **삐삐 음성 발신·수신** | ⛔ 마이크 필요 | ❌ | ❌ |
| 면상톡·육성톡(1:1 통화) | ⛔ 보류 기능 | ⛔ | ⛔ |

---

## 5. 갈비스(AI 친구)

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 대화 응답·문맥 유지 | ✅ | ❌ | ❌ |
| 감정 엔진 기록 | ✅ | — | — |
| 인물·사실 기억(friend_memory) | ❌ | ❌ | ✅ |  <!-- person/mkey=몽자 저장 + embedding. 과거 0건 결함 해소 확인 -->
| 선톡(ping) | ❌ | ❌ | 🔶 게이트확인 |  <!-- free 티어 galla-friend-ambient n=0 — 유료 전용 게이트는 확인, 실제 발송 미확인 -->
| 위기 감지 → 상담카드 | ❌ | ❌ | ❌ |
| 컨시어지(택시·배달 딥링크) | ❌ | ❌ | ❌ |
| 창작 대행(썸네일·영상) | ⛔ 잠김 | ⛔ | ⛔ |
| **원가 기록(ai_spend)** | ✅ 2026-08-29 수정 | — | — |
| 턴 한도·게이트(무료 5턴) | ❌ | ❌ | ✅ |  <!-- 6번째 차단+리셋시각 안내. 게스트 2턴도 확인. pill 미갱신 결함은 0830007에서 수정 -->

---

## 6. 트렌드

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| **통합검색 실행(이슈·예측·뉴스·유튜브·광장)** | ❌ | ❌ | ❌ |
| 해시태그 검색 | ❌ | ❌ | ❌ |
| 유저 검색 | ✅ | ✅ | ❌ |
| 핫트렌드 실시간 검색어 | 🔶 렌더만 | ❌ | 🔶 |
| 갈라뉴스 열람 | ❌ | ❌ | ❌ |
| 핫튜브 목록·급상승 | 🔶 렌더만 | ❌ | ✅ |
| **핫튜브 영상 실제 재생** | ❌ | ❌ | ⛔ 에뮬 GPU 한계 |
| **날씨 — 지역선택·제보·동네한마디** | ✅ | ❌ | ❌ |
| 광장 목록·정렬(후끈·최신·조회) | 🔶 | ✅ | ✅ |

---

## 7. 경제

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| GP 잔액 표시 | ✅ | ✅ | ✅ |
| 예측 베팅 · GP 차감 · 배당 | ✅ | ❌ | ❌ |
| 예측 정산·연승콤보 | ❌ | ❌ | ❌ |
| **데일리 미션 수령** | ❌ | ❌ | ❌ |
| **출석·연속 보너스** | ❌ | ❌ | ❌ |
| **갈라 뽑기(가챠)** | ❌ | ❌ | ❌ |
| **GP 상점 구매** | ⛔ 결제성 | ⛔ | ⛔ |
| **GC 충전** | ⛔ 결제성 | ⛔ 차단이 정상 | ⛔ |
| **후원(발의자·크리에이터)** | ⛔ 결제성 | ⛔ | ⛔ |
| **출금 요청** | ⛔ 결제성 | ⛔ | ⛔ |
| 이용권 시트 — 가격 미노출 | — | ✅ | ✅ |
| IAP 구매·복원 | ⛔ 스토어 상품 미등록 | ⛔ | ⛔ |
| 친구 초대(ref 코드) | 🔶 공유 URL만 | ✅ | ✅ |

---

## 8. 설정·프로필

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| 프로필 편집(닉·소개) | ✅ | ❌ | ❌ |
| 프로필 사진 업로드 | ❌ | ❌ | ❌ |
| 닉네임 중복·형식 검사 | ❌ | ❌ | ❌ |
| 알림 설정 8종 토글 | ✅ | ❌ | ❌ |
| 방해금지 시간 | ❌ | ❌ | ❌ |
| 보관(저장한 것) 목록 | ❌ | ❌ | ❌ |
| 내 등급·시즌 랭킹 | ❌ | ❌ | ❌ |
| 꾸미기(닉네임·프레임) | ❌ | ❌ | ❌ |
| 내 글 통계 | ❌ | ❌ | ❌ |
| 갈라 성향 4축 | 🔶 렌더만 | 🔶 | 🔶 |

---

## 9. 플랫폼 고유 (에뮬·실기기)

| 항목 | iOS | AOS |
|---|---|---|
| 콜드스타트·스플래시 | ✅ | ✅ |
| 5탭 전환·keep-alive | ✅ | ✅ |
| 탭 첫 진입 FOUC | ✅ 2026-08-29 수정 | ✅ |
| 하드웨어 뒤로가기 | — | ✅ 2026-08-29 수정 |
| 딥링크(`im.galla.app://`) | ✅ | ✅ |
| 유니버설/앱 링크(`https://galla.im`) | ❌ | ❌ |
| 푸시 권한 요청 | ❌ | ⛔ Firebase 미설정 |
| 푸시 수신·탭 이동 | ❌ | ⛔ |
| 카메라·마이크·사진 권한 | ❌ | ❌ |
| 오프라인·네트워크 끊김 | ❌ | ❌ |
| OTA 버전 전파 | 🔶 | 🔶 |
| 앱↔웹 세션 공유 | ❌ | ❌ |
| 화면 회전·큰 글씨·다크모드 | ❌ | ❌ |

---

## 10. 운영·백엔드

| 항목 | 상태 |
|---|---|
| 크론 인증(Authorization 헤더) | ❌ 재점검 필요 — 없으면 401인데 이력엔 'succeeded' |
| 엣지 함수 47종 헬스 | ❌ |
| AI 원가 장부(ai_spend) 누락 함수 | 🔶 galla-friend 수정 완료, 나머지 재확인 필요 |
| 클라 에러 수집(client_errors) | ❌ |
| 버그헌터 자동 스캔 | ❌ |
| 레드팀 배터리 | ❌ |
| 관제센터(admin) | ❌ |
| RLS·컬럼권한 회귀 | ❌ |
| 백업·복구 | ❌ |

---

## 11. 심사·규정

| 항목 | 상태 |
|---|---|
| 인앱 anti-steering(가격·충전 유도 금지) | ✅ iOS·AOS |
| 창작 에이전트 잠금 | ✅ iOS·AOS |
| 사행성 용어 금지(판돈→대결 GP 등) | ❌ |
| 약관·개인정보·청소년보호 링크 | ❌ |
| 신고·차단 동선(앱스토어 필수) | 🔶 신고만 |
| 계정 삭제 동선(앱스토어 필수) | ❌ |

---

## 3-B. 대결·놀거리 (⚠️ 1차 목록에서 통째로 빠졌던 장)

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| **일기토(1:1 논쟁) 신청·수락** | ❌ | ❌ | ❌ |
| 일기토 진행·메시지(duel_messages) | ❌ | ❌ | ❌ |
| 일기토 AI 판정(duel-ai-judge) | ❌ | ❌ | ❌ |
| 일기토 관전·투표 | ❌ | ❌ | ❌ |
| **나만의 이모티콘(AI 생성·GP 차감·환불)** | ❌ | ❌ | ❌ |
| DM 스티커 사용 | ❌ | ❌ | ❌ |
| **알림 목록·읽음 처리(notifications)** | ❌ | ❌ | ❌ |
| 갈라 성향 테스트(/match) 공유 | ❌ | ❌ | ❌ |

## 6-B. 공개·유입 (검색·공유·SEO)

| 항목 | 상태 |
|---|---|
| **공유 OG 카드**(`functions/share/` 엣지 렌더) — 카톡·X 미리보기 | ✅ |
| 기본 OG 이미지 폴백 | ❌ |
| **robots.txt · sitemap.xml.js 동적 생성** | ❌ |
| **IndexNow 색인 제출**(`functions/indexnow.js`) | ❌ |
| 엣지 메타 주입(`_middleware.js`) | ❌ |
| imgproxy 외부 이미지 프록시 | 🔶 앱에서만 확인 |
| PWA 설치 유도·오프라인 페이지 | ❌ |

## 10-B. 데이터 파이프라인·추천

| 항목 | 상태 |
|---|---|
| **추천 신호 층(feed_signals) 15분 집계** | ❌ |
| 조회수 집계(content_daily_views) | ❌ |
| **릴스 실행 에이전트(agent_jobs · reel-agent)** | ❌ |
| 미디어 R2 이관·고아 정리(purge-orphan-media·video-migrate-worker) | ❌ |
| 뉴스 썸네일 치유(heal-news-thumbs) | ❌ |
| 링크 미리보기·본문 추출(link-preview·article-reader) | ❌ |
| **갈비스 시맨틱 라우터(galvis_intents)** | ❌ |
| **학습데이터 축적(sft_samples·distill-failures)** | ❌ |
| 창작 레퍼런스 DB(creator_patterns) | ❌ |
| GA 동기화(ga-sync) | ❌ |

## 10-C. 엣지 함수 47종 — 역할별 헬스 (전수)

⚠️ 여기 없는 함수가 생기면 이 표를 갱신한다. 함수 목록은 `ls supabase/functions/`.

| 묶음 | 함수 | 확인할 것 | 상태 |
|---|---|---|---|
| 수집(크론) | collect-raw-news · collect-rss-news · collect-community-hot · collect-external-trends · collect-youtube-hot | 스케줄 실행 · **Authorization 헤더**(없으면 401인데 이력엔 succeeded) · 수집량 | ❌ |
| 생성(크론) | generate-galla-news · generate-community-plaza · generate-predict-markets · generate-ai-arguments | 산출물 품질 · 중복 · 원가 기록 | ❌ |
| 정산(크론) | predict-auto-resolve · weather-sync · heal-news-thumbs · purge-orphan-media | 오판정 · 누락 | ❌ |
| 갈비스 | galla-friend · galla-friend-ping · galla-jarvis · galvis-craftbench · galvis-redteam · distill-failures | 응답 · 선톡 · 원가 · 레드팀 회귀 | 🔶 galla-friend만 |
| 창작 | generate-thumbnail · generate-video · generate-sticker · reel-agent | GP 선차감·환불·검열 | ❌ |
| 미디어 | upload-media · stream-upload · stream-ingest · stream-to-r2 · video-migrate-worker · imgproxy | 업로드·변환·R2·프록시 | 🔶 이미지만 |
| 통화·라이브 | agora-token · rtc-sfu · turn-cred · call-push | 토큰 발급 · SFU 연결 | ⛔ 보류 기능 |
| 인증 | naver-auth · passkey · delete-account | 소셜복귀 · 패스키 · 탈퇴 | ⛔/❌ |
| 결제 | verify-iap · store-notify | 영수증 검증 · 구독 생명주기 | 🔶 시뮬만 |
| 알림 | send-push · bug-alert | APNs·FCM 발송 · 관리자 알림 | ❌ |
| 부가 | translate · gif-search · link-preview · article-reader · check-issue · galla-stt · ga-sync · yt | 각 기능 동작 | ❌ |


## 10-D. 크론 46개 — 스케줄 층 (⚠️ 3차 대조에서 발견)

페이지·엣지함수·테이블 어디에도 안 걸리는 층이다. **화면이 멀쩡해도 여기가 죽으면 앱이 서서히 빈다.**
확인: `select jobname, schedule, active from cron.job;` · 실패: `cron.job_run_details where status<>'succeeded'`

| 묶음 | 잡 | 확인할 것 | 상태 |
|---|---|---|---|
| 뉴스 수집 | collect_raw_news(5분) · collect_rss_news(10분) · categorize_raw_news(10분) · group_related_news(15분) · fetch_article_thumbnail · fetch_missing_thumbnails · heal_news_thumbs | 수집량 · 썸네일 결손 | ❌ |
| 뉴스 생성·정리 | generate_galla_news(30분) · purge_galla_news_daily · purge_old_news_daily | 품질 · 보존기간 | ❌ |
| 트렌드 | collect_external_trends(20분) · collect_youtube_hot(30분) · community_hot_collect/generate · hot_scores(10분) | 급상승 델타 · 중복 | ❌ |
| 예측 | predict_markets_generate · predict_issue_market · predict_auto_resolve(매시) · predict_season_rollover · season_rollover | 자동생성 5개 · 오판정 | ❌ |
| 이슈 | settle-due-issues(매시) | 마감·정산 | ❌ |
| 갈비스 | galvis_ping_daily · friend_memory_maintain · curate-sft-daily · distill-failures-daily · craft-exemplars · galvis-craftbench/redteam(주간) | 선톡·기억정리·학습데이터 | ❌ |
| 추천·통계 | feed_signals_rollup(15분) · snapshot_daily_views · gallian_cache_refresh · pattern_perf_score · ga_sync(10분) | 집계 정확성 | ❌ |
| 미디어 | video_migrate(5분) · purge_orphan_media · media_ref_refresh | 이관·고아정리 | ❌ |
| 운영 | bug_hunt(30분) · client_errors_purge · ai_user_usage_purge · ai_window_sweep · dm-expire-sweep(5분) · secret-mailbox-sweep · weather_sync(10분) · indexnow_ping | 자동스캔·정리 | ❌ |

⚠️ **크론 인증 함정**: Authorization 헤더 없이 부르면 401 인데 `job_run_details` 에는 `succeeded` 로 남는다.
   "돌고 있다"가 아니라 **산출물이 늘었는지**로 확인해야 한다.
   현재(2026-08-29): 46개 전부 active · 최근 3일 실패 0건 — 다만 위 이유로 이것만으로는 부족하다.

## 10-E. RPC 631개 · 스토리지 · 실시간

| 항목 | 확인할 것 | 상태 |
|---|---|---|
| **RPC 631개** — SECURITY DEFINER 권한 가드 | `current_user` 로 권한 판정하면 구멍(소유자로 평가됨) | ❌ |
| 핵심 RPC 회귀 | place_bet · battle_action · submit_bug · get_my_account · gp_wallet · predict_state · open_room_create · log_share · claim_tour_bonus | ❌ |
| **스토리지 버킷 3종** | issues · plaza-images · profiles — 공개범위·용량·고아 | ❌ |
| R2 버킷(galla-media) | CORS · 공개 URL · 고아 파일 | ❌ |
| **실시간 구독** | follows(맞팔 즉시반영) · dm_messages · pager · 난장 | ❌ |
| DB 트리거 | 알림 발생(notify 브릿지) · 카운터 갱신 | ❌ |
| RLS 정책 회귀 | 남의 글 수정·삭제 차단 · PII 컬럼권한 | ❌ |

## 9-B. 네이티브 플러그인·권한 (실기기 필요)

| 항목 | iOS | AOS |
|---|---|---|
| @capacitor/app — 딥링크·백그라운드 복귀 | ✅ | ✅ |
| @capacitor/push-notifications | ❌ | ⛔ Firebase 미설정 |
| @capacitor/keyboard — resize:native | 🔶 | ❌ |
| @capacitor/haptics | ❌ | ❌ |
| @capacitor/browser — 외부링크 | ❌ | ❌ |
| @capacitor/app-launcher — 택시·배달 딥링크 | ❌ | ❌ |
| cordova-plugin-purchase — IAP | ⛔ 상품 미등록 | ⛔ |
| cordova-plugin-iosrtc — 통화 | ⛔ 보류 | — |
| **권한: 카메라** | ❌ | ❌ |
| **권한: 마이크** | ❌ | ❌ |
| **권한: 사진 라이브러리(읽기·쓰기)** | ❌ | ❌ |
| **권한: 위치**(날씨) | ❌ | ❌ |
| **권한: 알림** | ❌ | ❌ |
| 권한: 음성인식(iOS)·블루투스 | ❌ | — |
| 권한 거부 후 재요청 동선(help-permissions) | ❌ | ❌ |


## 10-F. 환경변수·외부 의존 (⚠️ 4차 대조에서 발견 — 가장 조용히 죽는 층)

엣지 함수가 읽는 환경변수 **83종**, 외부 서비스 **14곳**. 키가 없으면 대개 **에러 없이 폴백하거나 그냥 안 한다.**
화면도 로그도 멀쩡한데 기능만 빠져 있다 — QA 에서 제일 놓치기 쉽다.

확인:
```bash
# 코드가 쓰는 것
grep -rho 'Deno\.env\.get("[A-Z_0-9]*")' supabase/functions/ | sed 's/.*("\(.*\)")/\1/' | sort -u > /tmp/used
# 실제 설정된 것
npx supabase secrets list --project-ref bidqauputnhkqepvdzrr \
  | python3 -c "import sys,json;print('\n'.join(sorted(x['name'].strip() for x in json.load(sys.stdin)['secrets'])))" > /tmp/set
comm -23 /tmp/used /tmp/set   # 코드는 쓰는데 설정 없음
comm -13 /tmp/used /tmp/set   # 설정만 있고 안 쓰는 죽은 키
```

현재(2026-08-29): 설정 52 · 코드사용 83 · **미설정 39** · 죽은 키 4

| 미설정 키 | 결과 | 상태 |
|---|---|---|
| **KMA_SERVICE_KEY** | 날씨가 기상청 실황이 아니라 **Open-Meteo 모델 예측 폴백**으로 돈다. '지금 우리 동네'의 근거가 달라진다 | ❌ 확인 필요 |
| FIREBASE_SERVICE_ACCOUNT | 안드로이드 푸시 전무 | ⛔ 알려진 미설정 |
| APPLE_* (5종) · GOOGLE_SA_* | IAP 영수증 검증 불가 | ⛔ 스토어 등록 전 |
| STORE_NOTIFY_KEY | 구독 생명주기 웹훅 인증 없음 | ❌ |
| RESEND_API_KEY · BUG_ALERT_EMAIL | **버그 제보가 와도 메일 알림이 안 간다** | ❌ |
| EMBED_API_KEY | OPENAI_API_KEY 로 폴백 — 임베딩 공간이 의도와 다를 수 있다(라우터 정확도) | ❌ |
| ANTHROPIC_API_KEY | 클로드 경로 사용 불가(폴백은 있음) | 🔶 |
| STT_* · CF_STT_MODEL · CF_WORKERS_AI_TOKEN | 음성 인식 경로 | ❌ |
| FRIEND_* (7종) · JARVIS_* · *_MODEL | 전부 기본값 폴백 — 의도한 모델이 아닐 수 있다 | 🔶 |
| TRANSLATE_MODEL | 다국어 번역 | ❌ |
| 죽은 키: CF_IMAGES_TOKEN · GNEWS_API_KEY · NEWS_API_KEY · TENOR_API_KEY | 코드가 안 씀 — 정리 대상 | 🔶 |

### 외부 서비스 14곳 — 하나 죽으면 어디가 멈추나
| 서비스 | 쓰는 곳 | 죽으면 |
|---|---|---|
| DeepSeek | 갈비스·뉴스·예측 생성 | 대화·자동생성 전부 | ❌ |
| Gemini / OpenAI / Anthropic | 폴백·임베딩·이미지 | 품질 저하·라우터 | ❌ |
| Cloudflare R2 | 모든 미디어 | 업로드·재생 | 🔶 |
| Cloudflare Pages Functions | OG카드·sitemap·imgproxy·IndexNow | 공유 미리보기·색인 | ❌ |
| Capgo(OTA) | 앱 웹자산 배포 | 앱이 옛 코드에 갇힘 | 🔶 |
| YouTube API | 핫튜브 수집 | 급상승 목록 | ❌ |
| 기상청 / Open-Meteo | 날씨 | 폴백 중 | ❌ |
| GIPHY | DM GIF | GIF 검색 | ❌ |
| Shotstack | 영상 생성 | 창작 대행 | ⛔ |
| Agora / CF Calls / TURN | 통화·라이브 | 음성 기능 | ⛔ |
| Resend | 메일 발송 | 알림 메일 | ❌ |
| GA | 통계 | 지표 | ❌ |
| Apple / Google 스토어 | IAP·구독 | 결제 | ⛔ |
| 뉴스 RSS(연합·조선·동아 등) | 뉴스 수집 | 기사 유입 | ❌ |


## 12. 품질 축 (기능 아님 — 놓치기 쉬움)

| 항목 | 상태 |
|---|---|
| **다국어(i18n · GALLA_t · locale 컬럼)** — 번역 누락·깨짐 | ❌ |
| translate 엣지 함수 | ❌ |
| **성능** — 콜드스타트·LCP·이미지 용량 | ❌ |
| **접근성** — 대비·포커스 링·스크린리더·큰 글씨 | ❌ |
| **반응형** — 태블릿·좁은 PC창(481~1099px) | ❌ |
| 빈 상태(콘텐츠 0개) 화면 | 🔶 난장·숏판 비운 뒤 미확인 |
| 에러 상태(네트워크 실패·403·404) | ❌ |
| 긴 텍스트·이모지·RTL 깨짐 | ❌ |
| 동시성(같은 계정 2기기) | ❌ |

## 13. 페이지 대조표 (68개 — 고아 없는지 확인용)

기능명으로만 적으면 페이지가 조용히 빠진다. 새 페이지가 생기면 여기에 줄을 추가한다.
확인: `for f in *.html; do grep -q "$(basename $f .html)" docs/qa-checklist.md || echo "$f"; done`

| 장 | 페이지 |
|---|---|
| 1 인증 | login · signup · reset · change-password · login-history · auth-callback · auth/confirm · confirm |
| 2 생성 | write · write-remix · **confirm.remix** · create · gallari-write · report · plaza(작성) |
| 3 상호작용 | index · issue · plaza · plaza_detail · gallari · gallari-post · gallari-reels · watch |
| 3-B 대결 | duel · random · match · galla-type |
| 4 소통 | dm |
| 6 트렌드 | search · news · yt |
| 7 예측 | galla-predict · predict-market |
| 7 경제 | wallet · charges · gp-history · quest · grade · season · **donation** · **donation-usage** · settlement · revenue-settlement · withdraw · withdraw-done · creator |
| 8 설정 | settings · account-edit · mypage · saved · **support** · help-permissions · privacy · terms |
| 10 운영 | admin · admin-login |
| 셸 | app(SPA 셸) · index(피드) · shorts.html(고아) |
| — 제외 | nav-test* · agora-test · mic-test · preview · offline · app-shell · naver인증 · **shorts(고아 프로토타입)** |

### 이번 대조로 추가된 미커버 항목

| 항목 | 상태 |
|---|---|
| **고객지원·문의(support)** 문의 등록·답변 | ❌ |
| **리믹스 작성 흐름(write-remix → confirm.remix)** | ❌ |
| **사회적 환원 내역(donation-usage)** 표시 | ❌ |
| **GP 사용 이력(gp-history)** 정확성 | ❌ |
| **관리자 로그인(admin-login)** 권한 게이트 | ❌ |
| **shorts.html** — 아무 데서도 링크 안 되는 고아 페이지(삭제 검토) | 🔶 |


## 14. 이 목록이 완전한지 검사하는 법 (⚠️ 제일 중요)

이 문서는 **세 번 다시 썼다.** 매번 "다 넣었다"고 생각했고 매번 빠졌다:
  1차(기억으로) → 2차에서 51개 누락 발견 → 3차에서 크론·RPC·권한 층 또 발견.
**기억으로 점검하면 반드시 빠진다.** 아래를 돌려서 고아를 찾는다.

```bash
cd ~/Developer/GitHub/galla-frontend
D=docs/qa-checklist.md

# ① 페이지
for f in *.html; do grep -q "$(basename $f .html)" $D || echo "페이지 누락: $f"; done

# ② 엣지 함수
for f in $(ls supabase/functions | grep -v _shared); do grep -q "$f" $D || echo "함수 누락: $f"; done

# ③ JS 모듈(기능 단위 — 새 기능은 대개 새 파일로 온다)
for f in js/*.js; do b=$(basename $f .js); grep -qi "$b" $D || echo "모듈 미언급: $b"; done

# ④ 크론 (SQL Editor)
#   select jobname from cron.job order by 1;   → 10-D 와 대조
# ⑤ 행이 쌓이는 테이블 (SQL Editor)
#   select relname, n_live_tup from pg_stat_user_tables where n_live_tup>0 order by 2 desc;
# ⑥ 환경변수 (10-F 참고) — 코드가 쓰는데 설정 없는 키
# ⑦ 네이티브 플러그인
#   cd ../galla-app && python3 -c "import json;d=json.load(open('package.json'));print([k for k in d['dependencies'] if 'capacitor' in k or 'cordova' in k])"
```

③은 노이즈가 많다(공용 유틸도 잡힌다). 그래도 **새 기능 파일이 목록에 없으면 눈에 띈다.**

### 갱신 규칙
- 새 페이지·엣지함수·크론·플러그인을 추가하면 **같은 커밋에서** 이 문서에 줄을 추가한다.
- 칸은 ✅🔶❌⛔ 넷 중 하나만. "아마 될 것"은 ❌ 다.
- ✅ 는 **DB 행 또는 실제 산출물**을 본 것만. 화면 토스트는 근거가 아니다.

## 15. 법무·심사 표시 (⚠️ 5차 발견 — 결제 붙이면 법 위반 소지)

**2026-08-31 해결.** 사업자 정보를 초기화면에 노출한다 — 웹은 `index.html` 푸터,
앱은 웹 푸터가 없으므로 `settings.html` 맨 아래. 약관 본문 안에만 두면 §10 '초기화면 표시'
요건을 못 채운다. 청소년보호정책 페이지(`youth.html`)도 신설했다(19금 카테고리가 있는데 없었다).

| 항목 | 근거 | 상태 |
|---|---|---|
| **사업자등록번호·상호·대표자명** | 전자상거래법 §10 표시의무 | ✅ 웹 푸터·앱 설정·약관·청소년정책 |
| **통신판매업 신고번호** | 결제 선행 요건 | 🔶 "준비 중"으로 표시 — **신고는 사장님 몫** |
| **사업장 주소·연락처·이메일** | 표시의무 | ✅ |
| **호스팅 제공자 표시** | 표시의무 | ✅ Cloudflare·Supabase |
| **청소년보호책임자** | 청소년보호법 | ✅ + `youth.html` 신설 |
| **개인정보 보호책임자** | 개인정보보호법 §31 | ✅ |
| 환불·청약철회 정책 | 표시의무 | 🔶 terms·charges·wallet 에 언급은 있음 |
| 이용약관 본문 | — | 🔶 2,887자 (내용 검토 필요) |
| 개인정보처리방침 본문 | — | 🔶 4,084자 (수집항목·보유기간 정확성 미검증) |
| 앱스토어 개인정보 라벨(nutrition) | 심사 필수 | ✅ docs/store-privacy-review.md (Tracking 전부 아니오 → ATT 불필요) |
| 연령등급·심사 메모·테스트 계정 제공 | 심사 필수 | ✅ docs/store-privacy-review.md (17+ · 영문 심사메모 · 비번은 사장님이 직접 입력) |

⚠️ **GC 충전·후원·출금을 켜기 전에 반드시 해결.** 지금은 결제가 꺼져 있어 노출되지 않았을 뿐이다.

## 16. 계정 상태·어뷰징

| 항목 | 확인 | 상태 |
|---|---|---|
| **정지·제재 계정 상태** | `users` 에 `deleted_at` 뿐 — **밴/정지 컬럼이 없다.** 악성 유저를 어떻게 막나 | ❌ 설계 부재 |
| 삭제(탈퇴) 계정의 잔존 콘텐츠 | 글·댓글이 어떻게 보이나 | ❌ |
| 게스트(비로그인) 동선 | 읽기 가능 범위 · 쓰기 차단 | ✅ 2026-08-30 — 이슈 읽기 O, 댓글·투표·숏판·제보 쓰기 전부 RLS 42501 차단. 투표 시도 시 로그인 화면으로 이동. 갈비스 2턴 후 가입 유도 |
| 미인증 이메일 상태 | 어디까지 허용 | ❌ |
| 다계정·GP 파밍 | 초대 보상·제보 보상 악용 | ❌ |
| 도배 방지 | cooldown(날씨·이슈댓글) · daily_limit(썸네일·영상) 존재 — **댓글·DM·광장엔 없음** | 🔶 |
| 좀비 세션(삭제된 계정 토큰) | supabase.js 에 정리 로직 있음 | 🔶 |
| 신고 처리 SLA·검열 | 접수는 되는데 **처리 동선 미확인** | ❌ |

## 17. 배포·복구

| 항목 | 상태 |
|---|---|
| **CI/CD** | ❌ 없음 — Cloudflare Pages 자동배포만. **테스트 게이트 없이 main 푸시 = 즉시 배포** |
| 배포 전 자동 검사(0장 5종) 강제 | ❌ 수동 |
| **DB 마이그레이션 351개** — 적용 상태 대조 | ❌ |
| 롤백 절차(웹·OTA·앱스토어) | ❌ |
| **DB 백업·복구 리허설** | ❌ |
| 엣지 함수 배포 이력·롤백 | ❌ |
| 장애 감지(무엇이 알려주나) | 🔶 bug-alert 있으나 **RESEND 키 없어 메일 안 감**(10-F) |
| 상태 페이지·다운타임 공지 | ❌ |

## 18. 호환성 매트릭스

| 항목 | 상태 |
|---|---|
| Safari(iOS·macOS) | ❌ |
| Chrome / Edge / Firefox | 🔶 Chrome 만 |
| 삼성 인터넷 | ❌ |
| iOS 버전 하한(구형 기기) | ❌ |
| 안드로이드 버전 하한 · 저사양 | ❌ |
| 태블릿·폴더블 | ❌ |
| 느린 3G · 오프라인 전환 | ❌ |


## 19. 개인정보 국외이전 — AI 사업자 누락 (⚠️ 6차 발견, 법적 리스크)

개인정보처리방침 §6(위탁·국외이전)에 **Supabase·Cloudflare 만** 적혀 있다.
그런데 갈비스는 대화를 아래 4곳으로 보낸다:

```
api.deepseek.com                       (중국)
api.openai.com                         (미국)
generativelanguage.googleapis.com      (미국)
api.anthropic.com                      (미국)
```

보내는 내용에 **닉네임·광장 글 본문·유저 검색 결과**가 섞인다(galla-friend 도구 호출 496·612행).
`friend_memory`·`profile_summary`·`chat_log` 도 대화 맥락으로 들어간다.

| 항목 | 상태 |
|---|---|
| **AI 사업자 4곳 위탁·국외이전 고지** | ✅ 방침 §6 전면 개정 — 수탁자 7곳(DeepSeek·OpenAI·Google·Anthropic·Resend 추가), §6-1 AI 전용 조항 신설 |
| 이전 국가·시점·방법·항목 명시 | ❌ |
| 대화 내용의 보유기간·파기 | ❌ |
| AI 학습 이용 여부 고지(sft_samples 로 축적 중) | ❌ |
| **AI 생성 콘텐츠 표시**(갈라뉴스·예측·광장 자동생성) | ❌ |
| 만 14세 미만 확인 | 🔶 방침엔 있음 — 실제 동작 미확인 |

⚠️ 결제보다 먼저다. **대화가 이미 나가고 있다.**

## 20. 보안

| 항목 | 확인 | 상태 |
|---|---|---|
| service_role 키 클라이언트 노출 | 없음 | ✅ |
| anon 키 노출 | 정상(공개 전제) | ✅ |
| **CSP** | `default-src 'self'` 로 잠겨 있음. 다만 `script-src 'unsafe-inline'` 허용 · Cloudflare Insights 는 차단됨(통계 유실) | 🔶 |
| XSS — 유저 입력 렌더 | `esc()` 사용처 많으나 전수 미확인 | ❌ |
| RPC 631개 권한 가드 | SECURITY DEFINER 에서 `current_user` 쓰면 구멍 | ❌ |
| RLS 회귀(남의 글 수정·삭제) | ❌ |
| PII 컬럼권한(users·user_profiles) | 잠금 이력 있음 — 회귀 미확인 | 🔶 |
| 의존성 취약점(`npm audit`) | ❌ |
| 오픈 리다이렉트 · 클릭재킹 | frame-ancestors 'self' 는 설정됨 | 🔶 |
| 파일 업로드 검증(용량·타입·악성) | ❌ |
| 딥링크 파라미터 검증 | ❌ |

## 21. 데이터 정합성·비용

| 항목 | 상태 |
|---|---|
| 카운터 드리프트(like_count·comment_count vs 실제) | ❌ |
| 고아 레코드(삭제된 부모의 자식) | ❌ |
| R2 고아 파일 vs DB 참조 | 🔶 purge_orphan_media 크론은 있음 |
| **AI 예산 소진·상한 동작**(ai_budget_usage·model_for 다운그레이드) | ❌ |
| Supabase·Cloudflare 한도(요청·저장·대역폭) | ❌ |
| 월 원가 추이 대비 요금제 마진 | 🔶 ai_spend 수정 직후라 데이터 축적 필요 |


---

## 정기 실행 방법

**배포 전(매번)**: 0장 기계 검사 5개 → 전부 0건이어야 통과.
**주 1회**: 1~8장 중 `❌`·`🔶` 우선. 실제 쓰기는 테스트 계정(appreview@galla.im)으로.
**릴리스 전**: 9~11장 포함 전체. 실기기 필수 항목(핫튜브 재생·푸시·권한)은 사장님 확인.

### 테스트 데이터 규칙
- 쓰기 검증은 **DB 행까지** 확인한다. 화면 토스트만 보고 통과시키지 않는다.
- 끝나면 **세고 지운다**. 지우기 전 카운트 → 삭제 → 잔여 0 확인.
- 삭제는 반드시 **ID 명시**. `delete from X` (WHERE 없음)는 사고다.
- 투표처럼 되돌릴 수 없는 것은 미리 사장님께 알린다.
