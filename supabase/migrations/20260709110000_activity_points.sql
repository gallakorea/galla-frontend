-- 갈라 활동 포인트: 모든 활동(출석 포함)에서 포인트 지급, 일일 상한으로 어뷰징 방지
-- 2026-07-09 Management API로 원격 적용 (기록용)

-- 공통 지급 함수: 활동별 일일 상한 준수
create or replace function public._award(
  p_user uuid, p_amount numeric, p_reason text, p_daily_cap int
) returns void language plpgsql security definer set search_path = public as $$
declare v_cnt int;
begin
  if p_user is null or p_amount <= 0 then return; end if;
  insert into point_balances (user_id) values (p_user) on conflict (user_id) do nothing;
  select count(*) into v_cnt from point_ledger
    where user_id = p_user and reason = p_reason and created_at::date = current_date;
  if v_cnt >= p_daily_cap then return; end if;
  update point_balances set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  insert into point_ledger (user_id, delta, reason) values (p_user, p_amount, p_reason);
end $$;

-- ===== 트리거 함수들 =====
create or replace function public._pts_comment() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.user_id, 20, 'act_comment', 15); return NEW; end $$;

create or replace function public._pts_vote() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.user_id, 10, 'act_vote', 30); return NEW; end $$;

create or replace function public._pts_follow() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.follower, 15, 'act_follow', 10); return NEW; end $$;

create or replace function public._pts_market() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.created_by, 100, 'act_market', 5); return NEW; end $$;

create or replace function public._pts_issue() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.user_id, 200, 'act_issue', 3); return NEW; end $$;

-- ===== 트리거 부착 (중복 방지 위해 drop 후 create) =====
drop trigger if exists trg_pts_comment on public.comments;
create trigger trg_pts_comment after insert on public.comments
  for each row execute function public._pts_comment();

drop trigger if exists trg_pts_vote on public.votes;
create trigger trg_pts_vote after insert on public.votes
  for each row execute function public._pts_vote();

drop trigger if exists trg_pts_follow on public.follows;
create trigger trg_pts_follow after insert on public.follows
  for each row execute function public._pts_follow();

drop trigger if exists trg_pts_market on public.markets;
create trigger trg_pts_market after insert on public.markets
  for each row execute function public._pts_market();

drop trigger if exists trg_pts_issue on public.issues;
create trigger trg_pts_issue after insert on public.issues
  for each row execute function public._pts_issue();

revoke all on function public._award(uuid,numeric,text,int) from public, anon, authenticated;

-- 포인트 = 갈라 통합 랭킹 (총 보유 포인트 기준)
create or replace view public.galla_rank as
select b.user_id, up.nickname, up.level,
  round(b.balance::numeric,0) as points,
  rank() over (order by b.balance desc) as rank
from public.point_balances b
left join public.user_profiles up on up.user_id = b.user_id;
grant select on public.galla_rank to anon, authenticated;
