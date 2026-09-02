# 갈라 전수 QA 체크리스트

배포 전·정기 점검용. **기억에 의존하면 반드시 빠진다** — 이 목록은 코드베이스에서 기계적으로 뽑은
표면(페이지 68 · 엣지함수 47 · JS 154 · 데이터 테이블)을 기준으로 만들었다.

상태 표기: `✅` 확인함(DB까지) · `🔶` 부분 · `❌` 미확인 · `⛔` 막힘(사유 명시)

⚠️ **표가 진실이다.** 이 문서는 위쪽 요약 표와 아래쪽 상세 섹션(§20~) 두 층으로 자라서,
**상세 섹션에서 이미 확인한 항목이 표에는 ❌ 로 남아 있는 일**이 반복됐다
(2026-09-01 실측: 크론 9행·엣지함수 헬스·백업복구·접근성·GA·시맨틱 라우터 등 **12행**이 그 상태였다).
그래서 "얼마나 남았나"가 세션마다 달라진다.
→ **확인했으면 그 자리에서 표를 고친다.** 상세 섹션은 근거만 남긴다.
→ 진도는 `python3 scripts/qa-progress.py` 로만 센다(사람이 손으로 세지 않는다).
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
| 제보 — 미디어 첨부 | ✅ | ❌ | ❌ |  <!-- 0902 롤백 시뮬: submit_tip(제목,본문,카테고리,media[],links[]) → ok·reward 100GP·tips.media 에 {url,kind:image} 저장·status pending. 실제 R2 업로드는 미실행 -->
| 임시저장·복원 | 🔶 광장만 | ✅ | ❌ |
| 수정·삭제(owner-actions) | ✅ | ❌ | ❌ |  <!-- 0901 롤백 시뮬: 본인 글 작성→수정→delete_plaza_post 삭제까지 정상. 남의 것은 delete_issue·delete_plaza_post 가 not_authorized 예외 -->

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
| DM 수신·읽음 | ✅ | ❌ | ❌ |  <!-- 2계정 롤백 시뮬: 발신 → 수신자 조회 1행 → read_at 갱신 1행 → 제3자 조회 0행. 수신자에게 보이는 건 자기 스레드 2개·메시지 20행뿐(전체 729행 중) -->
| DM 이미지·GIF·스티커 | 🔶 | ❌ | ❌ |  <!-- 운영 데이터에 kind=image 3·gif 6 존재(경로 동작). sticker 는 0건 — 미검증 -->
| DM 폴더·즐겨찾기·숨김 | ✅ | ❌ | ❌ |  <!-- dm_folders·dm_favs·dm_hidden 생성 성공 + 남의 계정에서 조회 시 0행(격리) -->
| E2E 암호화 | 🔶 | ❌ | ❌ |  <!-- 구조 확인: user_e2e_keys 는 공개키만(10명), 개인키는 localStorage. 다만 운영에 kind='e2e' 메시지 0건 — 실제 암복호 왕복 미검증 -->
| **친구 추가·목록** | ✅ | ❌ | ❌ |
| **난장(오픈챗) 개설** | ✅ | ❌ | ❌ |
| **난장 입장·대화** | ✅ | ❌ | ❌ |
| 난장 나가기·방장 권한 | ✅ | ❌ | ❌ |  <!-- 0902: 본인 멤버 행 삭제로 퇴장 동작(잔여 0). 방장 강퇴·밴은 §26-16 에서 확인 -->
| 난장 방장 권한(강퇴·밴) | ✅ | ❌ | ❌ |  <!-- 롤백 시뮬: 비방장 밴 시도 → RLS 차단 / 방장 밴 → ban 1행·밴된 유저 멤버에서 자동 제거(_openroom_ban_kick 트리거) -->
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
| 위기 감지 → 상담카드 | ✅ | ❌ | ❌ |  <!-- 0902 실호출: '죽고 싶다는 생각' → term='죽고싶'·severity 2 기록 + 상담카드(109·1577-0199) 동봉. 관리자 실시간 알림이 없어 트리거 신설(§26-20) -->
| 컨시어지(택시·배달 딥링크) | 🔶 | ❌ | ❌ |  <!-- 0902 배선 확인(AI 호출 0): open_external 도구 정의 + 가짜클레임 금지 문구, 프론트 매핑 kakaot://·baemin://·카카오맵, 미설치 시 https 폴백, iOS LSApplicationQueriesSchemes 4종 등록. 실제 앱 실행은 실기기 필요 -->
| 창작 대행(썸네일·영상) | ⛔ 잠김 | ⛔ | ⛔ |
| **원가 기록(ai_spend)** | ✅ 2026-08-29 수정 | — | — |
| 턴 한도·게이트(무료 5턴) | ❌ | ❌ | ✅ |  <!-- 6번째 차단+리셋시각 안내. 게스트 2턴도 확인. pill 미갱신 결함은 0830007에서 수정 -->

---

## 6. 트렌드

| 항목 | 웹 | iOS | AOS |
|---|---|---|---|
| **통합검색 실행(이슈·예측·뉴스·유튜브·광장)** | ✅ | ❌ | ❌ |  <!-- 0901 웹 로그인 실측: '이재명' → 해시태그 9 · 갈라이슈 1 · 뉴스 10 렌더 -->
| 해시태그 검색 | ✅ | ❌ | ❌ |  <!-- #이재명 이슈 9건. 최근순·인기순 두 정렬 경로 모두 응답. 광장·예측은 태그 데이터 자체가 3건·1건뿐(빈 결과는 정상) -->
| 유저 검색 | ✅ | ✅ | ❌ |
| 핫트렌드 실시간 검색어 | 🔶 렌더만 | ❌ | 🔶 |
| 갈라뉴스 열람 | ✅ | ❌ | ❌ |  <!-- galla_news_home 6섹션 · galla_news_category('정치') 정상. ⚠️ 카테고리 키는 한글이다('politics' 아님) -->
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
| 예측 정산·연승콤보 | ✅ | ❌ | ❌ |  <!-- 0901 롤백 시뮬: 마감된 마켓에 1,000GP 베팅 → predict_resolve → won=true·payout 1,230(레이크 반영)·잔액 +1,230·연승 0→1. 마감 전 마켓은 정산 거부(가드 동작) -->
| **데일리 미션 수령** | ✅ | ❌ | ❌ |  <!-- 롤백 시뮬: 미달 claim → incomplete 거부 / 5회 채우고 claim → +200GP / 재수령 → already 거부·잔액 불변·mission_claims 1행 -->
| **출석·연속 보너스** | ✅ | ❌ | ❌ |  <!-- 롤백 시뮬: claim_daily +100GP·streak 1, 재호출 already 거부. claim_daily_chest +62GP -->
| **갈라 뽑기(가챠)** | ✅ | ❌ | ❌ |  <!-- 롤백 시뮬: 2회 뽑기 — GP 차감·rare 당첨(+1,000GP) 지급·일일 한도 카운트(used 2/limit 30) 동작 -->
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
| 프로필 사진 업로드 | ✅ | ❌ | ❌ |  <!-- 0902 실업로드: profiles 버킷 PNG 업로드 → 공개 URL 200(image/png) → users.avatar_url 설정·원복. 테스트 파일 삭제까지 확인(정책 신설 후) -->
| 닉네임 중복·형식 검사 | ✅ | ❌ | ❌ |  <!-- nickname_available: 남의 닉 taken · 뒤 공백 붙여도 taken(정규화 동작) · 공백/특수문자 charset · 1글자 length · 내 닉은 ok -->
| 알림 설정 8종 토글 | ✅ | ❌ | ❌ |
| 방해금지 시간 | ✅ | ❌ | ❌ |  <!-- notify_prefs(dnd_on/from/to/tz_off) 읽기·쓰기·원복 왕복 확인(웹 로그인) -->
| 보관(저장한 것) 목록 | ✅ | ❌ | ❌ |  <!-- 북마크 왕복 실측: insert → 보관에 제목까지 렌더 → delete → 빈 상태. bookmarks 컬럼은 issue_id(target_type 아님) -->
| 내 등급·시즌 랭킹 | 🔶 | ❌ | ❌ |  <!-- 등급 화면 렌더·GI 진행도 정상. 시즌은 §26-6 결함(만료된 시즌이 계속 '진행중') -->
| 꾸미기(닉네임·프레임) | 🔶 | ❌ | ❌ |  <!-- user_cosmetics 행은 있으나 전부 null·user_frames 0개(심사계정이 아이템 미보유). 착용 동작은 미검증 -->
| 내 글 통계 | 🔶 | ❌ | ❌ |  <!-- 0902: 전용 통계 화면은 없다. 프로필 상단 4지표(My Drop·팔로워·지지·반발)와 콘텐츠 탭(모아/갈라/예측/광장)이 전부. 조회수·글별 성과는 화면 없음 -->
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
| 엣지 함수 47종 헬스 | ✅ §10-C 로 전수 반영(72개 ACTIVE) |
| AI 원가 장부(ai_spend) 누락 함수 | 🔶 galla-friend 수정 완료, 나머지 재확인 필요 |
| 클라 에러 수집(client_errors) | ✅ 24시간 28건 수집·마지막 03:15. 14일 보존 정책 위반 0건 (2026-09-01 실측) |
| 버그헌터 자동 스캔 | ✅ 30분 크론 정상(24h 6건 갱신·마지막 03:30). **미해결 216건이 쌓여 있었다** — §26 |
| 레드팀 배터리 | 🔶 galvis-redteam 주간 크론 27회 기록(마지막 08-30 19:00). redteam_bank 는 08-09 이후 멈춤 |
| 관제센터(admin) | ❌ |
| RLS·컬럼권한 회귀 | ❌ |
| 백업·복구 | 🔶 복원 리허설은 완료(§17). **PITR 은 여전히 꺼져 있어 24시간 유실 구간** — 사장님 몫 |

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
| **일기토(1:1 논쟁) 신청·수락** | ✅ | ❌ | ❌ |  <!-- 서버 경로 롤백 시뮬: 티켓 없으면 no_ticket 거부·티켓 소모·판돈 500GP 잠금·상대 알림·수락 시 status live -->
| 일기토 진행·메시지(duel_messages) | ✅ | ❌ | ❌ |  <!-- 양쪽 duel_say → duel_messages 2행 -->
| 일기토 AI 판정(duel-ai-judge) | ❌ | ❌ | ❌ |
| 일기토 관전·투표 | ✅ | ❌ | ❌ |  <!-- 제3자 duel_vote → vote_challenger 1. 시간 만료 후 duel_resolve 2단계(live→voting→finished)·승자 GP ±500 -->
| **나만의 이모티콘(AI 생성·GP 차감·환불)** | 🔶 | ❌ | ❌ |  <!-- 0902: 과금은 GC 150 차감 확인. 환불이 GP 로 나가던 결함 발견·수정(§26-19). 실제 이미지 생성은 AI 비용이라 미실행 -->
| DM 스티커 사용 | ✅ | ❌ | ❌ |  <!-- 0902 롤백 시뮬: my_stickers 보유 → DM 전송 1건. ⚠️ kind 는 'sticker' 가 아니라 'gif'(CHECK 제약에 sticker 없음) — 내 이모티콘과 GIF 가 같은 kind 를 쓴다 -->
| **알림 목록·읽음 처리(notifications)** | ✅ | ❌ | ❌ |  <!-- 0902: 알림 3건 넣고 화면 확인 — 목록·필터탭 렌더, '모두 읽음' 누르니 DB read=true 3건, 개별 삭제도 동작. 테스트 알림 삭제 완료(잔여 0) -->
| 갈라 성향 테스트(/match) 공유 | 🔶 | ❌ | ❌ |  <!-- 0902: 12문항→결과→공유 URL(/share/match/<인코딩>) 생성까지 확인. 복사 실패 시 안내가 틀려 있던 것 수정(§26-21). 실제 카톡 미리보기(OG)는 미확인 -->

## 6-B. 공개·유입 (검색·공유·SEO)

| 항목 | 상태 |
|---|---|
| **공유 OG 카드**(`functions/share/` 엣지 렌더) — 카톡·X 미리보기 | ✅ |
| 기본 OG 이미지 폴백 | ✅ `/share/*` 는 없는 id 여도 기본 문구+og-default.png(200). ⚠️ **그런데 일반 페이지엔 OG 자체가 없었다**(quest·grade·wallet·match·plaza og:image 0개) → 미들웨어에 기본 카드 주입 추가(§26-24) |
| **robots.txt · sitemap.xml.js 동적 생성** | ✅ robots 200 · sitemap 2,885 URL(523KB) 정상 생성 |
| **IndexNow 색인 제출**(`functions/indexnow.js`) | ✅ 호스트 검증(URL 파서)·60초 스로틀 추가, 라이브 검증 (§22) |
| 엣지 메타 주입(`_middleware.js`) | ✅ `/issue?id=` 에 og:title·description·image 주입 확인 |
| imgproxy 외부 이미지 프록시 | 🔶 앱에서만 확인 |
| PWA 설치 유도·오프라인 페이지 | 🔶 `/offline` 200 · `sw.js` 200. 실제 오프라인 전환 동작은 미확인 |

## 10-B. 데이터 파이프라인·추천

| 항목 | 상태 |
|---|---|
| **추천 신호 층(feed_signals) 15분 집계** | ✅ 롤업 2일간 192회 전부 성공·집계본 최신. 원천이 87행인 건 런칭 전 트래픽 문제지 고장 아님 |
| 조회수 집계(content_daily_views) | ✅ 오늘치 이슈 1,447행·광장 312행. **스냅샷 총계와 실제 카운터가 상위 5건 전부 일치**(44/24/20/18/15) — 드리프트 0 |
| **릴스 실행 에이전트(agent_jobs · reel-agent)** | ✅ 중간상태 무한정체 발견(389시간) → 90분 회수기 신설. 과거 코드버그 2건은 이미 해소됨 |
| 미디어 R2 이관·고아 정리(purge-orphan-media·video-migrate-worker) | ✅ 이관 대기 0건·미해결 실패 0건(video_migrations). 크론 288회/일 중 실패 1회(0.35%) |
| 뉴스 썸네일 치유(heal-news-thumbs) | 🔶 24시간 수집 11,557건 중 썸네일 결손 951건(**8.2%**) — 원문에 사진이 없는 몫과 구분 못 해 '정상 범위'라고 단정은 못 한다 |
| 링크 미리보기·본문 추출(link-preview·article-reader) | ❌ |
| **갈비스 시맨틱 라우터(galvis_intents)** | ✅ 의도 57개·임베딩 적재됨(라우터 카탈로그 실재) |
| **학습데이터 축적(sft_samples·distill-failures)** | 🔶 크론(04:30 KST)은 도는데 **마지막 표본이 08-30 19:30 — 32시간째 0건**. 품질 필터에 다 걸린 건지 고장인지 미확인 |
| 창작 레퍼런스 DB(creator_patterns) | 🔶 48행 있으나 **08-14 이후 갱신 없음** — 수집이 멈춘 건지 의도인지 미확인 |
| GA 동기화(ga-sync) | ✅ ga_metrics(realtime·report28d) 13:50 UTC 갱신 — 10분 크론 정상. 2행짜리 upsert 구조가 맞다 |

## 10-C. 엣지 함수 47종 — 역할별 헬스 (전수)

⚠️ 여기 없는 함수가 생기면 이 표를 갱신한다. 함수 목록은 `ls supabase/functions/`.

| 묶음 | 함수 | 확인할 것 | 상태 |
|---|---|---|---|
| 수집(크론) | collect-raw-news · collect-rss-news · collect-community-hot · collect-external-trends · collect-youtube-hot | 스케줄 실행 · **Authorization 헤더**(없으면 401인데 이력엔 succeeded) · 수집량 | ✅ 72개 전수 ACTIVE. 무인증(verify_jwt=false) 44개 전부 자체인증 확인 — 401/403 아닌 7개도 개별 검증 |
| 생성(크론) | generate-galla-news · generate-community-plaza · generate-predict-markets · generate-ai-arguments | 산출물 품질 · 중복 · 원가 기록 | ✅ generate-galla-news·predict-markets·community-plaza 전부 최근 산출물 있음(ai_spend 기록 대조) |
| 정산(크론) | predict-auto-resolve · weather-sync · heal-news-thumbs · purge-orphan-media | 오판정 · 누락 | ✅ predict-auto-resolve 270회/주. duel-ai-judge 는 유저 인증은 없으나 ai_budget_take 로 상한 걸림 |
| 갈비스 | galla-friend · galla-friend-ping · galla-jarvis · galvis-craftbench · galvis-redteam · distill-failures | 응답 · 선톡 · 원가 · 레드팀 회귀 | 🔶 galla-friend만 |
| 창작 | generate-thumbnail · generate-video · generate-sticker · reel-agent | GP 선차감·환불·검열 | ✅ reel-agent 실패 46건 중 21건은 superseded(의도). 코드버그 2건은 이미 해소, 정체 7건은 회수기로 처리 |
| 미디어 | upload-media · stream-upload · stream-ingest · stream-to-r2 · video-migrate-worker · imgproxy | 업로드·변환·R2·프록시 | 🔶 이미지만 |
| 통화·라이브 | agora-token · rtc-sfu · turn-cred · call-push | 토큰 발급 · SFU 연결 | ⛔ 보류 기능 |
| 인증 | naver-auth · passkey · delete-account | 소셜복귀 · 패스키 · 탈퇴 | ⛔/✅ passkey 는 엣지함수가 아니라 Supabase Auth 내장 API 사용 — 번들에 registerPasskey·signInWithPasskey 실재 확인(리포의 passkey 함수는 죽은 코드) |
| 결제 | verify-iap · store-notify | 영수증 검증 · 구독 생명주기 | 🔶 시뮬만 |
| 알림 | send-push · bug-alert | APNs·FCM 발송 · 관리자 알림 | ❌ |
| 부가 | translate · gif-search · link-preview · article-reader · check-issue · galla-stt · ga-sync · yt | 각 기능 동작 | ✅ translate 는 uid 필수 + translate_gate 한도. send-push·plaza-vote 는 동작 시점 401. article-reader·naver-auth·yt 는 공개가 맞음 |


## 10-D. 크론 46개 — 스케줄 층 (⚠️ 3차 대조에서 발견)

페이지·엣지함수·테이블 어디에도 안 걸리는 층이다. **화면이 멀쩡해도 여기가 죽으면 앱이 서서히 빈다.**
확인: `select jobname, schedule, active from cron.job;` · 실패: `cron.job_run_details where status<>'succeeded'`

| 묶음 | 잡 | 확인할 것 | 상태 |
|---|---|---|---|
| 뉴스 수집 | collect_raw_news(5분) · collect_rss_news(10분) · categorize_raw_news(10분) · group_related_news(15분) · fetch_article_thumbnail · fetch_missing_thumbnails · heal_news_thumbs | 수집량 · 썸네일 결손 | ✅ 24h 11,557건 수집(1시간 568건)·썸네일 결손 951건=8.2%(원문에 사진이 없는 몫) |
| 뉴스 생성·정리 | generate_galla_news(30분) · purge_galla_news_daily · purge_old_news_daily | 품질 · 보존기간 | ✅ 6시간 60건 생성. 보존 정책(raw 30일·갈라뉴스 90일) 위반 raw 13건·갈라뉴스 0건 = 삭제 배치 꼬리 |
| 트렌드 | collect_external_trends(20분) · collect_youtube_hot(30분) · community_hot_collect/generate · hot_scores(10분) | 급상승 델타 · 중복 | ✅ portal_search_trends 03:20 갱신·youtube_hot 2시간 1,820건·community_hot 은 하루 2회(09/21 UTC) 정시. ⚠️ `external_trends`(0행)·`raw_trends`(1월 5행)는 **죽은 표** — 수집기는 portal_search_trends 에 쓴다 |
| 예측 | predict_markets_generate · predict_issue_market · predict_auto_resolve(매시) · predict_season_rollover · season_rollover | 자동생성 5개 · 오판정 | ✅ 24h 생성 6개·정산 10개. 마감지남 미정산 3개는 **48시간 유예(GRACE_MS) 안**이라 정상 — 유예 뒤 환불 처리된다(오탐 아님 확인) |
| 이슈 | settle-due-issues(매시) | 마감·정산 | ✅ 마감 지났는데 미정산인 이슈 0건 |
| 갈비스 | galvis_ping_daily · friend_memory_maintain · curate-sft-daily · distill-failures-daily · craft-exemplars · galvis-craftbench/redteam(주간) | 선톡·기억정리·학습데이터 | ❌ |
| 추천·통계 | feed_signals_rollup(15분) · snapshot_daily_views · gallian_cache_refresh · pattern_perf_score · ga_sync(10분) | 집계 정확성 | 🔶 조회수(오늘 170행)·gallian_cache(03:20) 정상. **feed_signals 는 평생 87행·25시간째 0건** — 계측이 광장·숏판 두 표면에만 붙어 있다(§26) |
| 미디어 | video_migrate(5분) · purge_orphan_media · media_ref_refresh | 이관·고아정리 | ✅ 이관 대기 0건(밀린 것 없음)·미해결 실패 0건 |
| 운영 | bug_hunt(30분) · client_errors_purge · ai_user_usage_purge · ai_window_sweep · dm-expire-sweep(5분) · secret-mailbox-sweep · weather_sync(10분) · indexnow_ping | 자동스캔·정리 | ✅ 51개 active·24h 실패 4건(각 288회 중 1회=0.35%). 날씨 1시간 244건·버그헌터 03:30 갱신 |

⚠️ **크론 인증 함정**: Authorization 헤더 없이 부르면 401 인데 `job_run_details` 에는 `succeeded` 로 남는다.
   "돌고 있다"가 아니라 **산출물이 늘었는지**로 확인해야 한다.
   현재(2026-08-29): 46개 전부 active · 최근 3일 실패 0건 — 다만 위 이유로 이것만으로는 부족하다.

## 10-E. RPC 631개 · 스토리지 · 실시간

| 항목 | 확인할 것 | 상태 |
|---|---|---|
| **RPC 631개** — SECURITY DEFINER 권한 가드 | `current_user` 로 권한 판정하면 구멍(소유자로 평가됨) | ✅ definer 496개 전수 — `current_user` 로 판정하는 함수 **0개**. 대신 가드 없이 익명이 부를 수 있던 쓰기 함수 15개를 찾아 회수(§26-1-B) |
| 핵심 RPC 회귀 | place_bet · battle_action · submit_bug · get_my_account · gp_wallet · predict_state · open_room_create · log_share · claim_tour_bonus | ❌ |
| **스토리지 버킷 3종** | issues · plaza-images · profiles — 공개범위·용량·고아 | ✅ 3개 모두 용량제한·MIME 화이트리스트 있음. **쓰기 정책 3개에 소유자 검사가 없어** 남의 파일 삭제·덮어쓰기가 가능했다 → 소유자 조건으로 교체 |
| R2 버킷(galla-media) | CORS · 공개 URL · 고아 파일 | ❌ |
| **실시간 구독** | follows(맞팔 즉시반영) · dm_messages · pager · 난장 | ✅ publication 17표. 잠긴 컬럼은 comments.user_id(처리됨)·users(구독 코드 없음)뿐. `old` 비PK 필드를 쓰는 핸들러가 없어 default 복제ID로 충분 |
| DB 트리거 | 알림 발생(notify 브릿지) · 카운터 갱신 | ❌ |
| RLS 정책 회귀 | 남의 글 수정·삭제 차단 · PII 컬럼권한 | ✅ 익명 쓰기 표 3개·익명 읽기 유저 표 4개를 찾아 전부 닫았고(§26), 남의 글 수정·삭제 회귀도 재실행 — 이슈·광장 직접 UPDATE/DELETE 0행, 삭제 RPC 는 not_authorized, comments·plaza_comments 는 authenticated 에 쓰기 권한 자체가 없다(42501). 본인 글은 정상 수정·삭제 |

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
| **접근성** — 대비·포커스 링·스크린리더·큰 글씨 | 🔶 §24 에 실측 있음 — 하단 탭 aria-label 5개·aria-current 추가 ✅, :focus-visible 전역 추가 ✅. **대비 5종 미달(최저 2.59)·터치타깃 25개 24px 미만·콘텐츠 썸네일 alt 4개**는 디자인 변경이라 사장님 판단 대기 |
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
| **고객지원·문의(support)** 문의 등록·답변 | ✅ `create_support_ticket(제목,본문)` → `{ok:true}`. 일반 유저가 `admin_tickets()` 호출하면 **forbidden**, 관리자만 목록 조회 (롤백 시뮬) |
| **리믹스 작성 흐름(write-remix → confirm.remix)** | 🔶 진입로 존재 확인 — `issue.js:1019` 가 write-remix 로 보내고, `confirm.js` 가 `confirm.remix.html`·초안 복귀(`?draft=`)를 다룬다. 실제 발행까지는 미실행 |
| **사회적 환원 내역(donation-usage)** 표시 | 🔶 **고아 페이지** — 어디서도 링크되지 않는다. 설정의 '사회적 환원' 섹션은 `donation.html` 을 가리키고 그 섹션 자체도 `hidden`(2단계 오픈). 중복/구버전 여부 판단 필요 |
| **GP 사용 이력(gp-history)** 정확성 | ✅ 심사계정 `point_ledger` 7행 합계 **100,700 = 잔액 100,700** (전 지갑 드리프트 0은 §26-18) |
| **관리자 로그인(admin-login)** 권한 게이트 | ✅ 로그인 후 `user_profiles.admin_flag` 검증, 없으면 '관리자 권한이 없는 계정입니다'. 서버쪽도 관리자 RPC 전부 `forbidden` 확인(§26-17) |
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
| **정지·제재 계정 상태** | 기계는 다 있었는데 **아무것도 안 막고 있었다**(PERMISSIVE 정책은 OR 로 묶인다 · RLS 는 SECURITY DEFINER 안에서 평가 안 됨) | ✅ RESTRICTIVE 정책 14개 + 쓰기 RPC 8개 가드. **0901 재점검에서 구멍 5개 더 발견**(투표·신고·예측댓글·뉴스댓글·팔로우) → 20개로 확대(§26-16) |
| 삭제(탈퇴) 계정의 잔존 콘텐츠 | 글·댓글이 어떻게 보이나 | 🔶 이슈·댓글·광장글·GP원장 고아 **0건**. 다만 **dm_messages 10건**은 삭제된 계정이 보낸 채로 남아 있다 — 상대방 대화 보존이 의도인지 사장님 판단 |
| 게스트(비로그인) 동선 | 읽기 가능 범위 · 쓰기 차단 | ✅ 2026-08-30 — 이슈 읽기 O, 댓글·투표·숏판·제보 쓰기 전부 RLS 42501 차단. 투표 시도 시 로그인 화면으로 이동. 갈비스 2턴 후 가입 유도 |
| 미인증 이메일 상태 | 어디까지 허용 | ✅ auth.users 34명 중 미인증 1명, 그 계정은 `last_sign_in_at` 이 null — **한 번도 로그인 못 했다**(인증 전 로그인 차단 동작) |
| 다계정·GP 파밍 | 초대 보상·제보 보상 악용 | 🔶 `apply_referral` 가드 확인 — **자기초대 차단·1회 제한·가입 7일 이내만·초대자 일일 상한**. 출석·미션도 하루 1회(`already`). 남은 리스크는 **사람이 계정을 여러 개 파서 서로 초대**하는 것(IP·기기 지문이 없어 못 막는다) |
| 도배 방지 | cooldown(날씨·이슈댓글) · daily_limit(썸네일·영상) 존재 — **댓글·DM·광장엔 없음** | 🔶 |
| 좀비 세션(삭제된 계정 토큰) | supabase.js 에 정리 로직 있음 | 🔶 |
| 신고 처리 SLA·검열 | 접수는 되는데 **처리 동선 미확인** | 🔶 처리 왕복은 확인(§26-17) — 신고 접수 → 관리자 알림 1건 → `admin_resolve_report(...,'delete')` → 대상 댓글 `deleted`. 비관리자는 `forbidden`. **다만 AI 사전 검열이 없다**(moderation_logs 0행·쓰는 코드 0곳·이슈 73건 전부 pending) |

## 17. 배포·복구

| 항목 | 상태 |
|---|---|
| **CI/CD** | ❌ 없음 — Cloudflare Pages 자동배포만. **테스트 게이트 없이 main 푸시 = 즉시 배포** |
| 배포 전 자동 검사(0장 5종) 강제 | ❌ 수동 |
| **DB 마이그레이션 351개** — 적용 상태 대조 | ✅ 기록 363 vs 파일 385로 어긋나 있었다 — 22개가 직접 SQL 로 적용돼 기록 누락. 객체 실재 확인 후 채워 385==385 |
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
| 딥링크 파라미터 검증 | `?next`·`?to`·`?ref`·`?url` 소비처 전수. `to`·`ref` 는 화이트리스트라 안전. **`news?url=` 이 href 3곳에 그대로 들어가 `javascript:` XSS 가능** → `safeUrl`(URL 파서, http/https만) 추가·링크 숨김. **2026-09-01 추가 발견: 딥링크의 `#access_token` 을 출처 검사 없이 먹어 세션 고정이 됐다 → 콜백 출처 검사 추가**(§26-14) | ✅ |

## 21. 데이터 정합성·비용

| 항목 | 상태 |
|---|---|
| 카운터 드리프트(like_count·comment_count vs 실제) | 44개 카운터 중 주요 12개 전수 대조. 이슈 pro/con/like 0건. **삭제 경로에 카운터 보정이 없어** 광장 1건·댓글 1건 드리프트 → DELETE 재계산 트리거 신설·보정 완료. **0902 재대조**: 이슈 pro/con/like·광장 추천/비추천·댓글 좋아요·난장 인원 전부 0건, `market_outcomes.bettor_count` 4행만 어긋나 재계산 보정(§26-18) | ✅ |
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


## 25. 앱 SPA 하단 여백 — #app 규칙 증발 (2026-09-01)

**결함**: 앱 로그인 화면에서 **'🔑 패스키로 로그인' 버튼이 하단 네비 알약에 반쯤 덮여 못 눌렀다.**
페이지 끝이라 더 스크롤되지도 않았다 = 앱에서 패스키 로그인 자체가 불가능.
재현: 시뮬레이터 → 하단 '마이' → 로그인 화면 → 끝까지 스크롤.

**진짜 원인은 로그인이 아니다.** 뷰 로더는 `#app` **안쪽만** 뷰 호스트로 옮긴다 →
SPA 문서엔 `#app` 요소가 0개(`document.querySelectorAll('#app').length === 0` 실측).
그런데 루트 CSS 14개 파일이 `#app` 에 하단 네비 여백을 걸어놨다
(index 72px · search 94px · plaza 140px · plaza_detail 124px · random 160px …).
그 여백이 앱에서 통째로 증발해 **마지막 요소가 알약(62+14px+세이프에어리어) 밑에 깔린다.**

실측(375×812 · 세이프에어리어 0 — 아이폰은 홈 인디케이터 34px만큼 더 나빠진다):

| 화면 | 고치기 전 네비 위 여유 | 고친 뒤 |
|---|---|---|
| 로그인(앱) — 패스키 버튼 | 절반 가림, 스크롤 끝 | ✅ 네비 숨김·전체 노출 |
| 개인정보 | −33px | ✅ |
| 약관 | −23px (마지막 문단) | ✅ +73px |
| 계정 편집 — '변경사항 저장' | −4px | ✅ |
| 설정·등급·퀘스트·지갑·충전내역·로그인기록·비번변경 | 여유 있음(원래 정상) | ✅ |

**고침**(커밋 `50a8c8952` 코드 + `71137c7e6` 스탬프):
1. `js/spa/view-loader.js` — 페이지 CSS 의 `#app` 규칙을 뷰 호스트로 복제(라우트 스코프).
   ⚠️ 통째로 복제하면 `#app{position:relative}` 가 셸의 `.view-host{position:absolute;inset:0;overflow:auto}` 를
   이겨 **호스트가 4,147px로 부풀고 스크롤이 죽는다**(1차 시도에서 실측). position/overflow/height 계열은 제외.
2. `js/spa/router.js` — login·signup·reset 을 네비 숨김 목록(FULL_EDITORS)에 추가.
   auth 화면은 원래 '셸 밖 풀스크린' 설계라 여백이 24px뿐이고, 여백을 더하면 로고가 잘린다(옛 92px 실패 이력).
3. `css/index.css` — `#app` 하단 여백 72px → `calc(96px + safe-area)`. 웹도 같이 고쳐진다.

**검증**: 시뮬레이터 재설치 후 로그인 끝까지 스크롤 — 패스키 버튼 전체 노출·네비 없음.
약관 뷰 −23px → +49px(복제만) → +73px(여백까지). 홈 피드·트렌드 탭 회귀 없음.

**남은 것**: 파라미터가 필요한 스택 뷰(이슈·광장 상세·시청·예측 상세)는 미측정.
`scripts/occlusion-audit.js` 는 MPA(iframe) 기준이라 **SPA 뷰의 이 결함을 구조적으로 못 잡는다** —
SPA 호스트를 훑는 감사기가 따로 필요하다.

**환경 함정**: `npm run sync` 의 기본 소스가 `~/Developer/GitHub/galla-frontend`(0830004, 8/30에 멈춤)다.
QA 클론은 `~/Developer/galla-frontend`. 그냥 sync 하면 **옛날 웹 코드가 앱에 실린다.**
반드시 `GALLA_WEB_SRC=/Users/franksangminlee/Developer/galla-frontend npm run sync`.


## 26. 백엔드 전수 점검 (2026-09-01, 크론·버그헌터·신호층)

### 26-1. 익명이 쓸 수 있던 표 3개 — **고침**

버그헌터가 critical 4건을 24시간 넘게 띄우고 있었는데(hits 29~42, 8/31부터) 아무도 안 보고 있었다.
넷 다 직접 확인했다 — **3건은 진짜, 1건은 오탐**이다.

| 대상 | 상태였던 것 | 실제 피해 | 조치 |
|---|---|---|---|
| `email_probe_rate` | RLS off + anon 에 SELECT/INSERT/UPDATE/**DELETE** | 8/31에 이메일 열거를 막으려 만든 IP·시간당 카운터다. **anon 이 지우면 제한이 초기화 = 방어 무력** | RLS on · 권한 회수 ✅ |
| `places_tried` | 〃 | 맛집 수집기 '이미 물어본 곳' 장부 — 통째로 채우면 수집이 조용히 멈춘다 | ✅ |
| `places_usage` | 〃 | 일일 사진 한도 장부 — '한도 소진'으로 조작 가능 | ✅ |
| `_sft_scrub(text)` | anon EXECUTE | **오탐** — `language sql immutable` 순수 정규식 치환이라 부작용·권한상승 없음 | 그래도 회수(경보 정리) |

검증: `email_available` RPC(가입 마법사 정상 경로)는 anon 키로 여전히 `{"ok": true}`,
같은 키로 표를 직접 읽으면 `42501 permission denied`. 마이그레이션 `20260901270000` · 기록까지 반영.

### 26-1-B. 익명이 부를 수 있던 파이프라인 RPC 15개 — **고침**

`SECURITY DEFINER` 496개를 훑었다. `current_user` 로 권한을 판정하는 함수는 **0개**(그 함정은 깨끗하다).
문제는 **가드가 아예 없는데 익명이 부를 수 있는 쓰기 함수 15개**였다.

| 함수 | 밖에서 가능했던 것 |
|---|---|
| `places_take(want, cap)` | 구글 Places 하루 한도(1,200)를 한 번에 태워 **그날 사진 수집을 정지** |
| `food_merge_place(keep, drop)` | 식당 레코드 병합·출처 행 삭제 = **원격 데이터 파괴** |
| `food_videos_mark_harvested(ids)` | 영상을 '수확 완료'로 찍어 **영원히 건너뛰게** 만듦 |
| `naver_take/refund` · `places_refund` · `food_assembly_*` · `food_place_info_set` · `food_link_videos_by_address` · `food_merge_channel` | 같은 계열 장부·병합 조작 |
| `reap_stalled_agent_jobs(90)` · `trg_recount_*` | 크론·트리거 정비 함수 직접 호출 |

전수 호출자 확인: 프론트 `js/` 에서 부르는 곳 **0곳** — 전부 엣지 함수(service_role)·크론이다.
`bump_view` 계열(조회수)과 `duel_resolve`(시간으로 잠긴 상태 전이)는 공개가 맞아 그대로 뒀다.

⚠️ **여기서 한 번 헛발질했다 — 기록해 둔다.**
`revoke ... from anon, authenticated` 를 걸고 끝낸 줄 알았는데, 함수 ACL 이 `=X/postgres`
(**PUBLIC 에 EXECUTE**)라 익명은 그 경로로 그대로 들어왔다. 회수 직후 anon 키로 `places_take` 를
불러보니 **여전히 `1` 을 돌려줬다**(그 호출로 그날 한도 1칸을 실제로 태웠다).
`from public` 으로 걷어야 닫힌다. 확인은 눈으로 ACL 읽지 말고
`has_function_privilege('anon', oid, 'EXECUTE')` 로 — 15개 전부 `false`, `service_role` 은 `true` 확인.
마이그레이션 `20260901280000`.

### 26-2. ⚠️ 뿌리 — **새로 만드는 표는 익명 쓰기가 열린 채 태어난다** (사장님 판단 필요)

위 3개는 실수가 아니라 기본값이다. 빈 표를 하나 만들어 권한을 찍어보고 되돌렸다:

```
current_user=postgres / 새 표의 anon·authenticated 권한 =
  anon:SELECT,INSERT,UPDATE,DELETE · authenticated:SELECT,INSERT,UPDATE,DELETE
```

즉 **SQL 에디터·Management API 로 만든 모든 표는 RLS 도 꺼진 채 익명 전권으로 시작한다.**
마이그레이션에서 `revoke` 를 빠뜨리면 그 순간 구멍이다(그리고 `revoke ... from public` 만으로는
anon·authenticated 가 안 걷힌다 — email_probe_rate 가 그 사례).

한 줄로 막을 수 있다:

```sql
alter default privileges in schema public revoke all on tables from anon, authenticated;
```

⚠️ **대신 앞으로 만드는 표는 필요한 읽기 권한을 명시적으로 줘야 한다.** 안 주면 42501 로
목록이 백지가 된다(전례 있음). 지금 다른 세션이 맛집 표를 계속 만들고 있어 **사장님 승인 뒤에** 건다.

### 26-3. 추천 신호 층이 두 표면에서만 쌓인다

`feed_signals` 는 **평생 87행**(광장 83 · 숏판/롱판 4), 마지막 25시간 전이다.
크론(`feed_signals_rollup` 15분)은 정상이지만 **집계할 원본이 안 들어온다.**

원인은 계측 위치다 — `GALLA_signal` 호출부가 `plaza.js` · `gallari.js` · `gallari-reels.js` **셋뿐**이다.
홈 피드 · 트렌드 · 예측 · 이슈 · 뉴스 · 핫튜브에는 한 줄도 없다. `js/signals.js` 자체도
`app.html` · `index.html` 두 곳만 싣는다. 랭커를 붙여도 **랭킹할 재료가 없다.**
(기능 추가라 이번 회차에서는 고치지 않고 남긴다.)

### 26-4. 오탐이라 접은 것 (기록해 둔다)

- **예측 마감지남 3건 미정산** — `predict-auto-resolve` 의 48시간 유예 안이었다(초과 시 환불 처리).
  걸린 3건 전부 베팅 0건이고 `place_bet` 이 `close_at` 을 막고 있어 잠긴 GP 도 없다.
- **`external_trends` 0행 · `raw_trends` 1월 이후 정지** — 죽은 표다.
  `collect-external-trends` 는 `portal_search_trends` 에 쓰고 그건 03:20에 갱신돼 있다.
- **raw 뉴스 26만 행이 7일 초과** — 보존 정책이 30일이라 정상. 30일 초과는 13행뿐.

### 26-5. 날씨 탭 유저 표 4개 — **고침**

RLS 가 꺼진 채 익명에게 **읽기**가 열려 있었다(8/31에 쓰기만 닫았다).

| 표 | 새던 것 |
|---|---|
| `weather_favs(user_id, region)` | **어떤 유저가 어느 동네를 담아뒀는지** |
| `weather_comments(user_id, region, body)` | 한마디 작성자 매핑 |
| `weather_reports(user_id, region, kind)` | 누가 어느 동네에서 제보했는지 |
| `travel_geo_budget(day, used, cap)` | 내부 예산 장부 |

행이 0·2·3행이라 유출 규모는 작았지만 런칭하면 그대로 커진다.
화면은 전부 RPC 경유(`weather_now`·`weather_room`·`weather_say`·`weather_fav`·`weather_report`·
`weather_my`·`weather_search` 일곱 개 전부 SECURITY DEFINER, owner=postgres=표 소유자)라
정책 없이 RLS 만 켜고 권한을 걷었다. 프론트에서 표를 직접 select 하는 코드는 0곳(js/ 전수).

검증: anon 키로 `weather_now` → `{"ok": true, ...}` 정상, `weather_room(seoul)` → 정상 응답,
같은 키로 `weather_comments` 직접 읽기 → `42501`. 마이그레이션 `20260901290000`.

### 26-6. 시즌이 끝나고도 몇 시간 더 '진행중'이다 — **크론 주기 고침**

`/grade` 화면이 **"갈라리안 · S2 (0일 남음)"** 으로 서 있었다. 확인해보니 S2 는
2026-09-01 00:00 UTC 에 이미 끝났는데(그 시각 기준 5시간 경과) S3 가 없다.

원인은 두 층이다.
1. `_current_season()` 은 `status='active'` 만 보고 `ends_at` 을 안 본다 → 만료돼도 계속 '현재 시즌'.
2. 마감 처리 크론(`season_rollover` · `predict_season_rollover_job`)이 **하루 한 번 15:05 UTC** 다.
   시즌 경계는 00:00 UTC 라 **매달 15시간 동안 "끝난 시즌"이 계속 열려 있다.**
   그 사이 쌓인 GI 가 이미 마감된 시즌 순위에 들어가고, 명예의 전당은 롤오버 시점의
   `gallian_cache` 로 뽑히니 **공지된 마감 뒤에 1등이 바뀔 수 있다.**

→ 두 잡 모두 **매시 :05** 로 바꿨다(`cron.alter_job`). 두 함수 다 자기 가드가 있어
   (`not_due` skip · 활성 시즌 없으면 개시) 자주 돌아도 안전하다. 이제 최대 지연 1시간.

⚠️ 남은 판단: 시즌 경계가 **UTC 자정**이다. 한국 서비스면 KST 자정(15:00 UTC)이 맞다.
   그건 제품 결정이라 사장님 몫으로 남긴다.

### 26-7. 시즌 롤오버 — 고친 크론이 실제로 도는 것까지 확인

매시로 바꾼 뒤 **05:05 UTC 실행에서 실제로 넘어갔다**: S2 `closed` · **S3 생성(09-01~10-01)** ·
명예의 전당 S2 1·2위 칭호 지급(GI>0 인 유저가 둘뿐이라 2명). 크론 이력 `succeeded`.

### 26-8. 경제 4종 — 롤백 시뮬로 전수 확인

운영 데이터를 건드리지 않으려고 전부 `begin; … rollback;` 안에서 돌렸다.
(`set local request.jwt.claims` 로 심사계정 신분을 만들어 RPC 를 사용자처럼 호출)

| 항목 | 확인한 것 |
|---|---|
| 데일리 미션 | 미달 claim → `incomplete` 거부 · 5회 채우고 claim → **+200 GP** · 재수령 → `already` 거부(잔액 불변) |
| 출석 | `claim_daily` +100 GP·streak 1 · 재호출 `already` · `claim_daily_chest` +62 GP |
| 가챠 | 2회 뽑기 — GP 차감·rare 당첨 +1,000 GP·**일일 한도 카운트(used 2/limit 30)** |
| 예측 정산·연승 | 마감된 마켓에 1,000 GP 베팅 → `predict_resolve` → **won=true·payout 1,230**(레이크 반영)·**연승 0→1**. 마감 전 마켓은 정산 거부 |

⚠️ 실데이터 기준 예측 베팅 12건은 전부 정산됐지만 **당첨 건이 하나도 없다**(payout 합 100 = 환불).
   당첨 경로가 운영에서 한 번도 안 돌아봤다는 뜻이라, 위 시뮬이 그 자리를 대신한다.

### 26-9. 일기토 전 과정 — 롤백 시뮬로 확인 (3계정)

심사계정(도전자) · 배틀상대(수신) · 시뮬테스터(관중) 셋을 `set local request.jwt.claims` 로
번갈아 신분 전환하며 한 트랜잭션 안에서 돌리고 되돌렸다.

| 단계 | 확인한 것 |
|---|---|
| 신청 | `duel_challenge` — **티켓 없으면 `no_ticket` 거부**(심사계정이 티켓 0개였다), 티켓 소모·판돈 500GP 잠금 |
| 알림 | 상대에게 알림 도착 |
| 수락 | `duel_respond(true)` → `status='live'`(instant 모드) |
| 변론 | 양쪽 `duel_say` → `duel_messages` 2행 |
| 관전 투표 | 제3자 `duel_vote('challenger')` → `vote_challenger=1` |
| 판정·정산 | 시간 만료 후 `duel_resolve` 2단계(live→voting→finished). **승자 결정(투표 1:0)·GP ±500 이동**(도전자 100,700→101,200 / 상대 100,047→99,547) |

**남은 것**: AI 판정(`duel-ai-judge` 엣지 함수 → `duel_apply_ai_verdict`)은 AI 호출·예산이 걸려 미실행.
표에는 **웹(서버 경로) 열에만** ✅ 를 넣었다 — 앱 UI 동선은 따로 봐야 한다.

⚠️ §20 의 "anon 실행가능 SECURITY DEFINER … 쓰기 6개는 전부 안전" 판정은 **그때는 맞았다.**
8/31~9/1 에 들어온 맛집·정부지출 파이프라인 RPC 가 그 뒤로 새로 열린 것이다(§26-1-B).
권한 감사는 한 번 하고 끝내는 게 아니라 **함수가 늘 때마다** 다시 돌려야 한다.

### 26-10. 일기토 신청 알림이 **두 번** 간다

한 번 신청하면 알림이 2행 생긴다 —
`notify_duel` 트리거(type `duel`, 주제 포함)와 `duel_challenge` 안의 `_duel_notify`(type `duel_challenge`, GP 포함).
둘 다 `GROUP_OF` 에서 `battle` 로 묶여 **목록에 두 줄, 안읽음 뱃지도 2로 센다**.

고치는 방향(제안): 트리거는 모든 insert 경로(재대결 등)를 덮으니 **트리거를 남기고 RPC 쪽을 빼되,
트리거 문구에 판돈을 넣는다.** 알림이 아예 안 가는 쪽이 더 나쁘니 경로를 지우기 전에
`duel_rematch` 등 다른 insert 경로부터 확인해야 한다.

### 26-11. 알림 목록·읽음 — 격리까지 확인

- 내 알림만 보인다: 남의 알림 1,311행 중 **보이는 건 0행** ✅
- 내 알림 읽음 처리 동작 ✅
- **남의 알림을 읽음 처리 시도 → 막힘**(대상 유저 읽음 458행 그대로) ✅
- ⚠️ 심사계정은 알림이 0건이라 화면 목록은 빈 상태만 봤다.

### 26-12. 갈라톡 — 2·3계정 롤백 시뮬

| 항목 | 확인한 것 |
|---|---|
| DM 수신·읽음 | 발신 → **수신자 1행 조회** → `read_at` 갱신 → **제3자 0행**. 수신자에게 보이는 범위는 자기 스레드 2개·메시지 20행(전체 729행 중) |
| 폴더·즐겨찾기·숨김 | 생성 성공 + 남의 계정에서 조회 0행 |
| 난장 밴 | **비방장 밴 시도 → RLS 차단** / 방장 밴 → 밴 기록 + **밴된 유저 멤버에서 자동 제거** |
| E2E | 서버엔 공개키만(`user_e2e_keys` 10명), 개인키는 localStorage — 구조는 맞다. 다만 **운영에 `kind='e2e'` 메시지가 0건**이라 실제 암복호 왕복은 못 봤다 |
| 이미지·GIF | 운영 데이터에 image 3·gif 6 — 경로는 돈다. **스티커는 0건** |

⚠️ **RLS 정책 설계는 제대로 돼 있다.** `dm_messages` 의 `banned_no_write` 가 **RESTRICTIVE**(AND)로 걸려 있어
과거의 "PERMISSIVE 가 OR 로 합쳐져 제재가 무력" 함정을 피했다.

⚠️ 시뮬 함정 하나(내가 두 번 헛짚었다): 같은 **한 문장** 안에서 `dm_thread_with()` 로 스레드를 만들고
그 스레드에 메시지를 넣으면 **RLS 의 EXISTS 가 문장 스냅샷을 보기 때문에 방금 만든 스레드를 못 본다**
→ `42501` 이 난다. 제품 결함이 아니라 시뮬 작성 방식 문제다. **문장을 나눠서** 만들고 넣어야 한다.

### 26-13. 남의 글 수정·삭제 — 재회귀 (2026-09-01)

§20 에 이미 ✅ 로 있던 항목이지만, 오늘 표 3개·RPC 15개를 열어놓은 걸 찾은 뒤라 다시 돌렸다.

| 시도 | 결과 |
|---|---|
| `delete_issue(남의 이슈)` | **not_authorized 예외** |
| `delete_plaza_post(남의 글)` | **not_authorized 예외** |
| `issues`·`plaza_posts` 직접 UPDATE/DELETE | **0행**(RLS) — 대상 그대로 살아있음 |
| `comments`·`plaza_comments` 직접 쓰기 | **42501** — authenticated 에 권한 자체가 없다(더 강함) |
| 본인 글 작성 → 수정 → 삭제 | 정상 |

⚠️ `posts`(숏판·롱판) 는 **행이 0개**라 이 검사가 헛돌았다. 검사가 통과한 게 아니라 **대상이 없었다.**
   덤으로 알게 된 것: 운영 DB 에 숏판·롱판 콘텐츠가 하나도 없다(8/30 에 업로드 확인했던 것들이 지워졌다).

### 26-14. 딥링크로 **남의 계정에 로그인시킬 수 있었다** — 고침

`?next`·`?url` 같은 **쿼리 파라미터**는 앞선 감사에서 다 훑었는데, **인증 토큰 딥링크**는 빠져 있었다.

`js/social-auth.js` 의 `appUrlOpen` 처리기는 **어디서 온 URL이든** `#access_token`·`refresh_token`
이 들어 있으면 그대로 `supabase.auth.setSession()` 에 넣었다. 즉 아무 앱·웹페이지가

```
im.galla.app://cb#access_token=<공격자토큰>&refresh_token=<공격자토큰>
```

를 열면 **피해자 앱이 조용히 공격자 계정으로 로그인**된다(세션 고정). 그 뒤 피해자가 쓰는 글·DM·
결제가 전부 공격자 계정에 쌓이고, 공격자는 나중에 그걸 그대로 열어본다.

시뮬레이터 실증(`xcrun simctl openurl`):

| 보낸 링크 | 고치기 전 | 고친 뒤 |
|---|---|---|
| `im.galla.app://cb#access_token=…`(공격 형태) | **"로그인 처리 실패 — Invalid JWT structure"** = 토큰을 실제로 먹었다(가짜라 거기서 멈춤) | **무반응**(무시) ✅ |
| `im.galla.app://auth-callback#access_token=…`(정상 콜백 형태) | 처리 | **처리 유지**(같은 알림) ✅ |

고침: 토큰·코드를 받아들이는 조건을 **우리 콜백에서 온 것**으로 좁혔다 —
`auth-callback` 이 들어 있거나 `https://galla.im/` 로 시작하는 URL만.
(PKCE `code` 경로는 로컬 code_verifier 로 검증되지만 **토큰 직행 경로는 검증이 없어** 출처로 막아야 한다.)

### 26-15. XSS·업로드 재검증 (이미 ✅ 이던 항목)

- **XSS**: 프로필 소개글·광장 글 제목/본문·광장 댓글에 `<img onerror>`·`<script>`·속성 깨기
  세 종류를 실제로 넣고 목록·상세에서 확인 — **전부 텍스트로 이스케이프**, 주입된 노드 0개,
  플래그 미실행. 테스트 글·댓글은 삭제 완료(잔존 0).
- **업로드**: `text/html`·`image/svg+xml` 업로드 → **415 invalid_mime_type**.
  익명 업로드는 세 버킷 모두 **403 RLS 거부**. 버킷 한도 issues 114MB·plaza-images 14MB·profiles 8MB.
- ⚠️ 부수 발견: **`plaza-images`·`profiles` 에는 DELETE 정책이 아예 없다**(소유자도 못 지움).
  보안 구멍은 아니지만 글을 지워도 파일이 남아 **고아 파일이 계속 쌓인다**(issues 버킷 197파일 1.16GB 와 같은 계열).

### 26-16. 정지(밴) 계정이 여전히 할 수 있던 것 — 고침

`banned_no_write`(RESTRICTIVE·insert·authenticated·`NOT _me_banned()`)가 **14개 표에만** 걸려 있었다.
정지 계정을 만들어 빠진 표를 직접 찔러봤다(전부 롤백).

| 표 | 정지 상태에서 | 조치 |
|---|---|---|
| `votes` | **이슈 찬반 투표가 그대로 됐다** — 정지돼도 판을 흔들 수 있었다 | 정책 추가 ✅ |
| `market_comments` | 예측 의견배틀 댓글 작성됨 | ✅ |
| `galla_news_comments` | 갈라뉴스 댓글 작성됨 | ✅ |
| `follows` | 팔로우됨(정지 중 스팸 팔로우) | ✅ |
| `content_reports` | **신고 도배 가능** | ✅ |
| `open_messages` | ⚠️ **오탐** — `open_rooms` 가 0행이라 검사가 헛돌았다. 방을 만들어 다시 하니 원래도 막혀 있었다 | 정책은 명시적으로 남김 |
| `bookmarks` | 저장됨 | **일부러 안 막았다** — 본인만 보는 목록이라 실익이 없다 |

막혀 있던 것(확인): 기존 14개 표(comments·plaza_posts·comment_likes·duel_votes 등)와
SECURITY DEFINER RPC 8개 — `weather_say` 는 `{"ok":false,"reason":"banned"}` 를 돌려준다.

검증: 정지 계정은 위 표 전부 `42501 banned_no_write`, **정지 아닌 계정은 그대로 통과**(팔로우 OK).
마이그레이션 `20260901300000`.

### 26-17. 신고 처리·계정 상태 (2026-09-02)

**신고 처리 왕복** — 롤백 시뮬로 끝까지 돌렸다.

| 단계 | 결과 |
|---|---|
| 일반 계정이 댓글 신고 | 접수됨 |
| 관리자 알림 | **1건 발송**(`_trg_report_notify_admin` 트리거) |
| 비관리자가 `admin_reports`·`admin_resolve_report` 호출 | **`forbidden`** |
| 관리자가 `admin_resolve_report(id,'delete')` | 대상 댓글 `status` `normal` → **`deleted`** |
| `delete_issue` 의 관리자 오버라이드 | `or public.is_admin()` 있음 — 남의 이슈도 지울 수 있다 |

**⚠️ 그런데 사전 검열이 없다.** `moderation_logs` 는 **0행**이고 이 표에 쓰는 코드가 리포에 **한 곳도 없다**.
`issues.moderation_status` 는 73건 **전부 `pending`** 이며, 목록은 `blocked` 만 숨긴다
(`gallari.js`·`gallari-post.js` 의 `neq('moderation_status','blocked')`).
즉 **올라오면 일단 보이고, 사람이 신고해야 내려간다.**
앱스토어 UGC 요건은 필터링·신고·차단·24시간 내 조치 넷인데 **필터링만 비어 있다.**
→ 정책·개발이 필요한 건이라 사장님 판단으로 남긴다.

**계정 상태**
- 탈퇴 잔존: 이슈·댓글·광장글·GP원장 고아 **0건**. `dm_messages` **10건**만 남아 있다(상대방 대화 보존이 의도인지 확인 필요).
- 미인증 이메일: 34명 중 1명, `last_sign_in_at` null — **인증 전에는 로그인 자체가 안 된다.**
- 파밍 방어: `apply_referral` 에 자기초대 차단·1회 제한·가입 7일 이내·초대자 일일 상한이 다 있다.

**GP 장부 정합성**(§21 겸사): 지갑 14개 전부 **원장 합계 = 잔액**(드리프트 0).
⚠️ 다만 `point_ledger.delta`·`point_balances.balance` 가 **double precision** 이다.
8/7 `reconcile:welcome` 보정 때 `43332.7384615385` 같은 값이 실제로 들어갔다(원장 8행).
지금 잔액은 전부 정수라 피해는 없지만, **돈 성격 값에 부동소수점은 언젠가 어긋난다** — 정수형 전환 권고.

### 26-18. 데이터 정합성 재대조 (2026-09-02)

| 카운터 | 어긋난 행 |
|---|---|
| `issues.pro_count`·`con_count`·`like_count` | **0** |
| `plaza_posts.up_count`·`down_count` | **0** |
| `plaza_comments.like_count` | **0** |
| `open_rooms.member_count` | **0** |
| `market_outcomes.bettor_count` | **4** → 재계산 보정 완료(잔여 0) |

⚠️ **내가 두 번 헛짚었다. 그대로 남긴다.**
1. 처음엔 `votes.vote_type` 으로 세어 이슈 카운터가 22·13행 어긋난 줄 알았다. 그런데
   `votes` 에는 `type` 과 `vote_type` 두 컬럼이 있고 **`vote_type` 은 48행 전부 null**(죽은 컬럼).
   `type` 으로 다시 세니 0건이었다. → **죽은 컬럼 `votes.vote_type` 정리 대상.**
2. 예측 마켓에 베팅 0건인데 `pool_gp` 가 700 이라 '유령 판돈'인 줄 알았다. 확인해보니
   `admin_create_market` 이 `p_liquidity`(기본 300)를 `pool_yes/no` 에 시드로 넣는 **의도된 설계**다.
   시드는 `bettor_count` 는 건드리지 않는다(0 으로 넣는다) — 그래서 4행의 bettor_count 만 진짜 드리프트였다.

⚠️ 남은 미세 불일치 1건: **market 340 의 `total_pool`(600) ≠ outcome `pool_gp` 합(620)**.
   이미 정산된 마켓이라 지금 영향은 없지만, 정산 경로가 outcome 만 갱신하고 total_pool 을
   안 맞추는 흔적일 수 있다 — 정산 코드 재확인 필요.

### 26-19. 스티커 실패 환불이 **다른 지갑으로** 나갔다 — 고침

`ai_sticker_charge(1)` 은 **GC 150** 을 깎는데(`gc_balances` 50,000 → 49,850),
`ai_sticker_refund(...)` 는 **GP 150** 을 넣어줬다(`point_balances` +150, GC 는 그대로).

GC 는 충전(현금성)이고 GP 는 활동 포인트다. **생성 실패는 우리 잘못인데 유저는 유료 재화를 잃고
무상 재화를 받는다** — 결제 분쟁·심사에서 걸릴 자리다.

같은 계열인 창작 대행은 이미 맞게 돼 있었다(`ai_creation_charge` GC 차감 → `ai_creation_refund` GC 환불 +
`gc_ledger`). `point_ledger` 에 옛 `ai_creation:refund` 3건(600GP)이 남아 있는 걸 보면
**창작 대행은 GP→GC 로 고쳤는데 스티커만 안 고쳤다.**

고친 뒤 실측: 차감 150 → GC 49,850 → 환불 → **GC 50,000 복구**, GP 변화 없음,
`gc_ledger` 에 `ai_sticker:refund` 기록. 마이그레이션 `20260902100000`.

⚠️ 실제 이미지 생성(gpt-image-1 호출)은 AI 비용이 나가 실행하지 않았다 — 과금·환불 경로만 검증했다.

### 26-20. 위기 안전망 — 살아 있다. 다만 **아무도 실시간으로 모른다**(고침)

실제로 한 번 불러봤다(심사계정, 실호출 1건):

> "요즘 너무 힘들어서 죽고 싶다는 생각이 들어"

| 층 | 결과 |
|---|---|
| 감지 | `term='죽고싶'` · `severity=2` |
| 응답 | 케어 톤(입 막는 첫마디 없음) + **상담카드** — 자살예방 **109**, 정신건강 위기상담 **1577-0199**(24시간·익명·무료) |
| 기록 | `crisis_events` 신규 1행(user_id·excerpt·handled=false) |
| 관제 | `admin.html` 위기 패널 + `admin_crisis_stats(30일)` · `admin_crisis_handle` 존재 |

감지기 자체도 촘촘하다 — 부정형 제외("죽고 싶지 않아"), **수단·다량 질문**("수면제 20알"), 영어·일본어·중국어
명시 표현까지 잡는다(관용구 `dying to see`·`笑死` 는 배제).

**⚠️ 빠진 것: 실시간 통보.** `crisis_events` 에 트리거가 하나도 없어 관리자가 관제 화면을 열어봐야만 안다.
544건이 전부 `handled=false` 인 것도 그래서다(대부분 8/9 이전 테스트분).
버그 신고는 이미 관리자 알림이 가는데(`_trg_bug_notify_admin`) **사람 목숨이 걸린 신호가 더 조용했다.**
→ 같은 패턴으로 `notify_crisis` 트리거 신설. 검증: 위기 행 1건 넣으니 관리자에게 알림 1건
(`admin.html?mod=crisis` 링크), 본문은 안 싣는다. 마이그레이션 `20260902110000`.

⚠️ 남은 것: 야간·오프라인 통보(푸시·메일). RESEND 키가 없어 메일은 막혀 있다 — 사장님 몫.

### 26-21. /match 공유 — 복사가 막히면 **틀린 안내**를 하고 있었다 (고침)

12문항 → 결과 판정 → 공유 URL 생성까지는 정상이다.
공유 링크는 `https://galla.im/share/match/<결과 인코딩>?utm_source=match(&ref=…)` 로,
**결과가 URL 안에 들어간다**(DB 저장 0 — 설계대로).

문제는 복사 실패 경로였다. `navigator.clipboard` 가 막히면
**"복사 실패 — 주소창을 복사해 주세요"** 라고 안내하는데, **주소창엔 그 링크가 없다**
(주소는 `/match` 그대로, 공유 URL 은 `/share/match/…`). 안내대로 하면 **결과가 빠진 맨 링크**가 나간다.
클립보드 차단은 드문 일이 아니다 — 권한 거부·비HTTPS·구형 웹뷰·제스처 밖 호출에서 흔하다.

→ 복사가 막히면 **링크를 화면에 꺼내 보여주고 자동 선택**한다(길게 눌러 복사). 토스트 문구도 그에 맞췄다.

⚠️ 남은 것: 공유 링크를 카톡·X 에 붙였을 때의 **OG 미리보기 실물 확인**(유형 16장 이미지)은 아직이다.

### 26-22. 프로필 사진·제보 첨부 (2026-09-02)

| 항목 | 결과 |
|---|---|
| 제보 미디어 첨부 | `submit_tip(…, media[], links[])` → `{ok:true, reward:100}` · `tips.media` 에 `{url,kind:image}` 저장 · GP +100 · status pending (롤백) |
| 프로필 사진 업로드 | `profiles` 버킷 업로드 성공 → 공개 URL **200 · image/png** → `users.avatar_url` 설정·원복 |
| 내 글 통계 | **전용 화면이 없다.** 프로필 상단 4지표(My Drop·팔로워·지지·반발)와 콘텐츠 탭이 전부 — 글별 조회수·성과 화면은 없음 |

**🔴 그 과정에서 나온 것: 본인 프로필 사진도 지울 수 없었다.**
`storage.objects` 의 DELETE 정책이 `issues` 버킷 하나뿐이라 `profiles`·`plaza-images` 는
**RLS 기본 거부 → 아무도 못 지운다.** 실측으로 `storage.remove()` 가 **삭제 0건**이었다.
프로필 사진은 자주 바뀌는 자산이라 **바꿀 때마다 옛 파일이 영구히 남는다.**

→ `issues` 와 같은 모양(소유자 한정)으로 `profiles_delete_own`·`plaza_images_delete_own` 신설.
검증: 내 파일 **삭제 1건 성공**, 남의 파일 2개 시도 → **둘 다 0건**(차단). 마이그레이션 `20260902120000`.

### 26-23. 스티커·난장 퇴장·컨시어지 (2026-09-02, AI 호출 0건)

| 항목 | 결과 |
|---|---|
| DM 스티커 사용 | `my_stickers` 보유 → DM 전송 1건 ✅ |
| 난장 나가기 | 본인 멤버 행 삭제로 퇴장(잔여 0) ✅ |
| 컨시어지 딥링크 | 도구·매핑·스킴 등록·웹 폴백까지 코드로 확인 🔶 (실행은 실기기) |

⚠️ **오탐 정정**: 스티커를 `kind='sticker'` 로 보내려다 CHECK 제약 위반이 났다. 확인해보니
`dm_messages_kind_check` 는 `text·image·gif·share·voice·e2e·call·video·file` 만 허용하고,
**실제 전송은 `kind='gif'`** 로 나간다(`dm.js:1189`, body `🎬 이모티콘`). 제약이 잘못된 게 아니라
**내 이모티콘과 GIF 가 같은 kind 를 공유**하는 설계다(구분은 body·meta).

컨시어지 배선(AI 호출 없이 코드로만):
- 도구 `open_external(service: taxi|navi|map|delivery, query, label)` + **가짜 클레임 금지 문구**
  ("내가 택시 불러줄게" ✕ → "카카오T 열어줄게, 거기서 호출 눌러" ○)
- 매핑: `kakaot://` · `baemin://` · 카카오맵(navi/map), **미설치면 https 폴백**
- iOS `LSApplicationQueriesSchemes` 에 kakaot·kakaomap·baemin·nmap 등록 — `canOpenUrl` 이 동작하려면 필수
- ⚠️ 시뮬레이터엔 그 앱들이 없어 `canOpenUrl` 이 false → **실기기에서만 최종 확인 가능**

### 26-24. 공개·유입 5건 (2026-09-02)

| 항목 | 결과 |
|---|---|
| robots.txt | 200 · `User-agent: *` Allow, **AI 크롤러 다수 Disallow**(Amazonbot·Bytespider·CCBot·ClaudeBot…) + Content-Signal 고지 |
| sitemap.xml | 200 · **URL 7,106개** · lastmod 실시간 |
| 엣지 메타 주입 | 이슈 상세를 크롤러 UA·일반 UA 둘 다로 받아 og:title/description/image 주입 확인. `/share/*` 도 정상 |
| IndexNow | 엔드포인트 200 (색인 반영 자체는 검색엔진 몫) |
| 오프라인 | `/offline` 200 · `sw.js` 200 (실제 오프라인 전환은 미확인) |

**🔴 기본 OG 폴백이 없었다 — 고침.**
고유 메타가 붙는 건 콘텐츠 상세(`/issue?id=`·`/share/*`)뿐이고, **일반 페이지엔 OG 가 아예 없었다**:
`quest`·`grade`·`wallet`·`match`·`plaza` 전부 `og:image` **0개**. 그 링크를 카톡·X 에 붙이면
미리보기가 통째로 비어 나온다 — **바이럴 미끼로 만든 `/match` 도 그랬다.**

→ 미들웨어의 '고유 SEO 없음' 경로에서 **기존 og:image 가 있으면 손대지 않고, 없을 때만** 기본 카드를 주입한다
(HTMLRewriter `head` 의 `onEndTag`). 기본 이미지는 이미 있던 `assets/og/og-default.png`(200 확인).

### 26-25. 페이지 고아 검사 + 미커버 5건 (2026-09-02)

**고아 검사** — 루트 HTML 68개를 전체 HTML·JS 에서 역참조로 훑었다(테스트·실험 페이지 제외).
**어디서도 안 걸리는 페이지 3개**:

| 페이지 | 상태 |
|---|---|
| `withdraw-done.html` | **진짜 미연결** — `withdraw.js` 는 출금 요청 후 `alert("출금 요청 완료!")` 만 띄우고 이 페이지로 보내지 않는다 |
| `revenue-settlement.html` | 참조 0. 설정 메뉴는 `settlement.html` 을 가리킨다 — 중복/구버전으로 보인다 |
| `donation-usage.html` | 참조 0. 설정 메뉴는 `donation.html` 을 가리킨다 — 위와 같은 계열 |

`company.html`(회사 소개, 별도 도메인 운영)·`offline.html`(`sw.js` 가 참조)은 **정상**이다.
⚠️ 셋 다 지갑/정산·환원 계열이고 그 섹션은 지금 `hidden`(2단계 오픈)이다. **삭제할지 연결할지는 사장님 판단.**

**미커버 5건**: 고객지원 문의 ✅ · GP 이력 정확성 ✅ · 관리자 로그인 게이트 ✅ ·
리믹스 흐름 🔶(진입로만) · 환원 내역 🔶(고아).
