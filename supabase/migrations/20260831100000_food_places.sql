-- 맛집 — "지금 우리 동네"의 두 번째 축 (2026-08-31)
--
-- 사장님: "맛집여지도 데이터 싹 다 긁어와라."
--   → 안 긁는다. 남의 DB를 통째로 복제해 재서비스하면 저작권법 93조(데이터베이스제작자 권리)다.
--     대신 **그 사이트가 데이터를 만드는 방법**을 원본에서 직접 돌린다.
--     저쪽도 결국 유튜브·방송을 보고 손으로 옮겨 적은 것이다. 우리는 그 과정을 자동화한다.
--
-- 3소스로 채운다 (사장님 승인):
--   yt   — 등록 채널의 영상 제목·설명을 AI가 읽어 상호를 뽑는다 (collect-food-places)
--   gov  — 지방행정 인허가(일반음식점) + 카카오 로컬로 좌표·카테고리 보정
--   user — 유저 제보(장소 등록). GP로 보상한다.
--
-- 🚨 지역 매칭이 이 파일에서 제일 위험한 부분이다. weather_regions 의 이름 규칙이 일정하지 않다:
--   · 대부분은 접미사를 뗐다        — 아산시→'아산', 해남군→'해남'
--   · 광역시 구는 접미사를 유지한다  — '남구','동구','북구','서구','중구' ('남'만 두면 뜻이 없다)
--   · 동음이의가 실재한다            — 강원 '고성군' vs 경남 '고성', 경기 '광주시' vs 광역시 '광주'
--   → 그래서 **시·도로 먼저 좁힌 뒤에만** 시군구를 맞춘다. 반대로 하면 부산 맛집이 광주에 꽂힌다.

/* ── 1. 방송·유튜브 채널 ───────────────────────────────── */
create table if not exists public.food_channels (
  slug          text primary key,
  name          text not null,
  kind          text not null default 'yt' check (kind in ('yt','tv')),
  yt_channel_id text,                       -- UC... 있으면 업로드 목록을 통째로 훑는다
  yt_query      text,                       -- 채널 ID가 없는 지상파는 검색어로 (백반기행 등)
  thumb         text,
  active        boolean not null default true,
  sort          int not null default 0,
  last_video_at timestamptz,                -- 여기까지 읽었다 — 다음 수집의 시작점
  last_synced_at timestamptz
);

/* ── 2. 맛집 ──────────────────────────────────────────── */
create table if not exists public.food_places (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  address      text not null,
  region       text references public.weather_regions(code) on delete set null,
  lat          numeric,
  lon          numeric,
  category     text,                        -- 한식·중식·카페…
  phone        text,
  origin       text not null default 'yt' check (origin in ('yt','gov','user')),
  status       text not null default 'live' check (status in ('live','pending','hidden')),
  submitted_by uuid references auth.users(id) on delete set null,
  -- 중복 판정용 정규화 이름. "베수비오"는 서울 중구와 수원에 각각 실재하므로
  -- 이름만으로는 못 묶는다 — 좌표까지 봐야 한다.
  norm_name    text generated always as (lower(regexp_replace(name, '[[:space:]]', '', 'g'))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 같은 이름 + 반경 100m 안팎(소수 3자리 ≈ 110m)이면 같은 집으로 본다.
create unique index if not exists food_places_dedupe
  on public.food_places (norm_name, round(lat,3), round(lon,3))
  where lat is not null and lon is not null;
-- 좌표를 못 얻은 건은 이름+주소로만 막는다.
create unique index if not exists food_places_dedupe_noloc
  on public.food_places (norm_name, address)
  where lat is null or lon is null;

create index if not exists food_places_region on public.food_places (region, created_at desc) where status='live';
create index if not exists food_places_bbox   on public.food_places (lat, lon) where status='live';
create index if not exists food_places_new    on public.food_places (created_at desc) where status='live';

/* ── 3. 출처 — 어느 방송 몇 번 나왔나 ──────────────────── */
-- 한 집이 또간집에도 백반기행에도 나올 수 있다. 그게 '검증된 맛집'의 신호다.
create table if not exists public.food_place_sources (
  id          bigserial primary key,
  place_id    uuid not null references public.food_places(id) on delete cascade,
  channel     text not null references public.food_channels(slug) on delete cascade,
  video_id    text,
  video_title text,
  aired_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists food_sources_uk
  on public.food_place_sources (place_id, channel, video_id) nulls not distinct;
create index if not exists food_sources_ch on public.food_place_sources (channel, created_at desc);

/* ── 4. 도장깨기 · 찜 ─────────────────────────────────── */
create table if not exists public.food_visits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   uuid not null references public.food_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index if not exists food_visits_user on public.food_visits (user_id, created_at desc);

create table if not exists public.food_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   uuid not null references public.food_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

/* ── 5. 주소 → 지역코드 ────────────────────────────────
   시·도로 먼저 좁힌 뒤 시군구를 맞춘다. 순서를 바꾸면 '고성'·'광주'·'중구'가 전부 틀린다.  */
create or replace function public.food_region_of(p_address text)
returns text language plpgsql stable set search_path to 'public' as $fn$
declare
  a text := coalesce(p_address,'');
  v_sido text; v_tok text; v_code text;
begin
  -- 시·도 (긴 정식명을 먼저 본다 — '전북특별자치도'가 '전북'보다 앞이어야 한다)
  v_sido := case
    when a like '서울%'                       then 'seoul'
    when a like '부산%'                       then 'busan'
    when a like '대구%'                       then 'daegu'
    when a like '인천%'                       then 'incheon'
    when a like '광주광역시%'                  then 'gwangju'
    when a like '대전%'                       then 'daejeon'
    when a like '울산%'                       then 'ulsan'
    when a like '세종%'                       then 'sejong'
    when a like '경기%'                       then 'gyeonggi'
    when a like '강원%'                       then 'gangwon'
    when a like '충청북도%' or a like '충북%'   then 'chungbuk'
    when a like '충청남도%' or a like '충남%'   then 'chungnam'
    when a like '전북%'   or a like '전라북도%' then 'jeonbuk'
    when a like '전남%'   or a like '전라남도%' then 'jeonnam'
    when a like '경상북도%' or a like '경북%'   then 'gyeongbuk'
    when a like '경상남도%' or a like '경남%'   then 'gyeongnam'
    when a like '제주%'                       then 'jeju'
    when a like '광주%'                       then 'gwangju'   -- ⚠️ 반드시 경기 '광주시'보다 뒤
    else null end;
  if v_sido is null then return null; end if;

  -- 세종은 산하 시군구가 없다 — 시도 자체가 동네다.
  if v_sido = 'sejong' then return 'sejong'; end if;

  -- 두 번째 토큰 = 시군구. "경기도 수원시 팔달구" 처럼 구가 또 나와도 '시'를 먼저 잡는다.
  v_tok := (regexp_split_to_array(btrim(a), '[[:space:]]+'))[2];
  if v_tok is null then return v_sido; end if;

  -- ① 원문 그대로 (광역시 '남구','동구' / 강원 '고성군' / 경기 '광주시')
  select code into v_code from weather_regions
   where kind='city' and parent = v_sido and name = v_tok limit 1;
  if v_code is not null then return v_code; end if;

  -- ② 접미사를 뗀 형태 (아산시 → '아산')
  select code into v_code from weather_regions
   where kind='city' and parent = v_sido and name = regexp_replace(v_tok, '(시|군|구)$', '') limit 1;
  if v_code is not null then return v_code; end if;

  -- ③ 못 맞추면 시·도까지만. 틀린 동네에 꽂는 것보다 낫다.
  return v_sido;
end $fn$;

-- 주소가 바뀌면 지역도 따라간다.
create or replace function public.food_places_biu()
returns trigger language plpgsql set search_path to 'public' as $fn$
begin
  if new.region is null or new.address is distinct from coalesce(old.address, '') then
    new.region := coalesce(new.region, food_region_of(new.address));
  end if;
  new.updated_at := now();
  return new;
end $fn$;
drop trigger if exists food_places_biu on public.food_places;
create trigger food_places_biu before insert or update on public.food_places
  for each row execute function public.food_places_biu();

/* ── 6. 읽기 RPC ──────────────────────────────────────
   PostgREST 임베드로 뽑지 않는다. users/user_profiles 컬럼 잠금 밑에서 (count) 임베드가
   테이블 권한을 요구해 목록이 통째로 백지가 된 전례가 있다 — 전부 RPC로 내린다.        */

-- 지도 화면(bbox) 또는 동네(region) 기준 목록. 비로그인도 본다.
create or replace function public.food_map(
  p_sw_lat numeric default null, p_sw_lon numeric default null,
  p_ne_lat numeric default null, p_ne_lon numeric default null,
  p_region text default null, p_channel text default null,
  p_only_unvisited boolean default false, p_limit int default 300)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category, 'phone', p.phone,
      'created_at', p.created_at,
      'channels', coalesce(s.chs, '[]'::jsonb),
      'visited', v.place_id is not null,
      'saved',   sv.place_id is not null) x
    from food_places p
    left join lateral (
      select jsonb_agg(distinct c.slug) chs
        from food_place_sources fs join food_channels c on c.slug = fs.channel
       where fs.place_id = p.id) s on true
    left join food_visits v on v.place_id = p.id and v.user_id = (select u from me)
    left join food_saves  sv on sv.place_id = p.id and sv.user_id = (select u from me)
    where p.status = 'live'
      and (p_region  is null or p.region = p_region)
      and (p_sw_lat  is null or (p.lat between p_sw_lat and p_ne_lat
                             and p.lon between p_sw_lon and p_ne_lon))
      and (p_channel is null or exists (
            select 1 from food_place_sources f2 where f2.place_id = p.id and f2.channel = p_channel))
      and (not p_only_unvisited or v.place_id is null)
    order by p.created_at desc
    limit least(coalesce(p_limit, 300), 1000)
  ) q;
$fn$;

-- 채널 목록 + 곳수 + 내 정복률. 도장깨기의 점수판이다.
create or replace function public.food_channel_stats()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'channels', coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug, 'name', c.name, 'kind', c.kind, 'thumb', c.thumb,
      'total', t.n, 'visited', t.mine,
      'pct', case when t.n > 0 then round(t.mine::numeric * 100 / t.n) else 0 end
    ) order by t.n desc), '[]'::jsonb))
  from food_channels c
  join lateral (
    select count(distinct p.id) n,
           count(distinct p.id) filter (
             where exists (select 1 from food_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from food_place_sources fs join food_places p on p.id = fs.place_id and p.status='live'
     where fs.channel = c.slug) t on true
  where c.active;
$fn$;

-- 한 집의 상세 — 어느 방송 어느 회차에 나왔는지까지.
create or replace function public.food_place_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', p.id is not null,
    'place', to_jsonb(p) - 'norm_name' - 'submitted_by',
    'visited', exists (select 1 from food_visits v where v.place_id=p.id and v.user_id=auth.uid()),
    'saved',   exists (select 1 from food_saves  s where s.place_id=p.id and s.user_id=auth.uid()),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$fn$;

/* ── 7. 쓰기 RPC ──────────────────────────────────────
   ⚠️ 도장(갔다옴)에는 GP를 주지 않는다. 자기신고라 검증이 불가능해 버튼만 누르면 무한 파밍이 된다.
      보상은 '내 지도가 채워지는 것' 자체다(공유 미션에서 얻은 교훈: 자기신고 = 보상 최저치).  */
create or replace function public.food_toggle_visit(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_on boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if not exists (select 1 from food_places where id=p_id and status='live') then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;
  delete from food_visits where user_id=v_uid and place_id=p_id;
  if found then v_on := false;
  else insert into food_visits(user_id, place_id) values (v_uid, p_id); v_on := true; end if;
  return jsonb_build_object('ok',true,'visited',v_on,
    'total',(select count(*) from food_visits where user_id=v_uid));
end $fn$;

create or replace function public.food_toggle_save(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_on boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  delete from food_saves where user_id=v_uid and place_id=p_id;
  if found then v_on := false;
  else insert into food_saves(user_id, place_id) values (v_uid, p_id); v_on := true; end if;
  return jsonb_build_object('ok',true,'saved',v_on);
end $fn$;

-- 유저 제보. 하루 5건까지, 건당 50GP. 중복이면 보상 없이 기존 집을 돌려준다.
create or replace function public.food_submit(
  p_name text, p_address text, p_lat numeric default null, p_lon numeric default null,
  p_category text default null, p_channel text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_id uuid; v_today int; v_amt int := 50;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if length(btrim(coalesce(p_name,'')))    < 2 then return jsonb_build_object('ok',false,'reason','bad_name'); end if;
  if length(btrim(coalesce(p_address,''))) < 5 then return jsonb_build_object('ok',false,'reason','bad_address'); end if;

  select count(*) into v_today from food_places
   where submitted_by = v_uid and created_at > now() - interval '1 day';
  if v_today >= 5 then return jsonb_build_object('ok',false,'reason','daily_limit'); end if;

  begin
    insert into food_places(name, address, lat, lon, category, origin, submitted_by)
    values (btrim(p_name), btrim(p_address), p_lat, p_lon, nullif(btrim(coalesce(p_category,'')),''), 'user', v_uid)
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from food_places
     where norm_name = lower(regexp_replace(btrim(p_name),'[[:space:]]','','g'))
     order by created_at limit 1;
    return jsonb_build_object('ok',true,'dup',true,'id',v_id,'amount',0);
  end;

  if p_channel is not null and exists (select 1 from food_channels where slug=p_channel) then
    insert into food_place_sources(place_id, channel) values (v_id, p_channel)
      on conflict do nothing;
  end if;

  insert into point_balances(user_id) values (v_uid) on conflict (user_id) do nothing;
  update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_uid;
  insert into point_ledger(user_id, delta, reason) values (v_uid, v_amt, 'food_submit');

  return jsonb_build_object('ok',true,'dup',false,'id',v_id,'amount',v_amt,
    'region',(select region from food_places where id=v_id));
end $fn$;

/* ── 8. 수집기 전용 적재 (service_role) ────────────────
   collect-food-places 가 한 번에 여러 건을 넣는다. 중복은 조용히 출처만 덧붙인다.       */
create or replace function public.food_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    begin
      insert into food_places(name, address, lat, lon, category, phone, origin)
      values (btrim(it->>'name'), btrim(it->>'address'),
              nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
              nullif(it->>'category',''), nullif(it->>'phone',''),
              coalesce(nullif(it->>'origin',''),'yt'))
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from food_places
       where norm_name = lower(regexp_replace(btrim(it->>'name'),'[[:space:]]','','g'))
         and (case when it ? 'lat' and nullif(it->>'lat','') is not null
                   then round(lat,3) = round((it->>'lat')::numeric,3)
                   else address = btrim(it->>'address') end)
       limit 1;
      v_dup := v_dup + 1;
    end;
    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into food_place_sources(place_id, channel, video_id, video_title, aired_at)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'new',v_new,'dup',v_dup);
end $fn$;

/* ── 9. RLS · 권한 ────────────────────────────────────
   테이블은 전부 잠그고 RPC로만 연다. 익명도 '보기'는 되어야 검색엔진이 색인한다.        */
alter table public.food_channels      enable row level security;
alter table public.food_places        enable row level security;
alter table public.food_place_sources enable row level security;
alter table public.food_visits        enable row level security;
alter table public.food_saves         enable row level security;

-- 직접 SELECT 는 열지 않는다(정책 없음 = 전면 차단). 읽기는 security definer RPC 로만.
-- 단, 내 도장·내 찜은 본인 것만 직접 읽을 수 있게 둔다(실시간 구독용).
drop policy if exists food_visits_mine on public.food_visits;
create policy food_visits_mine on public.food_visits for select using (user_id = auth.uid());
drop policy if exists food_saves_mine on public.food_saves;
create policy food_saves_mine  on public.food_saves  for select using (user_id = auth.uid());

grant select on public.food_visits, public.food_saves to authenticated;

revoke all on function public.food_ingest(jsonb) from public, anon, authenticated;

grant execute on function public.food_map(numeric,numeric,numeric,numeric,text,text,boolean,int) to anon, authenticated;
grant execute on function public.food_channel_stats()      to anon, authenticated;
grant execute on function public.food_place_detail(uuid)   to anon, authenticated;
grant execute on function public.food_region_of(text)      to anon, authenticated;
grant execute on function public.food_toggle_visit(uuid)   to authenticated;
grant execute on function public.food_toggle_save(uuid)    to authenticated;
grant execute on function public.food_submit(text,text,numeric,numeric,text,text) to authenticated;

/* ── 10. 채널 시드 ────────────────────────────────────
   ⚠️ yt_channel_id 는 비워 둔다. 채널 ID를 손으로 적으면 틀린 채널을 긁어도 아무도 모른다.
      collect-food-places 가 yt_query 로 검색해 ID를 확정한 뒤 여기에 캐시한다.
   TV 방송(kind='tv')은 공식 채널의 클립 업로드를 대상으로 한다.                          */
insert into public.food_channels (slug, name, kind, yt_query, sort) values
  ('ttoganjib',   '또간집',            'yt', '또간집',                 10),
  ('meogeulteonde','먹을텐데',         'yt', '먹을텐데 성시경',        20),
  ('tzuyang',     '쯔양',              'yt', '쯔양',                   30),
  ('jeonhyeonmu', '전현무계획',        'tv', '전현무계획 맛집',        40),
  ('baekban',     '허영만의 백반기행', 'tv', '백반기행 허영만',        50),
  ('matnyeoseok', '맛있는 녀석들',     'tv', '맛있는 녀석들',          60),
  ('kimsawon',    '김사원세끼',        'yt', '김사원세끼',             70),
  ('bapsang',     '한국인의 밥상',     'tv', '한국인의 밥상',          80),
  ('heukbaek',    '흑백요리사',        'tv', '흑백요리사 식당',        90),
  ('dongne',      '동네 한 바퀴',      'tv', '동네 한 바퀴 맛집',     100)
on conflict (slug) do nothing;

/* ── 11. 가드 — 되돌리면 마이그레이션이 실패한다 ────── */
do $chk$
declare n int;
begin
  -- 지역 매칭이 살아 있는가. 이게 깨지면 전국 맛집이 엉뚱한 동네에 꽂힌다.
  -- 광역시 '구'는 접미사를 유지하는 쪽 — 여기가 제일 잘 깨진다.
  if food_region_of('부산광역시 중구 남포길 12')
     is distinct from (select code from weather_regions where parent='busan' and name='중구') then
    raise exception '부산 중구 매칭이 틀렸다 — weather_regions 이름 규칙이 바뀌었다';
  end if;
  if food_region_of('경상남도 양산시 물금읍 백호로 38-1') is null then
    raise exception '시군구 매칭이 죽었다'; end if;
  if food_region_of('경기도 광주시 오포읍') = 'gwangju' then
    raise exception '경기 광주시가 광주광역시로 갔다 — 시도 판별 순서가 뒤집혔다'; end if;
  if food_region_of('강원특별자치도 고성군 간성읍') = food_region_of('경상남도 고성군 고성읍') then
    raise exception '강원 고성과 경남 고성이 같은 코드로 갔다'; end if;

  select count(*) into n from food_channels where active;
  if n < 5 then raise exception '채널 시드가 %개뿐이다', n; end if;
end $chk$;

/* ── 12. 동네 중심 좌표 ───────────────────────────────
   ⚠️ weather_search 는 code/name/sido/temp 만 돌려준다 — 좌표가 없다.
      지도를 내 동네로 옮기려면 좌표가 필요한데, 날씨 RPC 를 고치면 날씨 쪽이 흔들린다.
      그래서 맛집 전용으로 따로 뽑는다.                                                   */
create or replace function public.food_region_center(p_region text)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', code is not null, 'code', code, 'name', name,
                            'lat', lat, 'lon', lon,
                            'zoom', case when kind = 'sido' then 10 else 13 end)
    from weather_regions where code = p_region;
$fn$;
grant execute on function public.food_region_center(text) to anon, authenticated;
