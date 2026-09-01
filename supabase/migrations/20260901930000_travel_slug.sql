-- 여행지 검색용 주소 (2026-09-01)
--
-- 목표: /travel/기자의-피라미드-b29e54ae
--   · 사람이 읽는 한글이 주소에 들어간다 — 검색결과에서 클릭률이 다르다
--   · 뒤에 붙는 8자는 id 앞자리다. **주소를 푸는 건 이 8자뿐이고 slug 는 장식이다.**
--     이름이 나중에 한글로 바뀌어도(지금 영문 9곳이 한글화 크론을 기다린다)
--     옛 주소가 죽지 않는다 — slug 가 달라도 같은 곳을 찾아내고 새 주소로 301 한다.
-- ⚠️ 색인이 시작된 뒤에 주소 모양을 바꾸는 건 비싸다. 열기 전에 정한다.
-- ⚠️ sid 는 유니크로 걸지 않는다. 5,655행에서 8자 앞자리가 겹칠 확률은 사실상 0이지만,
--    유니크로 걸면 그 만에 하나가 **수확 INSERT 를 죽인다**. 겹치면 먼저 찾은 행을 쓴다.

alter table travel_places
  add column if not exists slug text,
  add column if not exists sid  text generated always as (left(id::text, 8)) stored;

create index if not exists travel_places_sid_idx on travel_places (sid);

-- 한글은 살리고 나머지 구분자는 하이픈으로. 영문은 소문자로.
create or replace function travel_slugify(p_name text)
returns text language sql immutable as $$
  select nullif(btrim(regexp_replace(
           regexp_replace(lower(coalesce(p_name,'')),
                          '[^가-힣ㄱ-ㅎㅏ-ㅣa-z0-9]+', '-', 'g'),
           '-{2,}', '-', 'g'), '-'), '')
$$;

create or replace function travel_places_slug_tg()
returns trigger language plpgsql as $$
begin
  new.slug := coalesce(left(travel_slugify(new.name), 60), 'place');
  return new;
end $$;

drop trigger if exists travel_places_slug on travel_places;
create trigger travel_places_slug
  before insert or update of name on travel_places
  for each row execute function travel_places_slug_tg();

update travel_places
   set slug = coalesce(left(travel_slugify(name), 60), 'place')
 where slug is null;
