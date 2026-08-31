# 출시 차단 보안 4건 — 실측 감사 (2026-08-31)

QA 현황판 '먼저 봐야 할 것' 19건 중 보안 4건. 전부 **실제로 공격을 시도해서** 확인했고,
파괴적인 시도는 트랜잭션 롤백으로 막았다.

## 18. RLS 회귀 — ✅ 통과

`authenticated` 로 남의 콘텐츠 수정·삭제를 시도했다. 네 경우 모두 **0행**.

| 시도 | 결과 |
|---|---|
| 남의 댓글 UPDATE / DELETE | 0행 |
| 남의 광장글 UPDATE / DELETE | 0행 |
| `delete_plaza_post` (남의 글) | `not_authorized` |
| `delete_issue` (남의 이슈) | `not_authorized` |
| `delete_post` (남의 숏판, 실제 행 생성 후) | `not_authorized`, 글 그대로 남음 |

## 17. RPC 권한 가드 — ✅ 구멍 발견·수정

`SECURITY DEFINER` 433개 중 anon·authenticated 가 부를 수 있는 343개를 훑어,
**데이터를 바꾸는데 `auth.uid()`·관리자 검사가 전혀 없는 39개**를 뽑았다.

**실증한 구멍**: 익명으로 `increment_plaza_score(글, 999999)` 한 번 → 광장 글 점수 `0 → 999999`.
`apply_vote` 도 같은 구조. 둘 다 **코드에서 아무도 안 부른다** — 정식 경로는
`vote_plaza_post`(로그인 필수·값 ±1 검증·`plaza_votes` 원장 기록)이고, 옛 함수만 열린 채 남아 있었다.

**조치**: 39개 중 33개에서 `anon`·`authenticated` EXECUTE 회수.
회수 후 재시도 → `increment_plaza_score` / `season_rollover_job` / `dm_expire_sweep` 모두 `42501`.
정상 경로 `vote_plaza_post` 는 그대로 동작(점수 0→1 확인).

**의도적으로 남긴 6개**
- `bump_view` · `bump_post_view` · `bump_news_view` · `increment_plaza_view` — 비로그인 조회수 집계라 클라가 직접 부른다.
- `duel_resolve` · `duel_noshow_check` — 앱이 부르지만 **시간·상태 게이트**가 있다.
  `now() < live_ends_at` / `voting_ends_at` / `grace_until` 이면 거부하고, 승패는 `duel_votes`
  집계로만 정해진다. 호출자는 '이미 끝날 때가 된 것'을 진행시킬 수만 있고 결과에 개입할 수 없다.

## 16. XSS — ✅ 통과

- **닉네임**: `users` 트리거 `_check_nickname` 이 `^[가-힣a-zA-Z0-9_.\-]+$` 를 서버에서 강제.
  `<img src=x onerror=1>` 로 UPDATE 시도 → 거부. 클라 이스케이프와 무관하게 XSS 불가.
- **댓글 본문**: `XSSTEST<img src=x onerror="window.__XSS_FIRED=1">END` 를 심고 앱에서 열었다.
  → 텍스트 그대로 노출, `img` 미생성, 스크립트 미실행.
- **광장 본문(마커 렌더러)**: `[IMAGE]x" onerror="..."` · `<script>` · `[IMAGE]javascript:` 셋 다 심었다.
  → 셋 다 미실행, 이미지 태그 미생성, `<script>` 는 텍스트로 노출.

## 19. 파일 업로드 검증 — ✅ 구멍 발견·수정

**(a) Supabase Storage 버킷 3종에 서버 제한이 아예 없었다** (`file_size_limit`·`allowed_mime_types` 모두 `null`).
공개 버킷이라 누구든 `.html`·`.svg` 를 올려 우리 도메인을 스크립트·피싱 호스트로 쓸 수 있었다.
실사용(issues 최대 48MB / plaza 2.6MB / profiles 1MB) 기준으로 한도와 타입을 걸었다.
기존 파일 중 걸리는 것은 0바이트 폴더 플레이스홀더 2개뿐.
검증: 앱에서 `text/html`·`image/svg+xml` 업로드 → `mime type ... is not supported` 거부.

**(b) R2 경로(`upload-media`)가 클라이언트의 `contentType` 을 그대로 R2 PUT 헤더에 실었다.**
확장자 화이트리스트는 있었지만 **브라우저는 확장자가 아니라 Content-Type 을 따른다** —
`evil.png` 를 `text/html` 로 올리면 `cdn.galla.im` 이 HTML 을 서빙한다(저장형 XSS·피싱).
- 확장자 → MIME 표를 서버에 두고 클라 값은 버린다.
- `kind=file` 은 `content-disposition: attachment` 로 내려받게 한다.
- 종류별 용량 상한(이미지 20MB · 영상 200MB · 음성 20MB · 파일 30MB). 프록시 경로는
  예전에 `arrayBuffer()` 를 무제한으로 받았다.
- ⚠️ 서명 헤더와 클라가 보낼 헤더가 다르면 R2 가 서명 불일치로 거부한다 →
  서버가 정한 헤더를 그대로 응답에 실어 보내고, 클라는 그걸 그대로 쓴다(`putWithProgress`).

검증: iOS 실기에서 숏판 사진 업로드 → 성공, `curl -I` 로 `content-type: image/jpeg` 확인.

---

# 2차 감사 — 경제·죽은 엔드포인트 (같은 날)

## AI 예산 상한 — 유저 트리거 3개가 무방비

AI 호출 엣지 함수 18개를 `ai_budget_take` 유무로 훑어 8개 누락을 찾았고,
그중 **유저가 직접 트리거하는 3개**를 막았다.

- `galla-stt` — `ai_daily_caps` 에 **500 이 설정돼 있는데 코드가 한 번도 읽지 않았다.**
  설정만 있고 실제로는 무제한. 음성 메시지마다 도는 경로다.
- `generate-ai-arguments` · `check-issue` — 상한 항목 자체가 없었다(각각 300 · 500 추가).

⚠️ 예산 검사는 **인증 검사 뒤**에 둔다. 미인증 호출이 예산을 갉아먹으면 그게 곧 공격이다.
⚠️ 예산 조회 실패 시 통과시킨다 — 조회 장애로 기능을 멈추지 않는다.

`ai_budget_take` 자체는 행 잠금까지 있어 잘 만들어져 있었다(상한 2 → 3회째 `daily_cap`,
상한 0 → `disabled`. 롤백 검증).

## GP 파밍 — 경계는 이미 잡혀 있다

- 이메일 인증이 **실제로** 게이트다: 미인증 계정 1건은 세션 0 · 로그인이력 0.
- `claim_welcome_bonus` 는 원장으로 중복 지급을 막는다(계정당 1회, 500 GP).
- `apply_referral` 가드: 자기초대 · 중복 · 가입 7일 이내 · 초대자 하루 10건 상한.
- 같은 IP 22계정은 사장님·QA 개발 계정이다(파밍 아님).

남은 벡터는 "일회용 이메일로 계정을 계속 만드는 것"뿐이고, 하루 10건 상한에 묶인다.
GP 는 현금 가치가 없어(판매 금지) 영향은 랭킹·아이템에 한정된다.

## 죽은 인증 엔드포인트 — `passkey` 배포 삭제

`supabase/functions/passkey` 는 "Supabase 네이티브 미지원 → 커스텀"으로 만든 것인데,
클라이언트는 이미 Supabase 네이티브 `auth.registerPasskey()` 로 갈아탔다.
**코드·크론·DB 어디에서도 부르지 않는데 배포된 채 살아 있었다.**

위험한 이유: `login-finish` 액션이 **비로그인으로 호출 가능**하고, 성공하면 magiclink
`token_hash` 를 반환해 프론트가 세션을 만든다. 즉 **인증 없이 접근 가능한 세션 발급 경로**다.

검증 로직 자체는 `@simplewebauthn` 으로 challenge·origin·RPID·공개키 서명을 다 확인해
지금 당장 뚫리지는 않는다. 다만 **등록된 자격증명이 0개**라 이 경로로 로그인할 수 있는
사람이 아무도 없다 — 순수한 공격 표면이다. 의존성 CVE 하나로 인증 우회가 되는 자리다.

→ 배포 삭제(`supabase functions delete passkey`). 소스는 저장소에 남으니 필요하면 재배포한다.
   확인: 삭제 후 호출 시 도달 불가. 잔여 `webauthn_challenges` 11건도 정리.

`stream-ingest` 도 `stream-upload` 로 대체된 죽은 코드지만, 인증이 걸려 있고 세션을
만들지 않아 그대로 뒀다(기록만 남긴다).
