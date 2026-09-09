# QA 세션 인계 프롬프트 (2026-09-09)

아래 블록을 새 창에 그대로 붙여넣으면 된다.

---

너는 GALLA 런칭 전 QA를 이어받는다. 기능 개발이 아니라 **깨진 것을 찾아 고치는 일**이다.
체크박스를 찍는 게 아니라 실제로 눌러보고, 뚫어보고, 숫자로 확인한다.

## 무엇을 하나

`docs/qa-ui-walkthrough.md` 가 이번 작업의 표다. 화면별 버튼·기능 점검표이고
상태 칸 489개 중 **456개가 아직 ⬜(안 해봄)** 이다. 이걸 눌러서 채운다.

- 문서 웹판: https://claude.ai/code/artifact/f8ec2e6b-2281-4449-9802-cef942aedd71
- 서버·DB 레벨에서 이미 검증된 것은 그 문서 §13 에 모아뒀다. **거기 있는 건 다시 하지 마라.**
- 별도로 `docs/qa-checklist.md` (336항목/확인 123)가 있다. 그건 서버·인프라 층이고,
  이번 문서는 그 위의 **버튼 층**이다. 둘을 섞지 마라.

### 순서 (리스크 순)
1. §1 인증 — 로그인/로그아웃/세션유지/게스트 유도
2. §12-2 돈·권한 — 차감·환불이 같은 지갑인지, 하루 상한, 남의 글 수정·삭제 차단
3. §9-3 갈비스 안전망 + 신고·차단
4. §2 인덱스 → §3 이슈 상세 → §5 예측 → §7 트렌드 → §8 설정 → §9 갈비스 나머지
5. 앱은 **전수로 돌지 마라.** 앱에서만 깨진 자리는 패턴이 있다 —
   SPA 어댑터 없는 페이지, `fixed`/`transform` 레이아웃, SPA 스크립트 화이트리스트,
   재방문 초기화, 네이티브 지도. 그 패턴에 걸리는 행만 본다(약 40행).

## 절대 규칙

1. **배포 확인은 쿼리 없는 경로나 HTML로.** 자산이 `immutable, max-age=31536000` 이라
   배포 전에 `?v=` URL을 찌르면 옛 파일이 1년짜리로 엣지에 박힌다. (사고 이력 있음)
2. **파괴적 SQL은 반드시 `begin; … rollback;`** 또는 DO 블록 끝에 `raise exception`.
   지우기 전엔 먼저 센다. (4,614행 삭제 사고 이력)
3. **마이그레이션 버전 중복 금지.** 직접 SQL로 적용했으면
   `supabase_migrations.schema_migrations` 에 기록도 넣는다.
4. **RLS PERMISSIVE는 OR로 합쳐진다** — 헐거운 것 하나가 전부를 무력화한다.
   막을 땐 `as restrictive`. 이 함정으로 결함 3건이 났다.
5. **비율로 판정한다.** 5분 크론 1회 실패 = 2,016회 중 1회 = 0.05% = 잡음.
6. **검사가 헛돌지 않는지 확인한다.** 0건이 나오면 "대상 자체가 없었나"를 먼저 본다.
   (open_rooms 0행이라 밴 우회가 '뚫린 것처럼' 보인 오탐 이력)
7. **딥시크 API를 아껴라.** AI 경로는 코드·DB 확인으로 검증하고,
   실호출은 경로당 1회로 끊는다. `contract_test` 는 LLM 0콜이다.
8. **진도는 표에서 직접 세라.** 고친 결함 수를 진도로 세지 마라(전에 47%로 과대보고한 적 있음).
9. **오탐이었으면 즉시 정정한다.** 문서에 글로 남긴다.
10. 결함은 **재현 순서와 실측 숫자**를 같이 적는다. "안 됨"만 쓰지 마라.

## 측정 함정 (여기서 여러 번 속았다)

- `curl -s` 에 `-L` 없이 `.html` 을 치면 308이라 본문이 빈다 → 전부 0으로 보인다.
  상태코드는 `curl -sL -o /dev/null -w '%{http_code}'` 로 잰다.
- `curl -I`(HEAD)는 404를 200으로 보여준 적이 있다. GET으로 확인해라.
- `el.click()` 은 히트테스트를 건너뛴다 — **버튼이 덮여 있어도 통과**로 나온다.
  가려짐은 `document.elementFromPoint()` 로 확인해라. (앱 패스키 버튼이 이렇게 통과했었다)
- 잠긴 컬럼 밑에서 PostgREST `(count)` 임베드는 테이블 권한을 요구해 페이지를 통째로 무너뜨린다.
- realtime 페이로드에는 잠긴 컬럼이 안 온다(`comments.user_id` 없음).
- 시뮬레이터 좌표 = 스크린샷 ÷ 2.286. 하단 탭은 y≈795.

## 환경

- 코드: `/Users/franksangminlee/Documents/GitHub/galla-frontend` (최신, HEAD `1c88c2f06`+)
  ⚠️ `~/Developer/galla-frontend` 는 **낡은 클론**이다. 쓰지 마라.
- cwd가 리셋되는 경우가 있다 — 긴 명령은 `cd /tmp &&` 로 시작해라.
- 로컬 미리보기: `npx http-server` **포트 8788** (`.claude/launch.json` 의 galla-static).
  8788이어야 미디어 업로드 CORS가 통과한다. Bash로 서버 띄우지 말고 Browser pane 도구를 써라.
- **브라우저 왕복이 시간의 대부분이다.** `browser_batch` 로 5~8동작씩 묶어라.
- 앱 번들: `~/Developer/GitHub/galla-app`. 동기화는 반드시
  `GALLA_WEB_SRC=/Users/franksangminlee/Documents/GitHub/galla-frontend npm run sync`
  (raw rsync 쓰면 home.html 이 사라져 홈 탭이 죽는다). OTA 없다 — 선 연결 빌드만.
- 배포 도장: 코드 고쳤으면 `?v=` 와 `galla-ver` 를 올리고 `python3 scripts/stale-stamps.py` 로 확인.

### Supabase SQL
프로젝트 `bidqauputnhkqepvdzrr`. psql 없음 — Management API 로 친다.

```sh
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -X POST "https://api.supabase.com/v1/projects/bidqauputnhkqepvdzrr/database/query" \
  -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
  --data-binary "$(python3 -c 'import json,sys;print(json.dumps({"query":sys.argv[1]}))' "$1")"
```

신분 흉내는 롤백 안에서:
```sql
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';
  -- 확인할 것
rollback;
```

## 지금 막혀 있는 것 (사장님 손이 필요하다)

1. **앱에 심사계정 로그인** — 이게 없으면 iOS·AOS 칸 대부분이 첫 행부터 막힌다
2. **Resend 메일 승인** — 가입 인증·비번 재설정·위기 야간통보
3. 실기기 — 카메라·마이크·위치·푸시·통화·핫튜브 재생·육성난장
4. 소셜 로그인 provider 키(구글·애플·네이버)
5. 법정 표기 6종 / UGC 사전 검열 정책

## 알려진 상태

- **롱판 콘텐츠가 0개다** (`posts` 30행 전부 `kind='vertical'`). 롱판 탭·선반이 빈 채로 열린다.
- 지갑·정산·사회적 환원 묶음은 `hidden` (2단계 오픈분) — 안 열리는 게 정상인지부터 확인.
- 1:1 통화(육성톡·면상톡)는 보류 중이다. ⛔ 로 둔다.

## 보고 방식

- 매 구간 끝에 **남은 게 뭐고 완료된 게 뭔지** 표에서 직접 세서 보고한다.
- 확인한 건 그 자리에서 `docs/qa-ui-walkthrough.md` 표를 고친다. 나중에 몰아서 하지 마라.
- 문서를 고쳤으면 아티팩트도 갱신한다(같은 URL로 재발행).
- 커밋은 항목별로 묶어서. 사장님이 속도에 민감하다.
- 동의·칭찬으로 답을 시작하지 마라. 반론·수치 먼저.

시작은 §1 인증부터.
