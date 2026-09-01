-- 여행 — 맛집의 쌍둥이, 다만 무대가 전 세계다 (2026-09-01)
--
-- 사장님 지시: "해외는 여행 유튜버가 간 곳을 기본데이터로 해야 한다. 국내도 마찬가지고."
--   → 그래서 이 스키마의 중심은 장소가 아니라 **영상**이다. 맛집이 뒤늦게 방향을 뒤집어
--     얻은 결론(harvest-creator-places)을 여행은 처음부터 그렇게 시작한다.
--     장소는 태어날 때부터 '누가 어느 영상에서 갔는지'를 달고 온다.
--
-- ⚖️ 원칙은 맛집과 같다 — 남의 편집물(여행 지도 서비스·블로그 큐레이션)을 복제하지 않는다.
--   사실(장소 이름·좌표)은 보호 대상이 아니므로 원본에서 직접 만든다:
--   유튜브 Data API(공식) → LLM 추출 → **실재 검증**(위키데이터/OSM/관광공사) → 우리 집계.
--
-- 🌍 맛집과 다른 점 — 지역 모델
--   맛집은 weather_regions(시군구 133곳)에 묶여 있다. 전 세계엔 그런 코드가 없다.
--   그래서 country_code(ISO-3166 alpha-2) + city 문자열로 잡는다. 국내 행은 나중에
--   food_region_of() 로 region 을 채워 맛집과 같은 지역 필터에 태울 수 있게 컬럼만 열어둔다.
--
-- ⚖️ 좌표 출처를 행마다 기록한다(geo_source). 이유가 있다:
--   · wikidata = CC0 (권리 걱정 없음)
--   · osm      = ODbL (표시 의무 + 파생 DB 조항). 지금은 '실재 확인 + 좌표' 용도로만 쓰고
--                화면에 © OpenStreetMap contributors 를 띄운다. 나중에 정책이 바뀌면
--                이 컬럼으로 OSM 유래 행만 골라 교체할 수 있다. 출처를 안 남기면 그때 못 가른다.
--   · tour     = 한국관광공사(공공누리) · naver = 네이버 지역검색 · user = 유저 제보

/* ── 1. 여행 크리에이터 ────────────────────────────────
   ⚠️ 채널 ID(UC…)를 미리 넣는 게 돈이다. search.list 는 100유닛이라 40채널이면 4,000유닛 —
      하루 한도 10,000 중 핫튜브·맛집이 이미 6~7천을 쓴다. 공개된 채널 링크에서 UC 를
      미리 확보해 박아두면 그 비용이 0이 된다.                                            */
create table if not exists public.travel_channels (
  slug           text primary key,
  name           text not null,
  kind           text not null default 'yt' check (kind in ('yt','tv','guide')),
  yt_channel_id  text,                     -- UC… 있으면 업로드 플레이리스트로 훑는다(50편/1유닛)
  yt_handle      text,                     -- @핸들 — channels.list?forHandle 은 1유닛
  thumb          text,
  subs           bigint,                   -- 시드 시점 구독자(정렬 참고용, 갱신하지 않는다)
  active         boolean not null default true,
  sort           int not null default 0,
  resolved       boolean not null default false,   -- 채널 ID 해석 완료 여부
  last_video_at  timestamptz,
  last_synced_at timestamptz
);
create index if not exists travel_channels_queue
  on public.travel_channels (active, last_synced_at nulls first);

/* ── 2. 영상 원장 ──────────────────────────────────────
   description 을 함께 저장한다. playlistItems 가 snippet 에 얹어주므로 추가 비용이 0이다.
   ⚠️ 도장(harvested_at)은 **결과와 무관하게** 찍는다. 맛집에서 네 번 밟은 함정이다 —
      실패한 영상을 안 찍으면 매 회차 같은 영상을 다시 LLM 에 태운다.                      */
create table if not exists public.travel_videos (
  channel      text not null references public.travel_channels(slug) on delete cascade,
  video_id     text not null,
  title        text not null,
  description  text,
  published_at timestamptz,
  harvested_at timestamptz,
  created_at   timestamptz not null default now(),
  primary key (channel, video_id)
);
create index if not exists travel_videos_harvest
  on public.travel_videos (channel, harvested_at nulls first);

/* ── 3. 장소 ───────────────────────────────────────────
   name 은 한국어 표기를 우선한다(우리 유저가 읽는 이름). 검증·재조회는 name_en/name_local 로 한다 —
   OSM·위키데이터에 '기요미즈데라'로는 잘 안 걸리고 'Kiyomizu-dera'·'清水寺'로는 걸린다.  */
create table if not exists public.travel_places (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_local    text,
  name_en       text,
  country_code  text,                      -- 'JP','VN','KR' … 대문자 2자
  country       text,                      -- 한국어 국가명('일본')
  city          text,
  address       text,
  lat           numeric,
  lon           numeric,
  category      text,                      -- 사찰·전망대·해변·식당·카페 …
  kind          text not null default 'spot'
                check (kind in ('spot','food','stay','activity')),
  wikidata_qid  text,
  osm_ref       text,                      -- 'node/123456' — 재조회·출처 추적용
  geo_source    text,                      -- wikidata | osm | naver | tour | user
  photo         text,
  photo_credit  text,
  photo_source  text,
  region        text references public.weather_regions(code) on delete set null,  -- 국내 행만
  origin        text not null default 'yt' check (origin in ('yt','gov','user')),
  status        text not null default 'live' check (status in ('live','pending','hidden')),
  submitted_by  uuid references auth.users(id) on delete set null,
  -- 중복 판정용. 한글/현지어/영문이 섞여 들어오므로 셋 중 **영문을 우선**해 정규화한다.
  norm_name     text generated always as (
                  lower(regexp_replace(coalesce(nullif(name_en,''), name), '[[:space:]]', '', 'g'))
                ) stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 같은 위키데이터 항목이면 같은 곳이다(가장 강한 신호).
create unique index if not exists travel_places_qid
  on public.travel_places (wikidata_qid) where wikidata_qid is not null;
-- 이름 + 반경 100m. 전 세계에서 'Blue Bottle Coffee'는 수백 곳이라 이름만으로는 절대 못 묶는다.
create unique index if not exists travel_places_dedupe
  on public.travel_places (norm_name, round(lat,3), round(lon,3))
  where lat is not null and lon is not null;
create unique index if not exists travel_places_dedupe_noloc
  on public.travel_places (norm_name, coalesce(country_code,''), coalesce(city,''))
  where lat is null or lon is null;

create index if not exists travel_places_country on public.travel_places (country_code, created_at desc) where status='live';
create index if not exists travel_places_bbox    on public.travel_places (lat, lon) where status='live';
create index if not exists travel_places_new     on public.travel_places (created_at desc) where status='live';

/* ── 4. 출처 — 누가 어느 영상에서 갔나 ──────────────────
   한 곳이 곽튜브에도 빠니보틀에도 나오면 그게 '검증된 여행지'의 신호다(맛집과 같은 논리). */
create table if not exists public.travel_place_sources (
  id          bigserial primary key,
  place_id    uuid not null references public.travel_places(id) on delete cascade,
  channel     text not null references public.travel_channels(slug) on delete cascade,
  video_id    text,
  video_title text,
  aired_at    timestamptz,
  created_at  timestamptz not null default now()
);
create unique index if not exists travel_sources_uk
  on public.travel_place_sources (place_id, channel, video_id) nulls not distinct;
create index if not exists travel_sources_ch on public.travel_place_sources (channel, created_at desc);
create index if not exists travel_sources_place on public.travel_place_sources (place_id);

/* ── 5. 가본 곳 · 찜 ───────────────────────────────────  */
create table if not exists public.travel_visits (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   uuid not null references public.travel_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create table if not exists public.travel_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  place_id   uuid not null references public.travel_places(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);

/* ── 6. 지오코딩 하루 장부 ──────────────────────────────
   Nominatim 은 공짜지만 공짜라서 더 조심해야 한다(정책: 초당 1회, 대량 지오코딩 금지).
   맛집의 naver_take/refund 와 같은 구조로 하루 몫을 끊는다 — 장부가 없으면
   함수가 폭주해 IP 가 차단되고, 그때는 '왜 수집이 멈췄는지' 가 또 안 보인다.            */
create table if not exists public.travel_geo_budget (
  day    date primary key,
  used   int  not null default 0,
  cap    int  not null default 1500
);

create or replace function public.travel_geo_take(p_want int)
returns int language plpgsql security definer set search_path = public as $fn$
declare v_cap int; v_used int; v_give int;
begin
  insert into travel_geo_budget(day) values (current_date) on conflict (day) do nothing;
  select cap, used into v_cap, v_used from travel_geo_budget where day = current_date for update;
  v_give := greatest(least(coalesce(p_want,0), v_cap - v_used), 0);
  update travel_geo_budget set used = used + v_give where day = current_date;
  return v_give;
end $fn$;

create or replace function public.travel_geo_refund(p_n int)
returns void language sql security definer set search_path = public as $fn$
  update travel_geo_budget set used = greatest(used - greatest(coalesce(p_n,0),0), 0)
   where day = current_date;
$fn$;

/* ── 7. 적재 — 장소 + 출처를 한 번에 ───────────────────
   맛집 food_ingest 와 같은 계약. 다른 건 dedupe 판정 순서다:
     ① 위키데이터 QID 가 같으면 같은 곳
     ② 이름(영문 우선) + 100m 격자
     ③ 좌표가 없으면 이름 + 국가 + 도시                                                  */
create or replace function public.travel_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0; v_key text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    v_key := lower(regexp_replace(
               coalesce(nullif(btrim(it->>'name_en'),''), btrim(it->>'name')),
               '[[:space:]]','','g'));
    begin
      insert into travel_places(
        name, name_local, name_en, country_code, country, city, address,
        lat, lon, category, kind, wikidata_qid, osm_ref, geo_source,
        photo, photo_credit, photo_source, origin)
      values (
        btrim(it->>'name'), nullif(btrim(it->>'name_local'),''), nullif(btrim(it->>'name_en'),''),
        upper(nullif(btrim(it->>'country_code'),'')), nullif(btrim(it->>'country'),''),
        nullif(btrim(it->>'city'),''), nullif(btrim(it->>'address'),''),
        nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
        nullif(btrim(it->>'category'),''), coalesce(nullif(it->>'kind',''),'spot'),
        nullif(btrim(it->>'wikidata_qid'),''), nullif(btrim(it->>'osm_ref'),''),
        nullif(btrim(it->>'geo_source'),''),
        nullif(btrim(it->>'photo'),''), nullif(btrim(it->>'photo_credit'),''),
        nullif(btrim(it->>'photo_source'),''),
        coalesce(nullif(it->>'origin',''),'yt'))
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from travel_places
       where (wikidata_qid is not null and wikidata_qid = nullif(btrim(it->>'wikidata_qid'),''))
          or (norm_name = v_key and (
                (nullif(it->>'lat','') is not null and lat is not null
                 and round(lat,3) = round((it->>'lat')::numeric,3)
                 and round(lon,3) = round((it->>'lon')::numeric,3))
             or (lat is null
                 and coalesce(country_code,'') = coalesce(upper(nullif(btrim(it->>'country_code'),'')),'')
                 and coalesce(city,'') = coalesce(nullif(btrim(it->>'city'),''),''))
          ))
       limit 1;
      v_dup := v_dup + 1;
    end;

    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into travel_place_sources(place_id, channel, video_id, video_title, aired_at)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz)
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new', v_new, 'dup', v_dup);
end $fn$;

/* ── 8. 수확 큐 ────────────────────────────────────────
   ⚠️ 맛집은 '설명에 도로명 주소가 있는 영상'만 골랐다. 여행엔 그 관문을 쓰면 안 된다 —
      여행 영상 설명에 주소를 적는 크리에이터는 거의 없다(장소가 제목·본문에 이름으로만 나온다).
      대신 **최신순으로 아직 안 물어본 영상**을 준다. 헛수고는 LLM 이 빈 배열을 주는 것으로 끝난다.  */
create or replace function public.travel_videos_to_harvest(p_channel text, p_limit integer default 20)
returns table(video_id text, title text, description text, published_at timestamptz)
language sql stable security definer set search_path = public as $$
  select v.video_id, v.title, v.description, v.published_at
    from travel_videos v
   where v.channel = p_channel
     and v.harvested_at is null
   order by v.published_at desc nulls last
   limit greatest(coalesce(p_limit, 20), 1);
$$;

create or replace function public.travel_videos_mark_harvested(p_ids text[])
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update travel_videos set harvested_at = now()
   where video_id = any(p_ids) and harvested_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

/* 다음에 훑을 채널을 준다(오래 안 본 것부터). 엣지 유휴 150초에 걸리지 않게 한 회차에 몇 개만. */
create or replace function public.travel_channels_next(p_n integer default 6)
returns table(slug text, name text, yt_channel_id text, yt_handle text)
language sql stable security definer set search_path = public as $$
  select c.slug, c.name, c.yt_channel_id, c.yt_handle
    from travel_channels c
   where c.active
   order by c.last_synced_at nulls first, c.sort, c.slug
   limit greatest(coalesce(p_n, 6), 1);
$$;

/* ── 9. RLS ────────────────────────────────────────────  */
alter table public.travel_channels      enable row level security;
alter table public.travel_places        enable row level security;
alter table public.travel_place_sources enable row level security;
alter table public.travel_videos        enable row level security;
alter table public.travel_visits        enable row level security;
alter table public.travel_saves         enable row level security;

drop policy if exists travel_channels_read on public.travel_channels;
create policy travel_channels_read on public.travel_channels
  for select to anon, authenticated using (active);

drop policy if exists travel_places_read on public.travel_places;
create policy travel_places_read on public.travel_places
  for select to anon, authenticated using (status = 'live');

drop policy if exists travel_sources_read on public.travel_place_sources;
create policy travel_sources_read on public.travel_place_sources
  for select to anon, authenticated using (true);

-- 영상 원장은 내부용(유튜브 메타데이터 보관 최소화). 결과는 travel_place_sources 로만 나간다.
grant select, insert, update, delete on public.travel_videos to service_role;

drop policy if exists travel_visits_own on public.travel_visits;
create policy travel_visits_own on public.travel_visits
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists travel_saves_own on public.travel_saves;
create policy travel_saves_own on public.travel_saves
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on function public.travel_ingest(jsonb)                    from anon, authenticated;
revoke all on function public.travel_videos_to_harvest(text,integer)  from anon, authenticated;
revoke all on function public.travel_videos_mark_harvested(text[])    from anon, authenticated;
revoke all on function public.travel_channels_next(integer)           from anon, authenticated;
revoke all on function public.travel_geo_take(int)                    from anon, authenticated;
revoke all on function public.travel_geo_refund(int)                  from anon, authenticated;
