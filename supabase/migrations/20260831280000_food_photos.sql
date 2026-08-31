-- 맛집 사진 제보 (2026-08-31)
--
-- 우리에겐 매장 사진이 없다. 지금은 출처 영상 썸네일을 쓰는데 두 가지가 걸린다:
--   ① 영상 하나에 식당이 여러 곳 나오면 같은 사진이 반복된다
--   ② 그건 '가게 사진'이 아니라 '영상 썸네일'이라 오해를 준다
-- → 유저가 올린 사진이 있으면 그걸 먼저 쓴다. 구조적으로 둘 다 해소된다.
--
-- 저장은 기존 R2 파이프라인(upload-media)을 그대로 쓴다. 여기엔 URL 만 담는다.

create table if not exists public.food_photos (
  id         bigserial primary key,
  place_id   uuid not null references public.food_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  url        text not null check (url ~ '^https://'),
  status     text not null default 'live' check (status in ('live','hidden')),
  created_at timestamptz not null default now()
);
create index if not exists food_photos_place on public.food_photos (place_id, id desc) where status='live';
create index if not exists food_photos_user  on public.food_photos (user_id, created_at desc);
alter table public.food_photos enable row level security;

/* 올리기 — 집당 30장, 한 사람이 한 집에 5장까지.
   한 사람이 한 집을 도배하면 그 집 사진이 전부 그 사람 시선이 된다. */
create or replace function public.food_photo_add(p_id uuid, p_url text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_all int; v_mine int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if p_url is null or p_url !~ '^https://' then return jsonb_build_object('ok',false,'reason','bad_url'); end if;
  if not exists (select 1 from food_places where id=p_id and status='live') then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;

  select count(*) filter (where status='live'),
         count(*) filter (where status='live' and user_id=v_uid)
    into v_all, v_mine from food_photos where place_id = p_id;
  if v_all  >= 30 then return jsonb_build_object('ok',false,'reason','full'); end if;
  if v_mine >= 5  then return jsonb_build_object('ok',false,'reason','mine_full'); end if;

  insert into food_photos(place_id, user_id, url) values (p_id, v_uid, p_url);
  return jsonb_build_object('ok',true,'count',v_all+1);
end $fn$;
grant execute on function public.food_photo_add(uuid,text) to authenticated;

/* 내 사진 내리기 — 남의 사진은 food_report 로 신고한다(같은 경로로 일원화) */
create or replace function public.food_photo_remove(p_photo bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  update food_photos set status='hidden' where id=p_photo and user_id=v_uid;
  return jsonb_build_object('ok', found);
end $fn$;
grant execute on function public.food_photo_remove(bigint) to authenticated;

-- 상세에 사진을 싣는다
create or replace function public.food_place_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', p.id is not null,
    'place', to_jsonb(p) - 'norm_name' - 'submitted_by',
    'visited', exists (select 1 from food_visits v where v.place_id=p.id and v.user_id=auth.uid()),
    'saved',   exists (select 1 from food_saves  s where s.place_id=p.id and s.user_id=auth.uid()),
    'stats', coalesce((select jsonb_build_object('good', st.good, 'bad', st.bad,
                                                 'heat', round(st.heat,2), 'comments', st.comments)
                         from food_stats st where st.place_id = p.id),
                      jsonb_build_object('good',0,'bad',0,'heat',0,'comments',0)),
    'mine', (select v.verdict from food_votes v where v.place_id = p.id and v.user_id = auth.uid()),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'url', ph.url, 'mine', ph.user_id = auth.uid()) order by ph.id desc)
      from food_photos ph where ph.place_id = p.id and ph.status='live'), '[]'::jsonb),
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.name, 'price', m.price, 'source', m.source) order by m.id)
      from food_menus m where m.place_id = p.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$fn$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;

/* 목록 카드가 쓸 대표 사진 — 유저 사진이 있으면 그걸, 없으면 영상 썸네일로 폴백한다.
   시그니처는 그대로 두고 반환 필드만 더한다(오버로드 방지). */
create or replace function public.food_map(
  p_sw_lat numeric default null, p_sw_lon numeric default null,
  p_ne_lat numeric default null, p_ne_lon numeric default null,
  p_region text default null, p_channel text default null,
  p_only_unvisited boolean default false, p_limit int default 300,
  p_category text default null, p_min_shows int default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'created_at', p.created_at,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'video_id', s.vid,
      'cover', (select ph.url from food_photos ph
                 where ph.place_id = p.id and ph.status='live' order by ph.id desc limit 1),
      'photos_n', (select count(*) from food_photos ph
                    where ph.place_id = p.id and ph.status='live'),
      'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
      'visited', v.place_id is not null,
      'saved',   sv.place_id is not null) x
    from food_places p
    left join lateral (
      select jsonb_agg(distinct c.slug) chs, count(distinct c.slug) n,
             (array_agg(fs.video_id) filter (where fs.video_id is not null))[1] vid
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

select (food_map(p_limit:=1)->'places'->0) ? 'cover' as has_cover;
