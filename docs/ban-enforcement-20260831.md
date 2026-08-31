# 정지·제재 실효화 (2026-08-31)

관제센터에는 정지 버튼·사유·기한 UI가 **이미 다 있었다**. `user_bans` 테이블도,
`_is_banned()` 도, `admin_set_ban`/`admin_unban` 도 있었다.
**그런데 뒤에서 아무것도 막지 않고 있었다.**

## 무엇이 잘못돼 있었나

### 1. 밴 정책이 PERMISSIVE 였다

`comments` · `issues` · `plaza_comments` 에 `*_not_banned` 정책이 있었지만 전부 **PERMISSIVE** 였다.
Postgres 는 같은 명령의 PERMISSIVE 정책들을 **OR** 로 묶는다.

```
comments_insert_self  (user_id = auth.uid())        ← 이것만 참이면
comments_not_banned   (NOT _is_banned(auth.uid()))  ← 이건 볼 필요도 없다
```

실측: 밴을 건 상태에서 이슈 댓글이 그대로 등록됐다.

### 2. 나머지 표면엔 검사 자체가 없었다

광장 글 · 숏판 · 롱판 · 핫튜브 댓글 · 제보 · DM · 베팅 · 일기토 — 전부 무방비.
실측: 밴 상태로 광장글·숏판·핫튜브댓글 전부 통과.

### 3. RPC 는 RLS 를 통과한다 ← 이게 제일 컸다

앱의 쓰기 경로 상당수가 `SECURITY DEFINER` RPC 다. **RLS 정책은 SECURITY DEFINER 함수
안에서 평가되지 않는다.** 테이블 정책을 아무리 잘 걸어도 RPC 경로는 못 막는다.
실측: 정책을 RESTRICTIVE 로 고친 뒤에도 `submit_tip` 이 밴 상태에서 `ok:true` 를 냈다.

## 어떻게 고쳤나 — 두 층

### ① 테이블 층 — RESTRICTIVE 정책 14개

RESTRICTIVE 는 **AND** 로 묶이므로 하나라도 거짓이면 거부된다.

```sql
create policy banned_no_write on <t> as restrictive
  for insert to authenticated with check (not public._me_banned());
```

적용: `comments` `issues` `plaza_posts` `plaza_comments` `posts` `post_comments`
`video_comments` `tips` `dm_messages` `comment_actions` `comment_likes`
`plaza_votes` `predict_bets` `duels`

**제외**: `content_reports` · `bug_reports` — 정지 중에도 신고는 할 수 있어야 한다.

### ② RPC 층 — 함수 안 가드 7개

`submit_tip` `vote_plaza_post` `battle_action` `weather_say` `place_bet`
`duel_challenge` `duel_rematch` 의 `unauthorized` 검사 바로 뒤에:

```sql
if public._me_banned() then return jsonb_build_object('ok', false, 'reason', 'banned'); end if;
```

### `_me_banned()` 를 새로 만든 이유

기존 `_is_banned(uuid)` 는 임의 uuid 를 넣어 **남의 정지 여부를 캐낼 수 있어** anon 에게서
실행권한을 회수해 둔 상태였다(2026-08-30). 그런데 RLS 정책에서 쓰려면 호출자가 실행할 수
있어야 한다. 인자를 없애 **자기 자신만** 보게 하면 그 문제가 사라진다.

## 검증

| | 밴 상태 | 정상 유저 |
|---|---|---|
| 이슈 댓글 | 차단 | OK |
| 광장 글 | 차단 | OK |
| 숏판 | 차단 | OK |
| 핫튜브 댓글 | 차단 | OK |
| 제보(RPC) | `banned` | `ok` |
| 전투(RPC) | `banned` | `ok` |
| 날씨 한마디(RPC) | `banned` | `ok` |
| 광장 추천(RPC) | `banned` | `ok` |
| DM | — | OK |

모든 시험은 트랜잭션 롤백. 남은 밴 기록 0건.

## 남은 것

- **읽기는 막지 않았다.** 정지된 이용자도 앱을 보고 로그인할 수 있다. 의도한 설계인지
  확인이 필요하다 — 완전 차단을 원하면 로그인 단계에서 끊어야 한다.
- **기존 콘텐츠는 그대로 남는다.** 정지 시 과거 글을 숨길지 여부는 정책 결정.
- **경고 누적 자동 정지** 미구현. `warning_count`·`warning_level` 컬럼과 `inc_warning`
  함수는 있으나 임계치에서 자동으로 밴을 거는 연결이 없다.
