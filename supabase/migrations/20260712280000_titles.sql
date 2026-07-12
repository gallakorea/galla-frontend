-- 🏷️ 칭호(Titles) — GP 소비 + 상태 표현(닉네임 옆 배지). 명예/지갑 분리로 써도 순위 유지
-- 소유(user_titles) + 장착(user_cosmetics.title, 공개 렌더)

alter table public.user_cosmetics add column if not exists title text;

-- 카탈로그: key → (name, price). 무료(0)는 기본 제공
create or replace function public._title_info(p_key text)
returns table(name text, price int) language sql immutable as $$
  select case p_key
    when 'none' then '' when 'newbie' then '🌱 눈팅 뉴비' when 'breaker' then '🔥 발끈러'
    when 'warrior' then '⌨️ 키보드 워리어' when 'sniper' then '🎯 여론 저격수'
    when 'factbomb' then '🧠 팩트 폭격기' when 'spy' then '🕵️ 여론 스파이'
    when 'agitator' then '🌪️ 선동가' when 'king' then '👑 논쟁의 왕'
    when 'legend' then '🏆 갈라 레전드' else null end,
  case p_key
    when 'none' then 0 when 'newbie' then 0 when 'breaker' then 500 when 'warrior' then 1500
    when 'sniper' then 3000 when 'factbomb' then 3000 when 'spy' then 5000
    when 'agitator' then 8000 when 'king' then 15000 when 'legend' then 30000 else null end;
$$;

create table if not exists public.user_titles (
  user_id uuid not null,
  title_key text not null,
  acquired_at timestamptz not null default now(),
  primary key (user_id, title_key)
);
alter table public.user_titles enable row level security;
drop policy if exists user_titles_self on public.user_titles;
create policy user_titles_self on public.user_titles for select using (auth.uid() = user_id);

-- 구매: GP 차감 + 소유 등록
create or replace function public.buy_title(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select name, price into v_name, v_price from _title_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if exists (select 1 from user_titles where user_id=v_user and title_key=p_key) then
    return jsonb_build_object('ok',true,'already',true);
  end if;
  if v_price > 0 then
    insert into point_balances(user_id) values (v_user) on conflict do nothing;
    select balance into v_bal from point_balances where user_id=v_user for update;
    if coalesce(v_bal,0) < v_price then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
    update point_balances set balance=balance-v_price, updated_at=now() where user_id=v_user;
    insert into point_ledger(user_id, delta, reason) values (v_user, -v_price, 'title:'||p_key);
  end if;
  insert into user_titles(user_id, title_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'key',p_key);
end $$;

-- 장착: 소유(또는 무료)한 칭호를 user_cosmetics.title 에 반영(공개)
create or replace function public.equip_title(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key = 'none' then
    insert into user_cosmetics(user_id, title) values (v_user, null)
      on conflict (user_id) do update set title=null, updated_at=now();
    return jsonb_build_object('ok',true,'title',null);
  end if;
  select name, price into v_name, v_price from _title_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if v_price > 0 and not exists (select 1 from user_titles where user_id=v_user and title_key=p_key) then
    return jsonb_build_object('ok',false,'reason','not_owned');
  end if;
  insert into user_cosmetics(user_id, title) values (v_user, v_name)
    on conflict (user_id) do update set title=v_name, updated_at=now();
  return jsonb_build_object('ok',true,'title',v_name);
end $$;

-- 내 칭호(소유 목록 + 장착)
create or replace function public.my_titles()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'owned', coalesce((select jsonb_agg(title_key) from user_titles where user_id=auth.uid()), '[]'::jsonb),
    'equipped', (select title from user_cosmetics where user_id=auth.uid())
  );
$$;

grant execute on function public.buy_title(text)   to authenticated;
grant execute on function public.equip_title(text) to authenticated;
grant execute on function public.my_titles()       to authenticated;
