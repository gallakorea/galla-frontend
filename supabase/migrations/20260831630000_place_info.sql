-- 가게 정보 보강 — 전화·영업시간·평점.
--
-- 왜: 참조 서비스 카드가 좋아 보이는 건 사진 때문이 아니다(저쪽도 사진 없는 집은
--   채널 로고로 때운다). **전화번호·영업시간·대표메뉴**가 있어서다.
--   우리는 phone 컬럼이 있는데 **0건**이었다 — 네이버 지역검색이 요즘 전화번호를 안 준다.
--
-- ⚖️ 구글 Places 에서 사진과 **같은 호출로** 함께 받는다(추가 호출 0).
--    구글 약관상 Place ID 외 콘텐츠는 최대 30일 캐시라, 사진과 같은 주기로 갱신한다.
--    표시할 때 출처(Google)를 밝힌다.
alter table food_places add column if not exists hours      jsonb;      -- 요일별 영업시간 텍스트
alter table food_places add column if not exists rating     numeric(2,1);
alter table food_places add column if not exists rating_n   integer;
alter table food_places add column if not exists price_level text;
alter table food_places add column if not exists info_src   text;       -- 'google'
alter table food_places add column if not exists info_at    timestamptz;

create or replace function food_place_info_set(p_items jsonb)
returns jsonb language sql security definer set search_path = public as $$
  with up as (
    update food_places p set
      phone       = coalesce(nullif(x->>'phone',''), p.phone),
      hours       = coalesce(x->'hours', p.hours),
      rating      = coalesce(nullif(x->>'rating','')::numeric, p.rating),
      rating_n    = coalesce(nullif(x->>'rating_n','')::int, p.rating_n),
      price_level = coalesce(nullif(x->>'price_level',''), p.price_level),
      info_src    = 'google', info_at = now()
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where p.id = (x->>'place_id')::uuid
    returning 1)
  select jsonb_build_object('ok', true, 'n', (select count(*) from up));
$$;
grant execute on function food_place_info_set(jsonb) to service_role;
