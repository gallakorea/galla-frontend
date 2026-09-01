-- 대진 품질 두 가지 (2026-09-02)
--
-- ① '태국' 이 장소로 들어와 있었다. scale 이 city 로 잘못 붙은 나라 행이다.
--    나라 이름과 장소 이름이 같으면 카드에서 뺀다 — '태국 vs 파타야'는 질문이 안 된다.
-- ② 8쌍이 전부 같은 나라로 나왔다. 같은 나라를 우선하는 규칙 때문인데, 8쌍 내내
--    그러면 단조롭다. 짝수 번째 쌍은 **거리대만 맞추고 나라는 일부러 섞는다**
--    (푸껫 vs 다낭 같은 판이 나온다).
create or replace view travel_vs_pool as
  select p.id, p.sid, p.slug, p.name, p.country, p.country_code,
         coalesce(p.city, p.admin1) as area, p.scale,
         travel_cover(p.id) as cover,
         round(travel_km(37.5665, 126.9780, p.lat, p.lon))::int as km,
         (select count(*) from travel_certs c where c.place_id = p.id)::int as certs,
         coalesce((select sum(distinct ch.subs) from travel_place_sources s
                     join travel_channels ch on ch.slug = s.channel
                    where s.place_id = p.id), 0)::bigint as subs,
         (select count(distinct s.channel) from travel_place_sources s
           where s.place_id = p.id)::int as creators
    from travel_places p
   where p.status = 'live'
     and p.scale in ('spot', 'city')
     and p.lat is not null
     and p.country is not null
     and p.name ~ '[가-힣]'
     and p.name <> p.country                       -- '태국' 같은 나라 행이 섞여 있었다
     and travel_cover(p.id) is not null
     and exists (select 1 from travel_place_sources s where s.place_id = p.id);

grant select on travel_vs_pool to anon, authenticated;

create or replace function travel_vs_bracket()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare used uuid[] := '{}'; pairs jsonb := '[]'::jsonb;
        a record; b record; band int; famous boolean; same_country boolean; i int;
begin
  for i in 1..8 loop
    famous := i <= 2;
    same_country := (i % 2) = 1;      -- 홀수 쌍은 같은 나라, 짝수 쌍은 거리대만 맞춘다

    select v.* into a
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used)) and (not famous or v.creators >= 3)
     order by random() * (1 + coalesce(r.wins + r.losses, 0))
     limit 1;
    if a.id is null then
      select v.* into a from travel_vs_pool v
       where not (v.id = any(used)) order by v.creators desc, random() limit 1;
    end if;
    exit when a.id is null;
    used := used || a.id;

    band := case when a.km < 1500 then 1 when a.km < 4000 then 2
                 when a.km < 9000 then 3 else 4 end;

    select v.* into b
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used))
       and v.scale = a.scale
       and (not famous or v.creators >= 3)
       and case when same_country
                then v.country_code = a.country_code
                else v.country_code <> a.country_code
                     and case when v.km < 1500 then 1 when v.km < 4000 then 2
                              when v.km < 9000 then 3 else 4 end = band
           end
     order by random() * (1 + coalesce(r.wins + r.losses, 0))
     limit 1;
    /* 조건을 단계적으로 푼다 — 대진이 비는 것보다 덜 어울리는 짝이 낫다 */
    if b.id is null then
      select v.* into b from travel_vs_pool v
       where not (v.id = any(used)) and v.scale = a.scale
         and case when v.km < 1500 then 1 when v.km < 4000 then 2
                  when v.km < 9000 then 3 else 4 end = band
       order by random() limit 1;
    end if;
    if b.id is null then
      select v.* into b from travel_vs_pool v
       where not (v.id = any(used)) and v.scale = a.scale order by random() limit 1;
    end if;
    if b.id is null then
      select v.* into b from travel_vs_pool v where not (v.id = any(used)) order by random() limit 1;
    end if;
    exit when b.id is null;
    used := used || b.id;

    pairs := pairs || jsonb_build_array(jsonb_build_array(to_jsonb(a), to_jsonb(b)));
  end loop;

  if jsonb_array_length(pairs) < 8 then
    return jsonb_build_object('ok', false, 'reason', 'pool_too_small',
                              'have', jsonb_array_length(pairs));
  end if;
  return jsonb_build_object('ok', true, 'pairs', pairs);
end $$;
