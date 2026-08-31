-- 스윕 회차(wave) — 같은 채널을 다시 돌 때 **다른 표현·다른 지역**을 훑게 한다.
--
-- 왜: 지금까지 스윕은 매번 똑같은 조합(표현 4 × 시도 17)만 돌았다. 한 번 긁고 나면
-- 두 번째부터는 거의 같은 결과라 새 장소가 안 늘었다. 회차를 세어서 그 값으로
-- 표현·지역 창을 밀면, 한 실행의 비용은 그대로인데 며칠에 걸쳐 훨씬 넓게 덮인다.
alter table food_channels add column if not exists discover_wave integer not null default 0;

create or replace function food_discover_stamp(p_slug text)
returns void language sql security definer set search_path = public as $$
  update food_channels
     set last_discovered_at = now(),
         discover_wave = discover_wave + 1
   where slug = p_slug;
$$;

-- 큐가 회차도 같이 알려준다 — 함수가 어느 창을 쓸지 정할 수 있게.
create or replace function food_discover_queue(p_n integer default 4)
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'wave', discover_wave)), '[]'::jsonb)
    from (select slug, discover_wave from food_channels
           where active
           order by last_discovered_at asc nulls first, sort
           limit greatest(coalesce(p_n, 4), 1)) t;
$$;

grant execute on function food_discover_stamp(text) to service_role;
grant execute on function food_discover_queue(integer) to service_role;
