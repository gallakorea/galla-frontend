-- 🏆 시즌 + 명예의 전당 — 매 시즌 랭킹 리셋, 상위권에 시즌한정 칭호 영구 지급
-- 시즌 점수 = 해당 시즌 기간 내 누적 획득 GP(원장 양(+) 델타 합). 소비해도 안 깎임

create table if not exists public.seasons (
  id bigint generated always as identity primary key,
  num int not null,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'active' check (status in ('active','closed'))
);
alter table public.seasons enable row level security;
drop policy if exists seasons_read on public.seasons;
create policy seasons_read on public.seasons for select using (true);

create table if not exists public.hall_of_fame (
  id bigint generated always as identity primary key,
  season_num int not null, season_name text not null,
  rank int not null, user_id uuid not null, title text not null,
  created_at timestamptz not null default now()
);
alter table public.hall_of_fame enable row level security;
drop policy if exists hof_read on public.hall_of_fame;
create policy hof_read on public.hall_of_fame for select using (true);

-- 시즌한정 칭호 등 커스텀 칭호 지원(이름 직접 저장)
alter table public.user_titles add column if not exists custom_name text;

-- 현재 활성 시즌
create or replace function public._current_season()
returns seasons language sql stable security definer set search_path = public as $$
  select * from seasons where status='active' order by starts_at desc limit 1;
$$;

-- 시즌 리더보드(활성 시즌 기간 내 획득 GP 상위)
create or replace function public.season_leaderboard(p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s seasons; v jsonb;
begin
  s := _current_season();
  if s.id is null then return jsonb_build_object('ok',false,'reason','no_season'); end if;
  select jsonb_build_object('ok',true,
    'season', jsonb_build_object('num',s.num,'name',s.name,'starts_at',s.starts_at,'ends_at',s.ends_at),
    'rows', coalesce(jsonb_agg(r order by r_rank), '[]'::jsonb))
    into v
  from (
    select le.user_id, u.nickname, u.avatar_url, le.earned,
      rank() over (order by le.earned desc) r_rank,
      jsonb_build_object('user_id',le.user_id,'nickname',u.nickname,'avatar_url',u.avatar_url,
        'earned',le.earned,'rank', rank() over (order by le.earned desc)) r
    from (
      select user_id, sum(delta) filter (where delta>0)::bigint earned
      from point_ledger where created_at >= s.starts_at and created_at < s.ends_at
      group by user_id
    ) le left join users u on u.id = le.user_id
    order by le.earned desc limit p_limit
  ) x;
  return v;
end $$;

-- 시즌 종료·정산(관리자 전용): 상위 3인 시즌한정 칭호 + 명예의전당, 다음 시즌 생성
create or replace function public.season_resolve()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s seasons; r record; v_title text; v_next_start timestamptz;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  s := _current_season();
  if s.id is null then return jsonb_build_object('ok',false,'reason','no_season'); end if;

  for r in
    select le.user_id, rank() over (order by le.earned desc) rk
    from (select user_id, sum(delta) filter (where delta>0)::bigint earned
          from point_ledger where created_at >= s.starts_at and created_at < s.ends_at group by user_id) le
    order by le.earned desc limit 3
  loop
    v_title := case r.rk when 1 then '🥇 S'||s.num||' 논쟁왕'
                         when 2 then '🥈 S'||s.num||' 여론 지배자'
                         else '🥉 S'||s.num||' 논객' end;
    insert into hall_of_fame(season_num, season_name, rank, user_id, title) values (s.num, s.name, r.rk, r.user_id, v_title);
    insert into user_titles(user_id, title_key, custom_name)
      values (r.user_id, 'season_'||s.num||'_'||r.rk, v_title)
      on conflict (user_id, title_key) do nothing;
  end loop;

  update seasons set status='closed' where id=s.id;
  v_next_start := s.ends_at;
  insert into seasons(num, name, starts_at, ends_at, status)
    values (s.num+1, 'S'||(s.num+1), v_next_start, v_next_start + interval '1 month', 'active');
  return jsonb_build_object('ok',true,'closed',s.num);
end $$;

create or replace function public.hall_of_fame_list()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'season_num',h.season_num,'rank',h.rank,'title',h.title,
    'nickname',u.nickname,'avatar_url',u.avatar_url) order by h.season_num desc, h.rank), '[]'::jsonb)
  from hall_of_fame h left join users u on u.id=h.user_id;
$$;

-- equip_title 확장: 시즌한정(커스텀 이름) 칭호도 장착 가능
create or replace function public.equip_title(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_price int; v_custom text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key = 'none' then
    insert into user_cosmetics(user_id, title) values (v_user, null)
      on conflict (user_id) do update set title=null, updated_at=now();
    return jsonb_build_object('ok',true,'title',null);
  end if;
  -- 커스텀(시즌) 칭호 우선
  select custom_name into v_custom from user_titles where user_id=v_user and title_key=p_key;
  if v_custom is not null then
    insert into user_cosmetics(user_id, title) values (v_user, v_custom)
      on conflict (user_id) do update set title=v_custom, updated_at=now();
    return jsonb_build_object('ok',true,'title',v_custom);
  end if;
  select name, price into v_name, v_price from _title_info(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if v_price > 0 and not exists (select 1 from user_titles where user_id=v_user and title_key=p_key) then
    return jsonb_build_object('ok',false,'reason','not_owned'); end if;
  insert into user_cosmetics(user_id, title) values (v_user, v_name)
    on conflict (user_id) do update set title=v_name, updated_at=now();
  return jsonb_build_object('ok',true,'title',v_name);
end $$;

-- my_titles: 시즌 획득 칭호(커스텀)도 함께 반환
create or replace function public.my_titles()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'owned', coalesce((select jsonb_agg(title_key) from user_titles where user_id=auth.uid()), '[]'::jsonb),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('key',title_key,'name',custom_name))
                        from user_titles where user_id=auth.uid() and custom_name is not null), '[]'::jsonb),
    'equipped', (select title from user_cosmetics where user_id=auth.uid()));
$$;

-- 시즌 시드 (S1 = 이번 달)
insert into seasons(num, name, starts_at, ends_at, status)
select 1, 'S1', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month', 'active'
where not exists (select 1 from seasons);

grant execute on function public.season_leaderboard(int) to authenticated, anon;
grant execute on function public.season_resolve()        to authenticated;
grant execute on function public.hall_of_fame_list()     to authenticated, anon;
