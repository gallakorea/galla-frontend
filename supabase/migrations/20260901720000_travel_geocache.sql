-- 지오코딩 캐시 (2026-09-01)
--
-- 수확 속도 실측: 시간당 130편. 35,000편이면 11일이다.
-- 회차 리포트를 보면 이유가 명확하다 — geoCalls 49~77 건 × 1.1초 = 회차의 대부분이 **대기**다.
-- 그런데 크리에이터들은 같은 곳을 반복해서 간다(도쿄·오사카·다낭·방콕…).
-- 같은 질의를 다시 묻지 않으면 그 시간이 통째로 사라진다.
--
-- ⚠️ 못 찾은 질의도 캐시한다. 안 그러면 실패한 이름을 매번 다시 물어본다(맛집에서 밟은 함정).
-- ⚠️ 캐시는 '우리가 만든 사실'이 아니라 남의 응답 보관이다 — 좌표만 갖고, 30일 지나면 다시 묻는다.
create table if not exists public.travel_geocache (
  key        text primary key,          -- 'JP|kiyomizudera,kyoto'
  hit        boolean not null,          -- false = 찾아봤지만 없었다
  payload    jsonb,                     -- fromOsm 결과 그대로
  hits       int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists travel_geocache_age on public.travel_geocache (created_at);
grant select, insert, update on public.travel_geocache to service_role;

create or replace function public.travel_geocache_get(p_key text)
returns jsonb language sql volatile security definer set search_path to 'public' as $fn$
  update travel_geocache set hits = hits + 1
   where key = p_key and created_at > now() - interval '30 days'
  returning jsonb_build_object('hit', hit, 'payload', payload);
$fn$;

create or replace function public.travel_geocache_put(p_key text, p_hit boolean, p_payload jsonb)
returns void language sql volatile security definer set search_path to 'public' as $fn$
  insert into travel_geocache(key, hit, payload) values (p_key, p_hit, p_payload)
  on conflict (key) do update set hit = excluded.hit, payload = excluded.payload,
                                  created_at = now();
$fn$;
revoke all on function public.travel_geocache_get(text)               from anon, authenticated;
revoke all on function public.travel_geocache_put(text,boolean,jsonb) from anon, authenticated;
