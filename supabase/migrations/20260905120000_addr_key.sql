-- 주소 매칭을 등호 조인으로 바꾼다.
-- `place.address like '%' || 영상주소 || '%'` 는 가게 3.7만 × 영상 1.4만이라 statement timeout 이다.
-- 양쪽에서 **같은 규칙으로 뽑은 주소 키**를 박아두고 등호로 붙인다 — 인덱스가 먹는다.
alter table food_places add column if not exists addr_key text;
create or replace function public.food_addr_key(p text) returns text
language sql immutable as $$
  select regexp_replace(
    (regexp_match(coalesce(p,''),
      '([가-힣]+(?:시|군|구)[[:space:]]+[가-힣0-9]+(?:로|길)[[:space:]]*[0-9]+(?:-[0-9]+)?)'))[1],
    '[[:space:]]', '', 'g');
$$;
update food_places set addr_key = food_addr_key(address) where addr_key is null and address is not null;
create or replace function public.food_places_addr_key_t() returns trigger language plpgsql as $$
begin new.addr_key := food_addr_key(new.address); return new; end $$;
drop trigger if exists food_places_addr_key on food_places;
create trigger food_places_addr_key before insert or update of address
  on food_places for each row execute function public.food_places_addr_key_t();
create index if not exists food_places_addr_key_idx on food_places(addr_key) where addr_key is not null;

-- 채널을 가리지 않고 붙인다.
-- 실측: 출처에 적힌 채널의 영상에는 그 가게 이름이 **한 건도** 없었다(표본 1,500건 중 0).
-- 다른 채널 영상에는 16% 가 있었다. 즉 출처의 채널 표기를 믿고 그 채널 안에서만 찾는 것이
-- 매칭을 막고 있었다. 증거(주소가 적힌 영상)를 먼저 찾고, 그 영상의 채널을 사실로 삼는다.
create or replace function public.food_link_by_addr_global(p_limit integer default 100000)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_new int := 0; v_cand int := 0;
begin
  with v as (
    select v.channel, v.video_id, v.title, v.published_at,
           regexp_replace(m[1], '[[:space:]]', '', 'g') a
      from food_videos v
      join food_channels c on c.slug = v.channel and c.harvest,
           lateral regexp_matches(
             coalesce(v.description,'') || ' ' || coalesce(v.desc_i18n,'') || ' ' || coalesce(v.tags,''),
             '([가-힣]+(?:시|군|구)[[:space:]]+[가-힣0-9]+(?:로|길)[[:space:]]*[0-9]+(?:-[0-9]+)?)', 'g') m
  ),
  vv as (select * from v where length(a) >= 8),
  m as (
    select vv.channel, vv.video_id, vv.title, vv.published_at, p.id place_id
      from vv join food_places p on p.addr_key = vv.a
     where p.status = 'live'
     limit greatest(coalesce(p_limit, 100000), 1)
  ),
  /* ⚠️ 한 가게에 후보 영상이 둘 이상이면 통째로 버린다 — 누가 갔는지 틀리면 거짓말이 된다.
     한 영상이 여러 가게를 가리키는 건 정상이다(맛집 여러 곳 도는 영상). */
  one as (select * from m where place_id in (select place_id from m group by place_id having count(*) = 1)),
  ins as (
    insert into food_place_sources(place_id, channel, video_id, video_title, aired_at)
    select o.place_id, o.channel, o.video_id, left(o.title, 200), o.published_at from one o
    on conflict do nothing
    returning 1)
  select (select count(*) from m), (select count(*) from ins) into v_cand, v_new;
  return jsonb_build_object('ok', true, 'candidates', v_cand, 'new', v_new);
end $$;
revoke all on function public.food_link_by_addr_global(integer) from public, anon, authenticated;
