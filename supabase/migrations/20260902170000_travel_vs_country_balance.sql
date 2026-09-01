-- 대진이 국내로 쏠렸다 (2026-09-02)
--
-- '마이산 벚꽃길 vs 수승대 썰매장', '광양 매화마을 vs 천주산'… 8쌍 중 5쌍이 국내였다.
-- 풀은 국내 151 / 해외 151 로 반반인데도 그랬다. 원인은 뽑는 순서다:
-- 같은-나라 쌍에서 **장소를 먼저 무작위로 뽑으면 절반이 한국**이고, 그러면 그 쌍은 국내가 된다.
-- → 같은-나라 쌍은 **나라를 먼저 고른다**(2곳 이상 가진 나라 중에서 균등하게).
--    한국도 한 나라로 취급되므로 자연히 자리를 나눠 갖는다.
create or replace function travel_vs_bracket()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare used uuid[] := '{}'; pairs jsonb := '[]'::jsonb;
        a record; b record; band int; same_country boolean; cc text; i int;
begin
  for i in 1..8 loop
    same_country := (i % 2) = 1;

    if same_country then
      /* 나라 먼저. 아직 안 쓴 곳이 2곳 이상 남은 나라 중에서 균등하게 하나. */
      select v.country_code into cc
        from travel_vs_pool v
       where not (v.id = any(used))
       group by v.country_code having count(*) >= 2
       order by random() limit 1;
    else
      cc := null;
    end if;

    select v.* into a
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used))
       and (cc is null or v.country_code = cc)
     order by random() * (1 + coalesce(r.wins + r.losses, 0))
     limit 1;
    exit when a.id is null;
    used := used || a.id;

    band := case when a.km < 1500 then 1 when a.km < 4000 then 2
                 when a.km < 9000 then 3 else 4 end;

    select v.* into b
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used))
       and case when same_country
                then v.country_code = a.country_code
                else v.country_code <> a.country_code
                     and case when v.km < 1500 then 1 when v.km < 4000 then 2
                              when v.km < 9000 then 3 else 4 end = band
           end
     order by random() * (1 + coalesce(r.wins + r.losses, 0))
     limit 1;
    if b.id is null then
      select v.* into b from travel_vs_pool v
       where not (v.id = any(used))
         and case when v.km < 1500 then 1 when v.km < 4000 then 2
                  when v.km < 9000 then 3 else 4 end = band
       order by random() limit 1;
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
