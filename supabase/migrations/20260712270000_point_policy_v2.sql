-- 갈라 포인트 정책 v2 — 발행 억제(인플레) + 명예/지갑 분리
-- 1) 출석 정액 1,000 → 7일 스트릭(주간 잭팟), 2) 이중지급 제거, 3) 랭킹=누적획득

-- ── 스트릭 컬럼 ──
alter table public.point_balances add column if not exists streak int not null default 0;

-- ── 출석: 7일 스트릭 (100/150/250/350/500/700/1000, 주간 순환) ──
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_last date; v_streak int; v_reward int; v_bal double precision;
  c_tbl constant int[] := array[100,150,250,350,500,700,1000];
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  select last_daily_claim, streak, balance into v_last, v_streak, v_bal
    from point_balances where user_id = v_user for update;
  if v_last = current_date then
    return jsonb_build_object('ok', false, 'reason', 'already', 'streak', coalesce(v_streak,0));
  end if;
  if v_last = current_date - 1 then v_streak := coalesce(v_streak,0) + 1; else v_streak := 1; end if;
  v_reward := c_tbl[((v_streak - 1) % 7) + 1];
  update point_balances set balance = balance + v_reward, last_daily_claim = current_date,
    streak = v_streak, updated_at = now() where user_id = v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, v_reward, 'daily');
  return jsonb_build_object('ok', true, 'balance', v_bal, 'claimed', v_reward,
    'streak', v_streak, 'day_in_week', ((v_streak - 1) % 7) + 1);
end $$;
grant execute on function public.claim_daily() to authenticated;

-- ── 이중지급 제거: 댓글·투표·팔로우 자동보상 폐지(데일리 미션이 대체) ──
drop trigger if exists trg_pts_comment on public.comments;
drop trigger if exists trg_pts_vote on public.votes;
drop trigger if exists trg_pts_follow on public.follows;

-- ── 콘텐츠 생성 보상 하향(발의 200→120/cap2, 마켓 100/cap2) ──
create or replace function public._pts_issue() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.user_id, 120, 'act_issue', 2); return NEW; end $$;
create or replace function public._pts_market() returns trigger
  language plpgsql security definer set search_path = public as $$
begin perform public._award(NEW.created_by, 100, 'act_market', 2); return NEW; end $$;

-- ── 명예/지갑 분리: 랭킹 = 누적 획득 GP (보유 잔액이 아니라) ──
-- 누적 획득 = 가입지급 10,000 + 원장의 양(+) 델타 합. 쓴다고 순위 안 떨어짐.
drop view if exists public.galla_rank;
create view public.galla_rank as
select b.user_id, up.nickname, up.level,
  round(b.balance::numeric, 0) as points,                    -- 보유(소비용)
  (10000 + coalesce(le.earned, 0))::bigint as lifetime,      -- 누적 획득(명예)
  rank() over (order by (10000 + coalesce(le.earned, 0)) desc) as rank
from public.point_balances b
left join public.user_profiles up on up.user_id = b.user_id
left join (
  select user_id, sum(delta) filter (where delta > 0)::bigint as earned
  from public.point_ledger group by user_id
) le on le.user_id = b.user_id;
grant select on public.galla_rank to anon, authenticated;

-- ── 누적 획득 GP 조회(등급/프로필용) ──
create or replace function public.lifetime_gp(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select (10000 + coalesce((select sum(delta) filter (where delta>0) from point_ledger where user_id = p_user), 0))::bigint;
$$;
grant execute on function public.lifetime_gp(uuid) to anon, authenticated;
