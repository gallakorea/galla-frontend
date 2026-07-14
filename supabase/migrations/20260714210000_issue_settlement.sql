-- ============================================================
-- 이슈 전선 정산 (7일 자동 종료 + 승리 진영 GP 보상)
--
-- 승패식 (프론트 issue.comments.js 와 동일):
--   최종 = 여론(투표) × 0.6  +  댓글대전 × 0.4
--   댓글 영향력 = 생존도(HP/100) × 설득력 × 가중치
--     설득력 = 1 + 추천 + 지원받음 + 방어받음×0.5 − 반대×0.5   (0 하한)
--     가중치 = 본댓글 1.0 / 대댓글 0.5
--   ⇒ 격파(HP 0)당한 댓글은 영향력 0 → 공격에 실질 의미가 생긴다.
-- ============================================================

-- 1) 종료·승패 컬럼
alter table public.issues
  add column if not exists ends_at          timestamptz,
  add column if not exists settled_at       timestamptz,
  add column if not exists winner           text,     -- 'pro' | 'con' | 'draw'
  add column if not exists final_pro_pct    numeric,  -- 최종 전선(pro 기준 0~100)
  add column if not exists final_vote_pct   numeric,
  add column if not exists final_battle_pct numeric;

-- 신규 이슈는 게시 7일 뒤 자동 종료
alter table public.issues alter column ends_at set default (now() + interval '7 days');

-- 기존 이슈에도 종료 시각 부여(게시일 + 7일)
update public.issues set ends_at = created_at + interval '7 days' where ends_at is null;

create index if not exists idx_issues_settle on public.issues (ends_at) where settled_at is null;


-- 2) 전선 점수 계산 — 프론트와 완전히 동일한 공식
create or replace function public.issue_frontline(p_issue bigint)
returns table (vote_pro numeric, battle_pro numeric, final_pro numeric)
language sql
stable
security definer
set search_path to 'public'
as $$
  with v as (
    select
      count(*) filter (where type = 'pro')::numeric as p,
      count(*) filter (where type = 'con')::numeric as c
    from votes where issue_id = p_issue
  ),
  lk as (   -- 댓글별 추천/반대 집계
    select cl.comment_id,
           sum(case when cl.value =  1 then 1 else 0 end)::numeric as up,
           sum(case when cl.value = -1 then 1 else 0 end)::numeric as down
    from comment_likes cl
    join comments c2 on c2.id = cl.comment_id
    where c2.issue_id = p_issue
    group by cl.comment_id
  ),
  inf as (  -- 댓글별 영향력
    select c.faction,
           (greatest(0, least(100, coalesce(c.hp, 0)))::numeric / 100)
           * greatest(0, 1
               + coalesce(lk.up, 0)
               + coalesce(c.support_count, 0)
               + coalesce(c.defense_count, 0) * 0.5
               - coalesce(lk.down, 0) * 0.5)
           * (case when c.parent_id is null then 1 else 0.5 end) as influence
    from comments c
    left join lk on lk.comment_id = c.id
    where c.issue_id = p_issue
      and coalesce(c.status, 'normal') = 'normal'
  ),
  b as (
    select coalesce(sum(influence) filter (where faction = 'pro'), 0) as p,
           coalesce(sum(influence) filter (where faction = 'con'), 0) as c
    from inf
  )
  select
    -- 투표/댓글이 아예 없으면 중립(0.5)
    case when (v.p + v.c) > 0 then v.p / (v.p + v.c) else 0.5 end,
    case when (b.p + b.c) > 0 then b.p / (b.p + b.c) else 0.5 end,
    (case when (v.p + v.c) > 0 then v.p / (v.p + v.c) else 0.5 end) * 0.6
  + (case when (b.p + b.c) > 0 then b.p / (b.p + b.c) else 0.5 end) * 0.4
  from v, b;
$$;


-- 3) 단일 이슈 정산 — 승자 확정 + 승리 진영 GP 지급
--    보상 = 기본 30GP + 살아남은 내 댓글 영향력 보너스(최대 70) ⇒ 최대 100GP
--    ⇒ '투표만' 해도 받지만, '싸워서 살아남은' 쪽이 더 받는다.
create or replace function public.settle_issue(p_issue bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_iss    record;
  f        record;
  v_winner text;
  v_pro    numeric;
  r        record;
  v_reward numeric;
  v_n      int := 0;
begin
  select * into v_iss from issues where id = p_issue;
  if not found then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_iss.settled_at is not null then return jsonb_build_object('ok', false, 'reason', 'already_settled'); end if;
  if v_iss.ends_at is null or v_iss.ends_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_ended');
  end if;

  select * into f from issue_frontline(p_issue);
  v_pro := round(f.final_pro * 100, 1);
  v_winner := case when v_pro > 50 then 'pro' when v_pro < 50 then 'con' else 'draw' end;

  update issues set
    settled_at       = now(),
    winner           = v_winner,
    final_pro_pct    = v_pro,
    final_vote_pct   = round(f.vote_pro   * 100, 1),
    final_battle_pct = round(f.battle_pro * 100, 1)
  where id = p_issue;

  if v_winner in ('pro', 'con') then
    for r in
      select distinct user_id from votes
      where issue_id = p_issue and type = v_winner and user_id is not null
    loop
      select 30 + least(70, coalesce(sum(
               (greatest(0, least(100, coalesce(c.hp, 0)))::numeric / 100) * 10
             ), 0))
        into v_reward
      from comments c
      where c.issue_id = p_issue
        and c.user_id  = r.user_id
        and c.faction  = v_winner
        and coalesce(c.status, 'normal') = 'normal'
        and coalesce(c.hp, 0) > 0;              -- 격파당한 댓글은 보상 없음

      insert into point_balances (user_id) values (r.user_id) on conflict (user_id) do nothing;
      update point_balances set balance = balance + v_reward, updated_at = now()
       where user_id = r.user_id;
      insert into point_ledger (user_id, delta, reason)
        values (r.user_id, v_reward, 'issue_win:' || p_issue);

      -- 결과 알림
      begin
        insert into notifications (user_id, type, title, body, link)
        values (r.user_id, 'issue_win', '⚔️ 우리 진영 승리!',
                '참전한 이슈에서 승리해 ' || v_reward || ' GP를 받았어요.',
                '/issue.html?id=' || p_issue);
      exception when others then null;  -- 알림 스키마가 달라도 정산은 계속
      end;

      v_n := v_n + 1;
    end loop;
  end if;

  return jsonb_build_object('ok', true, 'winner', v_winner, 'pro_pct', v_pro, 'rewarded', v_n);
end $$;


-- 4) 만료 이슈 일괄 정산 (크론)
create or replace function public.settle_due_issues()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare r record; n int := 0;
begin
  for r in
    select id from issues
    where settled_at is null and ends_at is not null and ends_at <= now()
    order by ends_at limit 200
  loop
    perform settle_issue(r.id);
    n := n + 1;
  end loop;
  return jsonb_build_object('settled', n);
end $$;


-- 5) 권한 — 조회는 공개, 정산은 서버(크론)만
grant execute on function public.issue_frontline(bigint) to anon, authenticated;
revoke execute on function public.settle_issue(bigint)    from public, anon, authenticated;
revoke execute on function public.settle_due_issues()     from public, anon, authenticated;


-- 6) 매시 10분에 만료 이슈 자동 정산
select cron.unschedule('settle-due-issues') where exists (
  select 1 from cron.job where jobname = 'settle-due-issues'
);
select cron.schedule('settle-due-issues', '10 * * * *', $$select public.settle_due_issues();$$);
