-- 🔴 콜 수가 아니라 **돈**을 센다.
--
-- 어제 사고의 기술적 뿌리: places_usage 는 '콜 수'만 셌다. 그런데 콜마다 값이 다르다.
--   Text Search Essentials              무료
--   Text Search Enterprise+Atmosphere   건당 약 ₩46   ← editorialSummary 한 필드가 이 등급을 부른다
--   Place Details Pro                   건당 약 ₩23
--   Place Details Photos                건당 약 ₩12
-- 상한을 '20,000콜'로 잡았는데 그게 얼마인지 아무도 몰랐다. 실제로 정가 ₩643,180 이 나왔다.
-- → 단가를 박아 **원화로 누적**하고, 예산에 닿으면 스스로 멈춘다.
--
-- 단가 출처: 2026-09-04 실제 청구서 (정가 ÷ 사용량)
--   Enterprise ₩281,968/6,096 = 46.3 · Pro ₩105,233/9,475 = 11.1 · Photos ₩93,876/10,695 = 8.8
--   ⚠️ 환율·요금 개정으로 바뀐다. app_settings 로 조정할 수 있게 둔다.

create table if not exists places_cost (
  day         date primary key default (now() at time zone 'America/Los_Angeles')::date,
  won         numeric(12,2) not null default 0,
  essentials  integer not null default 0,
  enterprise  integer not null default 0,
  details     integer not null default 0,
  photos      integer not null default 0,
  updated_at  timestamptz not null default now()
);
alter table places_cost enable row level security;

insert into app_settings(k, v) values
  ('places_price', jsonb_build_object('essentials',0,'enterprise',47,'details',12,'photos',9)),
  ('places_budget_won', jsonb_build_object('month', 0))   -- 🔴 기본 0 = 완전 정지
on conflict (k) do nothing;

/* 예산을 원화로 받아간다. 남은 예산이 없으면 0 을 준다 = 호출하지 마라.
   p_kind: essentials | enterprise | details | photos */
create or replace function public.places_spend(p_kind text, p_want integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  m date := date_trunc('month', (now() at time zone 'America/Los_Angeles'))::date;
  unit numeric; budget numeric; spent numeric; n integer;
begin
  select coalesce((v->>p_kind)::numeric, 0) into unit from app_settings where k='places_price';
  select coalesce((v->>'month')::numeric, 0) into budget from app_settings where k='places_budget_won';
  select coalesce(sum(won),0) into spent from places_cost where day >= m;

  if unit <= 0 then                       -- 공짜 등급은 예산을 안 먹는다
    n := greatest(coalesce(p_want,0), 0);
  else
    n := least(greatest(coalesce(p_want,0), 0), floor(greatest(budget - spent, 0) / unit)::int);
  end if;
  if n <= 0 then return 0; end if;

  insert into places_cost(day) values (d) on conflict (day) do nothing;
  update places_cost set won = won + (unit * n), updated_at = now(),
         essentials = essentials + (case when p_kind='essentials' then n else 0 end),
         enterprise = enterprise + (case when p_kind='enterprise' then n else 0 end),
         details    = details    + (case when p_kind='details'    then n else 0 end),
         photos     = photos     + (case when p_kind='photos'     then n else 0 end)
   where day = d;
  return n;
end $$;
revoke all on function public.places_spend(text, integer) from public, anon, authenticated;

/* 안 쓴 예산은 돌려준다 — 시간 상자에 걸려 중간에 끊겨도 예산이 새지 않게 */
create or replace function public.places_refund(p_kind text, p_n integer)
returns void language plpgsql security definer set search_path to 'public' as $$
declare d date := (now() at time zone 'America/Los_Angeles')::date; unit numeric;
begin
  if coalesce(p_n,0) <= 0 then return; end if;
  select coalesce((v->>p_kind)::numeric, 0) into unit from app_settings where k='places_price';
  update places_cost set won = greatest(won - (unit * p_n), 0), updated_at = now(),
         essentials = greatest(essentials - (case when p_kind='essentials' then p_n else 0 end), 0),
         enterprise = greatest(enterprise - (case when p_kind='enterprise' then p_n else 0 end), 0),
         details    = greatest(details    - (case when p_kind='details'    then p_n else 0 end), 0),
         photos     = greatest(photos     - (case when p_kind='photos'     then p_n else 0 end), 0)
   where day = d;
end $$;
revoke all on function public.places_refund(text, integer) from public, anon, authenticated;

/* 관제용 — 이번 달 얼마 썼나 */
create or replace function public.places_cost_now()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'month_won', (select coalesce(sum(won),0) from places_cost
                   where day >= date_trunc('month',(now() at time zone 'America/Los_Angeles'))::date),
    'budget_won', (select (v->>'month')::numeric from app_settings where k='places_budget_won'),
    'price', (select v from app_settings where k='places_price'),
    'today', (select to_jsonb(c) from places_cost c
               where c.day = (now() at time zone 'America/Los_Angeles')::date));
$$;
