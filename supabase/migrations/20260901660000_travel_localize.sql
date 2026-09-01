-- 지역명 한글화 원장 (2026-09-01) — 사장님: "크롤 끝나면 지역명 한글로 정리해"
--
-- 화면에 'Gauteng'·'Kyoto'·'Tokashiki' 처럼 영문 지역명이 섞여 있다.
-- 정방향 지오코딩이 영어로 준 값이 그대로 저장된 자리다.
--
-- ⚠️ 이름을 바꾸면 travel_area_photos 의 키(code = 'JP|교토부')도 같이 바뀌어야 한다.
--    안 그러면 지역 타일의 배너가 통째로 사라진다.
-- ⚠️ 한 번 고친 이름을 다시 물어보지 않도록 원장에 남긴다(외부 API 를 매번 두드릴 이유가 없다).
create table if not exists public.travel_geo_ko (
  country_code text not null,
  raw          text not null,
  ko           text,                 -- null = 찾아봤지만 한국어 표기가 없다
  src          text,                 -- wikidata | osm
  tried_at     timestamptz not null default now(),
  primary key (country_code, raw)
);
alter table public.travel_geo_ko enable row level security;
grant select, insert, update on public.travel_geo_ko to service_role;

/* 한글화가 필요한 지역/도시 — 한글이 한 글자도 없는 이름만. */
create or replace function public.travel_names_to_localize(p_limit int default 30)
returns table(country_code text, raw text, kind text, lat numeric, lon numeric)
language sql stable security definer set search_path to 'public' as $fn$
  with cand as (
    select p.country_code, btrim(p.admin1) raw, 'admin1'::text kind,
           avg(p.lat) lat, avg(p.lon) lon
      from travel_places p
     where p.status='live' and p.admin1 is not null and p.admin1 !~ '[가-힣]'
     group by 1,2,3
    union all
    select p.country_code, btrim(p.city), 'city',
           avg(p.lat), avg(p.lon)
      from travel_places p
     where p.status='live' and p.city is not null and p.city !~ '[가-힣]'
     group by 1,2,3
  )
  select c.country_code, c.raw, c.kind, c.lat, c.lon
    from cand c
   where c.country_code is not null and length(c.raw) > 1
     and not exists (select 1 from travel_geo_ko g
                      where g.country_code = c.country_code and g.raw = c.raw)
   limit greatest(coalesce(p_limit, 30), 1);
$fn$;

/* 결과 적용 — 원장에 남기고, 장소·배너 키를 함께 갈아끼운다. */
create or replace function public.travel_localize_apply(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_cc text; v_raw text; v_ko text; n int := 0; rows int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_cc := upper(btrim(it->>'country_code'));
    v_raw := btrim(it->>'raw');
    v_ko := nullif(btrim(it->>'ko'),'');

    insert into travel_geo_ko(country_code, raw, ko, src, tried_at)
    values (v_cc, v_raw, v_ko, nullif(it->>'src',''), now())
    on conflict (country_code, raw) do update
      set ko = excluded.ko, src = excluded.src, tried_at = now();
    n := n + 1;
    continue when v_ko is null;

    update travel_places set admin1 = v_ko, updated_at = now()
     where country_code = v_cc and btrim(admin1) = v_raw;
    get diagnostics rows = row_count;
    update travel_places set city = v_ko, updated_at = now()
     where country_code = v_cc and btrim(city) = v_raw;

    /* 배너 키도 같이 옮긴다. 목적지에 이미 행이 있으면 옛 행을 버린다. */
    if exists (select 1 from travel_area_photos where scope='area' and code = v_cc || '|' || v_ko) then
      delete from travel_area_photos where scope='area' and code = v_cc || '|' || v_raw;
    else
      update travel_area_photos set code = v_cc || '|' || v_ko, name = v_ko
       where scope='area' and code = v_cc || '|' || v_raw;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n);
end $fn$;

revoke all on function public.travel_names_to_localize(int) from anon, authenticated;
revoke all on function public.travel_localize_apply(jsonb)  from anon, authenticated;
