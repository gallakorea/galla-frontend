-- 🕵️ 적진 침투: 투표한 진영과 다른 진영으로 최상위 댓글 작성 = 침투
-- 하루 3회 제한(서버 트리거 강제). 전투 답글(battle_action)은 침투 아님(항상 내 진영).
create or replace function public.check_infiltration()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_vote text;
  v_used int;
  c_limit constant int := 3;
begin
  -- 최상위 일반 댓글만 검사
  if new.parent_id is not null then
    return new;
  end if;

  select type into v_vote
    from votes
   where issue_id = new.issue_id and user_id = new.user_id
   limit 1;

  -- 미투표자는 진영 제약 없음(자유 발언)
  if v_vote is null or v_vote not in ('pro','con') then
    return new;
  end if;

  -- 내 진영 글이면 통과
  if new.faction = v_vote then
    return new;
  end if;

  -- 침투: 오늘(UTC) 사용량 확인
  select count(*) into v_used
    from comments c
    join votes v on v.issue_id = c.issue_id and v.user_id = c.user_id
   where c.user_id = new.user_id
     and c.parent_id is null
     and c.faction <> v.type
     and c.created_at >= date_trunc('day', now());

  if v_used >= c_limit then
    raise exception 'infiltration_limit' using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_check_infiltration on public.comments;
create trigger trg_check_infiltration
  before insert on public.comments
  for each row execute function public.check_infiltration();

-- 클라 표시용: 오늘 남은 침투 횟수
create or replace function public.infiltration_status()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user uuid := auth.uid();
  v_used int;
  c_limit constant int := 3;
begin
  if v_user is null then
    return jsonb_build_object('used', 0, 'max', c_limit, 'left', c_limit);
  end if;
  select count(*) into v_used
    from comments c
    join votes v on v.issue_id = c.issue_id and v.user_id = c.user_id
   where c.user_id = v_user
     and c.parent_id is null
     and c.faction <> v.type
     and c.created_at >= date_trunc('day', now());
  return jsonb_build_object('used', v_used, 'max', c_limit, 'left', greatest(0, c_limit - v_used));
end $$;
grant execute on function public.infiltration_status() to authenticated;
