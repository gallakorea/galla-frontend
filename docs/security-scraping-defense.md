# 데이터 스크래핑·성향 역추적 방어 (26.9.22 모의침투 후속)

## 배경
익명 키로 `users(id,nickname)` + `votes(user_id,type)`를 조인하면 "누가 어느 편에
투표했는지" 대량 수집이 가능하다(예측베팅·포지션·좋아요·리믹스 성향도 동일 패턴).
투표 성향 공개 자체는 **제품 설계**(댓글 옆 진영 배지, `issue.comments.js`)이고,
AI 논점 정리는 진영 라벨·집계로 도는 것이라 이와 무관하다. 문제는 **개별 조회가 아니라
대량 수집(도시에 구축)** 이다.

## ⚠️ 먼저: Cloudflare 만으로는 데이터 API를 못 막는다
클라이언트는 `https://bidqauputnhkqepvdzrr.supabase.co` 를 **직결**로 쓴다(`js/supabase.js`).
이 도메인은 우리 Cloudflare(galla.im) 뒤가 아니라 **Supabase 소유 도메인**이다.
→ galla.im 에 건 Cloudflare 룰은 스크래퍼가 `supabase.co` 를 직접 때리면 **적용되지 않는다.**
데이터 API 스크래핑은 **Supabase(DB) 쪽에서** 막아야 한다.

---

## A. 지금 상태 (이미 되어 있는 것)
- **PostgREST `max_rows = 1000`** — 한 요청당 최대 1000행. 대량 덤프를 페이지네이션으로
  강제해 속도·비용을 올린다(완전 차단은 아님). 유지할 것. 확인:
  ```bash
  curl -s "https://api.supabase.com/v1/projects/<REF>/postgrest" \
    -H "Authorization: Bearer <MGMT_TOKEN>" | jq .max_rows
  ```

## B. 진짜 해결 — 성향 조회를 RPC로 (권장, 코드 변경)
직접 `votes` 읽기를 없애고 **필요한 것만 주는 함수**로 바꾸면 대량 열거가 원천 차단된다.
기능(진영 배지)은 그대로 유지된다.

1) 함수 — 한 이슈에 대해 **지정한 작성자들의** 진영만 반환(무제한 열거 불가):
```sql
create or replace function public.voter_sides(p_issue bigint, p_users uuid[])
returns table(user_id uuid, side text)
language sql security definer set search_path=public stable as $$
  select v.user_id, v.type
  from votes v
  where v.issue_id = p_issue
    and v.user_id = any(p_users[:50])   -- 한 번에 최대 50명(화면에 보이는 댓글만)
    and v.type in ('pro','con')
$$;
revoke execute on function public.voter_sides(bigint, uuid[]) from anon, public;
grant  execute on function public.voter_sides(bigint, uuid[]) to authenticated;
```

2) 직접 읽기 차단 — `votes.user_id` 컬럼 SELECT 회수(집계 `type`·`issue_id`는 유지):
```sql
-- ⚠️ 적용 전 아래 C(프론트) 먼저 배포. 순서 틀리면 배지·본인성향 화면이 백지화된다.
revoke select (user_id) on public.votes from anon, authenticated;
```
→ 이러면 `select=user_id` 나 `.eq("user_id", …)` 대량 조회가 42501 로 죽는다.
   집계(`select=type&issue_id=eq.N`)는 계속 된다.

3) 프론트 두 곳을 RPC로:
- `js/issue.comments.js`(배지): 화면에 보이는 댓글 작성자 id 를 모아 한 번에
  `supabaseClient.rpc('voter_sides', { p_issue: issueId, p_users: authorIds })` 로 조회.
- `js/galla-type.js`(본인 성향): `.from("votes").select("type,issue_id").eq("user_id", 본인)`
  → 본인 것이니 `voter_sides(issue, [본인])` 또는 본인 전용 RPC 로. (RLS 본인-SELECT 를
  추가해도 되지만 컬럼 회수와 충돌 없게 RPC 통일이 안전.)
- `predict_bets`·`market_positions`·`plaza_votes`·`remixes` 도 같은 패턴이면 동일 처리.

> 순서: **(3) 프론트 배포 → (1) 함수 생성 → (2) 컬럼 회수 → anon curl 로 42501 확인 +
> 배지·본인성향 화면 실제 확인.** 리믹스 대결 재개 시 `remixes` 도 같은 원칙 적용.

## C. Cloudflare 로 실제 막을 수 있는 것 (galla.im 뒤에 있는 것만)
데이터 API 는 못 막지만, **웹앱·엣지·프록시·CDN 남용**은 Cloudflare 로 막는다.
대시보드 → Security → WAF / Rate limiting rules.

| 대상(호스트/경로) | 룰 | 액션 |
|---|---|---|
| `galla.im/*` (웹앱·SPA) | Bot Fight Mode ON, 알려진 봇 차단 | Managed Challenge |
| `galla.im/yt*` (유튜브 프록시) | IP당 60초에 120요청 초과 | Managed Challenge |
| `*.functions.supabase.co` 는 **불가**(CF 밖). 엣지 남용은 함수 내부 게이트로(이미 적용: CRON_SECRET·getUser) | — | — |
| `cdn.galla.im/*` (R2 미디어) | IP당 60초에 300요청 초과 | Block 1분 |
| galla.im 로그인/가입 경로 | IP당 5분에 20요청 초과 | Managed Challenge |

Rate limiting rule 예시(대시보드에 그대로):
- **이름**: yt-proxy-flood
- **If incoming requests match**: `(http.host eq "galla.im" and starts_with(http.request.uri.path, "/yt"))`
- **When rate exceeds**: 120 requests / 60 seconds / by IP
- **Then**: Managed Challenge, 지속 60초

## D. 선택 — Supabase 커스텀 도메인(효과 제한적)
데이터 API 를 `db.galla.im` 커스텀 도메인으로 돌려 CF 뒤에 두면 CF 룰이 먹지만,
프로젝트 ref 서브도메인(`*.supabase.co`)은 계속 살아 있어 스크래퍼가 그쪽을 쓰면 우회된다.
**B(RPC화)가 근본책이고, D 는 부가적**이다.

---

## 우선순위
1. **A**(max_rows=1000) — 이미 됨, 유지.
2. **C**(Cloudflare) — 웹·프록시·CDN·로그인 보호. 지금 대시보드에서 적용 가능.
3. **B**(RPC화) — 성향 대량 역추적 근본 차단. 코드 변경이라 출시 여유 있을 때. 순서 엄수.
4. **D** — 선택.

심각(High) 취약점은 없으므로 **출시는 그대로 진행**하고, C 를 켠 뒤 B 를 후속으로 진행 권장.
