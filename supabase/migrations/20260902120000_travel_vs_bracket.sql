-- 어디 갈래를 16강 토너먼트로 (2026-09-02)
--
-- 15판을 적응형으로 붙이려다 바꿨다. 15 = 8+4+2+1, 즉 **정확히 16강 대진**이다.
--   · 진짜 우승지가 나온다 — 결과 카드에 올릴 '내 1위'가 생긴다
--   · 판마다 서버를 부르지 않는다. 16곳을 한 번에 받아 클라이언트가 대진을 돌린다
--     (표는 뒤로 따로 보낸다) — 탭 반응이 즉각적이어야 15판을 끝까지 한다
--   · 뒤로 갈수록 나라·거리가 섞이는데, 그게 오히려 재미다(파타야 vs 삿포로)
--
-- 1회전 8쌍만 '비교 가능하게' 짜면 된다. 규칙은 travel_vs_pair 와 같다:
-- 같은 급(scale), 같은 나라 또는 같은 거리대. 앞 2쌍은 여러 유튜버가 간 곳으로 —
-- 첫 판을 모르는 곳으로 열면 그대로 이탈한다.
create or replace function travel_vs_bracket()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare used uuid[] := '{}'; pairs jsonb := '[]'::jsonb;
        a record; b record; band int; famous boolean; i int;
begin
  for i in 1..8 loop
    famous := i <= 2;

    select v.* into a
      from travel_vs_pool v
      left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(used))
       and (not famous or v.creators >= 3)
     order by random() * (1 + coalesce(r.wins + r.losses, 0))   -- 덜 나온 곳부터
     limit 1;
    if a.id is null then                                        -- 유명한 곳이 동났다
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
       and (v.country_code = a.country_code
            or case when v.km < 1500 then 1 when v.km < 4000 then 2
                    when v.km < 9000 then 3 else 4 end = band)
     order by (v.country_code = a.country_code) desc, random() * (1 + coalesce(r.wins + r.losses, 0))
     limit 1;
    if b.id is null then           -- 짝이 없으면 조건을 푼다. 대진이 비는 것보다 낫다.
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

revoke all on function travel_vs_bracket() from public;
grant execute on function travel_vs_bracket() to anon, authenticated;
