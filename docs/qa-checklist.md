# 갈라 전수 QA 체크리스트

배포 전·정기 점검용. **기억에 의존하면 반드시 빠진다** — 이 목록은 코드베이스에서 기계적으로 뽑은
표면(페이지 68 · 엣지함수 47 · JS 154 · 데이터 테이블)을 기준으로 만들었다.

상태 표기: `✅` 확인함(DB까지) · `🔶` 부분 · `❌` 미확인 · `⛔` 막힘(사유 명시)
마지막 갱신: 2026-08-31 (10차 — 출시 차단 15/19 완료. 정지기능 실효화·계정삭제 감사·제보링크 XSS·AI 예산 상한 3개·GP 드리프트 자동검사)

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
| 계정 삭제(탈퇴) | 🔶 감사·시뮬 | 🔶 | 🔶 |  <!-- FK 없는 58개 컬럼 발견, anonymize_account 확장. 실제 앱 동선은 파괴적이라 미실행 — docs/account-deletion-audit-20260831.md -->
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
| 크론 인증(Authorization 헤더) | ✅ 5개는 x-cron-secret(Vault) 자체인증, indexnow 는 대상이 우리 워커 — 오탐이었다 (§22) 재점검 필요 — 없으면 401인데 이력엔 'succeeded' |
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
| 기본 OG 이미지 폴백 | ✅ 존재하지 않는 id → 기본 문구 + og-default.png(332KB, 200) 확인 |
| **robots.txt · sitemap.xml.js 동적 생성** | ✅ robots 200 · sitemap 2,885 URL(523KB) 정상 생성 |
| **IndexNow 색인 제출**(`functions/indexnow.js`) | ✅ 호스트 검증(URL 파서)·60초 스로틀 추가, 라이브 검증 (§22) |
| 엣지 메타 주입(`_middleware.js`) | ✅ `/issue?id=` 에 og:title·description·image 주입 확인 |
| imgproxy 외부 이미지 프록시 | 🔶 앱에서만 확인 |
| PWA 설치 유도·오프라인 페이지 | ❌ |

## 10-B. 데이터 파이프라인·추천

| 항목 | 상태 |
|---|---|
| **추천 신호 층(feed_signals) 15분 집계** | ✅ 롤업 2일간 192회 전부 성공·집계본 최신. 원천이 87행인 건 런칭 전 트래픽 문제지 고장 아님 |
| 조회수 집계(content_daily_views) | ❌ |
| **릴스 실행 에이전트(agent_jobs · reel-agent)** | ✅ 중간상태 무한정체 발견(389시간) → 90분 회수기 신설. 과거 코드버그 2건은 이미 해소됨 |
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
| **KMA_SERVICE_KEY** | 날씨가 기상청 실황이 아니라 **Open-Meteo 모델 예측 폴백**으로 돈다. '지금 우리 동네'의 근거가 달라진다 | ✅ 244개 지역 관측·온도 전부 수신, 7분 전 갱신 확인 필요 |
| FIREBASE_SERVICE_ACCOUNT | 안드로이드 푸시 전무 | ⛔ 알려진 미설정 |
| APPLE_* (5종) · GOOGLE_SA_* | IAP 영수증 검증 불가 | ⛔ 스토어 등록 전 |
| STORE_NOTIFY_KEY | 구독 생명주기 웹훅 인증 없음 | ❌ |
| RESEND_API_KEY · BUG_ALERT_EMAIL | **버그 제보가 와도 메일 알림이 안 간다** | ❌ |
| EMBED_API_KEY | OPENAI_API_KEY 로 폴백 — 임베딩 공간이 의도와 다를 수 있다(라우터 정확도) | ✅ galvis_intents 57건 전부 임베딩 보유 |
| ANTHROPIC_API_KEY | 클로드 경로 사용 불가(폴백은 있음) | 🔶 |
| STT_* · CF_STT_MODEL · CF_WORKERS_AI_TOKEN | 음성 인식 경로 | ❌ |
| FRIEND_* (7종) · JARVIS_* · *_MODEL | 전부 기본값 폴백 — 의도한 모델이 아닐 수 있다 | 🔶 |
| TRANSLATE_MODEL | 다국어 번역 | ❌ |
| 죽은 키: CF_IMAGES_TOKEN · GNEWS_API_KEY · NEWS_API_KEY · TENOR_API_KEY | 코드가 안 씀 — 정리 대상 | 🔶 |

### 외부 서비스 14곳 — 하나 죽으면 어디가 멈추나
| 서비스 | 쓰는 곳 | 죽으면 |
|---|---|---|
| DeepSeek | 갈비스·뉴스·예측 생성 | 대화·자동생성 전부 | ✅ galla_news 5분 전 생성. ai_spend 에 13개 함수·1,715회·$0.51/주 기록됨(원가 0인 행 0건) |
| Gemini / OpenAI / Anthropic | 폴백·임베딩·이미지 | 품질 저하·라우터 | ❌ |
| Cloudflare R2 | 모든 미디어 | 업로드·재생 | 🔶 |
| Cloudflare Pages Functions | OG카드·sitemap·imgproxy·IndexNow | 공유 미리보기·색인 | ❌ |
| Capgo(OTA) | 앱 웹자산 배포 | 앱이 옛 코드에 갇힘 | 🔶 |
| YouTube API | 핫튜브 수집 | 급상승 목록 | ✅ youtube_hot 5분 전 수집 |
| 기상청 / Open-Meteo | 날씨 | 폴백 중 | ✅ weather_obs 244지역 5분 전 갱신 |
| GIPHY | DM GIF | GIF 검색 | ❌ |
| Shotstack | 영상 생성 | 창작 대행 | ⛔ |
| Agora / CF Calls / TURN | 통화·라이브 | 음성 기능 | ⛔ |
| Resend | 메일 발송 | 알림 메일 | ❌ |
| GA | 통계 | 지표 | ❌ |
| Apple / Google 스토어 | IAP·구독 | 결제 | ⛔ |
| 뉴스 RSS(연합·조선·동아 등) | 뉴스 수집 | 기사 유입 | ✅ news_articles_raw 0분 전 수집 |


## 12. 품질 축 (기능 아님 — 놓치기 쉬움)

| 항목 | 상태 |
|---|---|
| **다국어(i18n · GALLA_t · locale 컬럼)** — 번역 누락·깨짐 | ❌ |
| translate 엣지 함수 | ❌ |
| **성능** — 콜드스타트·LCP·이미지 용량 | ✅ 홈 실측 144개 2.23MB(JS 1.66MB)·DOM 943ms·로드 1296ms. 로고가 표시 12배라 120KB→29KB. dm.js 는 이미 유휴 로딩 처리됨 |
| **접근성** — 대비·포커스 링·스크린리더·큰 글씨 | ❌ |
| **반응형** — 태블릿·좁은 PC창(481~1099px) | ✅ 481·768·900·1099·1280 전부 가로스크롤 없음. 1280 신규 로드 시 PC 좌측 레일(홈·예측·메시지·트렌드·마이) 정상 생성 |
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
| **정지·제재 계정 상태** | 기계는 다 있었는데 **아무것도 안 막고 있었다**(PERMISSIVE 정책은 OR 로 묶인다 · RLS 는 SECURITY DEFINER 안에서 평가 안 됨) | ✅ RESTRICTIVE 정책 14개 + 쓰기 RPC 7개 가드 · docs/ban-enforcement-20260831.md |
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
| **DB 백업·복구 리허설** | ✅ 복원 리허설 완료 — 생성컬럼·트리거 두 곳에서 막혔던 것까지 해소 |
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
| 이전 국가·시점·방법·항목 명시 | 이미 §6 카드에 전부 있었다(체크리스트가 낡음) | ✅ |
| 대화 내용의 보유기간·파기 | 문구 있음 + **실제 동작 검증**: 대화 원본 `friend_relationship.chat_log` 은 CASCADE 로 정상 파기 ✅. 그런데 학습 표본 복사본은 안 지워졌다(아래) | ✅ |
| AI 학습 이용 여부 고지(sft_samples 로 축적 중) | **방침과 코드가 어긋났다** — `curate_sft_samples` 가 `profile_summary`(평균 270자·최대 362자) 를 학습 표본 127건에 통째로 넣었고, `sft_samples` 엔 `user_id` 가 없어 탈퇴해도 못 지웠다. 제거·소급 정리·메일/전화 스크럽 추가 | ✅ |
| **AI 생성 콘텐츠 표시**(갈라뉴스·예측·광장 자동생성) | 갈라뉴스는 배지+고지문 있었음. **예측 문항엔 없었다** — 285개 중 245개가 LLM 작성. `markets.ai_generated` 추가·목록 🤖 AI 태그·상세 고지문, 라이브 검증(245/285) | ✅ |
| 만 14세 미만 확인 | 🔶 방침엔 있음 — 실제 동작 미확인 |

⚠️ 결제보다 먼저다. **대화가 이미 나가고 있다.**

## 20. 보안

| 항목 | 확인 | 상태 |
|---|---|---|
| service_role 키 클라이언트 노출 | 없음 | ✅ |
| anon 키 노출 | 정상(공개 전제) | ✅ |
| **CSP** | `default-src 'self'` 로 잠겨 있음. 다만 `script-src 'unsafe-inline'` 허용 · Cloudflare Insights 는 차단됨(통계 유실) | 🔶 |
| XSS — 유저 입력 렌더 | 실페이로드로 감사(댓글·광장마커·핫튜브·날씨·제보) | ✅ **제보 링크 `javascript:` → 관리자 세션 XSS 발견·수정**(서버 스킴검사 + admin safeUrl) |
| RPC 631개 권한 가드 | `current_user` 사용 **0건**. anon 실행가능 SECURITY DEFINER 340개 중 가드없음 88개를 전수 분류 — 쓰기 6개는 전부 안전(조회수 `+1` 하드코딩, 일기토는 시간게이트), 읽기는 `issue_demographics` k-익명성(30명·5명 컷) 확인 | ✅ **`email_available` 가입여부 열거 발견·IP 시간당 60회 제한** |
| RLS 회귀(남의 글 수정·삭제) | 타인 계정으로 이슈·댓글·광장·예측 수정/삭제 전부 0행, DM·알림·북마크·갈비스기억·GP장부 읽기 0행. 남의 행이 실제로 존재함을 확인해 검사가 헛돌지 않음을 검증(DM 729·알림 1,300) | ✅ |
| PII 컬럼권한(users·user_profiles) | 잠금 이력 있음 — 회귀 미확인 | 🔶 |
| 의존성 취약점(`npm audit`) | 웹은 `package.json` 없음(정적). 엣지 함수 56개가 `supabase-js@2` 범위지정 — eszip 로 배포시 고정되나 재배포 때 조용히 최신으로 갈아탄다. 2.112.4 로 고정 | ✅ |
| 오픈 리다이렉트 · 클릭재킹 | `frame-ancestors 'self'` 설정됨. **`login.html?next=` 가드가 정규식 블랙리스트라 5가지로 샜다** — `\\evil.com`·`/\\evil.com`(역슬래시→슬래시), ` javascript:`·`\tjavascript:`·`java\tscript:`(공백·탭을 파서가 지움). 브라우저 파서로 실측 확인 후 오리진 비교로 교체, 12케이스 검증 | ✅ |
| 파일 업로드 검증(용량·타입·악성) | ✅ upload-media 서버측 MIME 판정 + 종류별 MAX_BYTES |
| 딥링크 파라미터 검증 | `?next`·`?to`·`?ref`·`?url` 소비처 전수. `to`·`ref` 는 화이트리스트라 안전. **`news?url=` 이 href 3곳에 그대로 들어가 `javascript:` XSS 가능** → `safeUrl`(URL 파서, http/https만) 추가·링크 숨김 | ✅ |

## 21. 데이터 정합성·비용

| 항목 | 상태 |
|---|---|
| 카운터 드리프트(like_count·comment_count vs 실제) | 44개 카운터 중 주요 12개 전수 대조. 이슈 pro/con/like 0건. **삭제 경로에 카운터 보정이 없어** 광장 1건·댓글 1건 드리프트 → DELETE 재계산 트리거 신설·보정 완료 | ✅ |
| 고아 레코드(삭제된 부모의 자식) | FK 없는 참조 58개 분류(다형성·외부ID 제외). **`ai_news_jobs` 3행·`ai_trends` 3행이 이미 고아** — 정리 후 이슈 자식 7표에 FK(일기토만 SET NULL) | ✅ |
| R2 고아 파일 vs DB 참조 | 🔶 purge_orphan_media 크론은 있음 |
| **AI 예산 소진·상한 동작**(ai_budget_usage·model_for 다운그레이드) | ✅ ai_budget_take 검증(상한 도달→daily_cap · 0→disabled). **유저 트리거 3개에 상한이 없어 추가** |
| Supabase·Cloudflare 한도(요청·저장·대역폭) | 🔶 DB 919MB(1,130→919 정리) · Storage 1.16GB는 참조 0건이라 백업 후 삭제 대기(사장님) |
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

---

## 22. 크론·엣지 인증 (2026-08-31 점검)

| 항목 | 결과 |
|---|---|
| `verify_jwt=false` 34개 자체인증 | 33개 통과. `article-reader` 만 무방비 → SSRF 호스트 차단 추가 ✅ |
| 크론 `Authorization` 없는 6개 | 오탐. 5개는 `x-cron-secret`(Vault) 자체인증, `indexnow_ping` 은 대상이 우리 워커 ✅ |
| `galla.im/indexnow` 외부 노출 | 호스트 검사가 문자열 포함(`u.includes`)이라 `evil.com/?x=galla.im` 통과 → URL 파싱 + 콜로 캐시 60초 스로틀 ✅ |
| 크론 응답 타임아웃 | 24시간 25건이 `Timeout of 60000 ms`. 인증이 아니라 `collect-youtube-hot` 이 60초를 넘던 것 — 일은 되는데 성공·실패 구분이 불가능했다. 180초로 상향 후 200 확인 ✅ |
| `food_resolve_job` | 스케줄(`55 5,17`)은 있는데 실행 이력 0건 — 17:55 재확인 필요 🔶 |

### 이 점검에서 새로 드러난 것
- **광장 투표가 0행이다.** 글 946개에 `plaza_votes` 가 하나도 없다. 시드 글이라 그럴 수도 있으나 `vote_plaza_post` 동작 확인이 필요하다(로그인 필요) 🔶
- **`ai_trends` 는 죽은 표다.** 어디서도 참조하지 않고 3행 전부 고아였다. 드롭 여부는 사장님 판단 🔶
- **`posts`(숏판·롱판)가 0행이다.** 카운터 검사가 통과한 게 아니라 검사할 데이터가 없었다 🔶


## 23. AI 사업자 학습 이용 — 방침 대조 (2026-08-31)

방침 §6-1 의 단정 다섯 개를 실제 동작·사업자 정책과 대조했다.

| 단정 | 결과 |
|---|---|
| 대화 원본을 탈퇴 시 파기 | ✅ `friend_relationship` CASCADE 확인 |
| 갈라뉴스 AI 표시 | ✅ 리더에 '갈라뉴스 · AI 종합' 배지 + 고지문 |
| 예측 문항 AI 표시 | 신설(`ai_generated`) — 라이브 245/285 확인 ✅ |
| 자체 활용 시 식별정보 제거 | `profile_summary` 제거·소급 정리 ✅ |
| **외부 사업자 학습에 제공 안 함** | ❌ **DeepSeek 방침이 정반대를 명시** — 아래 |

**DeepSeek** 개인정보 처리방침(우리가 §6 에 링크한 바로 그 문서):
> 「개인정보보호법」 제15조 제3항에 따라 귀하의 개인정보를 **당사 기술 학습∙개선 목적으로 추가적으로 이용할 수 있습니다**

오픈 플랫폼 약관은 학습에 대해 침묵하고 API 예외 조항이 없다. 우리 코드에도 학습 거부
헤더·설정 흔적이 전수 grep 0건. → 방침을 사실대로 고쳤다.

🔶 **사장님 결정 대기**
1. DeepSeek 계정에 학습 거부 설정이 있으면 끄기 → 더 강한 문구로 복원 가능
2. 또는 갈비스를 학습 제외가 명시된 사업자(OpenAI·Anthropic API)로 이전
3. 또는 현 상태 유지(지금 문구가 사실에 맞음)


## 24. 크론 51개 전수 · 접근성 (2026-09-01)

**크론**: 51개 중 실행 이력 없음 2개(오늘 만든 food 잡 — 다음 스케줄 확인 필요),
비활성 1개, 7일 실패 6건. 실패는 비율로 봐야 한다:
- 5분 잡 4개 = 각 2,016회 중 1회(0.05%) — 같은 분에 몰린 일회성, 결함 아님
- `purge_old_news` 8회 중 1회 — 어제 수정 후 5초로 성공(전엔 20~31초)
- `media_ref_refresh` 7회 중 1회 — **함수 안에서 statement_timeout 을 올려도 무효**였다
  (문장 타이머는 시작 시 이미 걸림). 크론 command 앞으로 옮겨 해결

**산출물 신선도**: 뉴스·날씨·핫튜브·갈라뉴스 전부 5분 이내 ✅.
`feed_signals` 12시간은 트래픽 부족이지 고장 아님(롤업 192회 전부 성공).
`agent_jobs` 는 **중간 상태 무한 정체 발견** — 90분 회수기 신설.

**접근성**(홈 실측):
| 항목 | 결과 |
|---|---|
| 하단 탭 이름 | 다섯 중 넷이 스크린리더에 안 읽힘 → aria-label 5개·aria-current 추가 ✅ |
| 포커스 링 | outline:none 만 있고 대체 없음 → :focus-visible 전역 추가, Tab 키로 확인 ✅ |
| 본문 대비 | 5종 미달(최저 2.59 @9px, 푸터 3.0~4.2) 🔶 |
| 터치 타깃 | 68개 중 25개가 24px 미만(찬반 버튼 18x51 등, WCAG 2.2 AA) 🔶 |
| 이미지 alt | 내비 5개 해결. 콘텐츠 썸네일 4개는 남음 🔶 |
