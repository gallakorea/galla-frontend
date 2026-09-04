-- 퀴즈 참여자가 네이버 지역검색을 부를 때의 하루 상한.
-- 네이버 호출은 유한하고(수확 파이프라인이 같은 예산을 쓴다) 남용되면 수집이 통째로 멈춘다.
create table if not exists food_lookup_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (now() at time zone 'Asia/Seoul')::date,
  n       integer not null default 0,
  primary key (user_id, day)
);
alter table food_lookup_usage enable row level security;

create or replace function public.food_lookup_take(p_uid uuid, p_cap integer default 60)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare v_n int;
begin
  insert into food_lookup_usage(user_id) values (p_uid)
  on conflict (user_id, day) do nothing;
  update food_lookup_usage set n = n + 1
   where user_id = p_uid and day = (now() at time zone 'Asia/Seoul')::date
     and n < greatest(coalesce(p_cap, 60), 1)
  returning n into v_n;
  return v_n is not null;
end $$;
revoke all on function public.food_lookup_take(uuid, integer) from public, anon, authenticated;
