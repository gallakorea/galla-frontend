-- 첫 판 '아는 곳' 규칙을 없앤다 (2026-09-02)
--
-- 명소만 남기고 나니 이 풀에 **믿을 만한 유명세 신호가 없다**는 게 드러났다:
--   · creators >= 3 → 302곳 중 3곳뿐. 규칙이 사실상 안 걸린다.
--   · 인증(certs)  → 0곳. 국가유산·유네스코는 크리에이터 발자국이 없다.
--   · 구독자 합    → 최악이다. 1,190만 채널이 간 곳이 '몬머스 커피 컴퍼니'다.
--     큰 채널이 갔다는 건 그 채널이 크다는 뜻이지 그 장소가 유명하다는 뜻이 아니다.
-- 없는 신호를 억지로 쓰면 첫 판에 커피숍이 나온다. 규칙을 지운다.
-- 풀 자체가 이미 '한국 여행 유튜버가 실제로 간 곳'이라 한 번 걸러진 집합이다.
create or replace function travel_vs_bracket()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare used uuid[] := '{}'; pairs jsonb := '[]'::jsonb;
        a record; b record; band int; same_country boolean; i int;
begin
  for i in 1..8 loop
    same_country := (i % 2) = 1;      -- 홀수 쌍은 같은 나라, 짝수 쌍은 거리대만 맞춘다

    select v.* into a
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used))
     order by random() * (1 + coalesce(r.wins + r.losses, 0))   -- 덜 나온 곳부터
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
