-- 필터 + 랭킹 (2026-08-31)

/* ── 1. food_map 에 필터 두 개 추가 ────────────────────────
   ⚠️ 파라미터를 덧붙이면 새 시그니처가 되어 **오버로드가 생긴다**.
      PostgREST 가 이름으로 해석할 때 모호해지므로 옛 것을 먼저 지운다. */
drop function if exists public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,int);

create or replace function public.food_map(
  p_sw_lat numeric default null, p_sw_lon numeric default null,
  p_ne_lat numeric default null, p_ne_lon numeric default null,
  p_region text default null, p_channel text default null,
  p_only_unvisited boolean default false, p_limit int default 300,
  p_category text default null,      -- 한식·중식·카페…
  p_min_shows int default null)      -- 2 = 두 곳 이상 방송에 나온 집(= 검증된 집)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'created_at', p.created_at,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
      'visited', v.place_id is not null,
      'saved',   sv.place_id is not null) x
    from food_places p
    left join lateral (
      select jsonb_agg(distinct c.slug) chs, count(distinct c.slug) n
        from food_place_sources fs join food_channels c on c.slug = fs.channel
       where fs.place_id = p.id) s on true
    left join food_stats st on st.place_id = p.id
    left join food_visits v on v.place_id = p.id and v.user_id = (select u from me)
    left join food_saves  sv on sv.place_id = p.id and sv.user_id = (select u from me)
    where p.status = 'live'
      and (p_region  is null or p.region = p_region)
      and (p_sw_lat  is null or (p.lat between p_sw_lat and p_ne_lat
                             and p.lon between p_sw_lon and p_ne_lon))
      and (p_channel is null or exists (
            select 1 from food_place_sources f2 where f2.place_id = p.id and f2.channel = p_channel))
      and (p_category is null or p.category = p_category)
      and (p_min_shows is null or coalesce(s.n,0) >= p_min_shows)
      and (not p_only_unvisited or v.place_id is null)
    order by p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
$fn$;
grant execute on function public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,int,text,int)
  to anon, authenticated;

/* 필터 시트에 띄울 실제 카테고리 목록 — 없는 걸 버튼으로 두면 눌러도 0건이다 */
create or replace function public.food_categories()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(jsonb_agg(jsonb_build_object('name', category, 'n', n) order by n desc), '[]'::jsonb)
    from (select category, count(*) n from food_places
           where status='live' and category is not null and btrim(category) <> ''
           group by category) t;
$fn$;
grant execute on function public.food_categories() to anon, authenticated;

/* ── 2. 랭킹 ───────────────────────────────────────────────
   저쪽은 '많이 다녀온 / 많이 등록한' 두 줄이다. 우리는 세 번째 축을 넣는다 —
   **판정왕**(맛있다/맛없다를 가장 많이 던진 사람). 갈라는 싸움이 본체니까. */
create or replace function public.food_leaders(p_limit int default 10)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true,
    'visited', coalesce((select jsonb_agg(jsonb_build_object('nick', nick, 'n', n) order by n desc)
      from (select coalesce(u.nickname,'익명') nick, count(*) n
              from food_visits v left join user_profiles u on u.user_id = v.user_id
             group by 1 order by n desc limit least(coalesce(p_limit,10),50)) a), '[]'::jsonb),
    'added', coalesce((select jsonb_agg(jsonb_build_object('nick', nick, 'n', n) order by n desc)
      from (select coalesce(u.nickname,'익명') nick, count(*) n
              from food_places p left join user_profiles u on u.user_id = p.submitted_by
             where p.submitted_by is not null group by 1 order by n desc limit least(coalesce(p_limit,10),50)) b), '[]'::jsonb),
    'judged', coalesce((select jsonb_agg(jsonb_build_object('nick', nick, 'n', n) order by n desc)
      from (select coalesce(u.nickname,'익명') nick, count(*) n
              from food_votes fv left join user_profiles u on u.user_id = fv.user_id
             group by 1 order by n desc limit least(coalesce(p_limit,10),50)) c), '[]'::jsonb));
$fn$;
grant execute on function public.food_leaders(int) to anon, authenticated;

select jsonb_object_keys(food_leaders(3)) k;
