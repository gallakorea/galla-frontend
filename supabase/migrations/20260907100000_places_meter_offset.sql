-- 계정을 갈아탈 때 미터를 이어 쓰면 안 된다.
--
-- 배경: places_spend 는 '이번 달 누적 지출'로 예산을 막는다. 그런데 26.9.7 에 구글 결제
--   계정을 blackid → blackid78 로 갈아탔다. 9월 미터엔 blackid 가 태운 ₩374,545 가
--   그대로 남아 있어서, 새 계정 예산을 ₩380,000 으로 걸면 실제로 쓸 수 있는 건 ₩5,455 뿐이다.
--   반대로 예산을 합산해서 올려두면 10월 1일에 카운터만 리셋되고 예산은 위험하게 높은 채로 남는다.
--
-- 그래서 '기준선(offset)'을 둔다. 같은 달일 때만 빼주고, 달이 바뀌면 스스로 무효가 된다 —
-- 다음 달에 옛 기준선이 살아남아 예산을 뚫는 일이 없어야 한다.
insert into app_settings(k, v)
values ('places_meter_offset', jsonb_build_object('month','2026-09','won',374545))
on conflict (k) do update set v = excluded.v, updated_at = now();

create or replace function public.places_meter_offset()
returns numeric language sql stable security definer set search_path to 'public' as $$
  select case
           when (select v->>'month' from app_settings where k='places_meter_offset')
                = to_char((now() at time zone 'America/Los_Angeles'), 'YYYY-MM')
           then coalesce((select (v->>'won')::numeric from app_settings where k='places_meter_offset'), 0)
           else 0
         end;
$$;

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
  spent := greatest(spent - places_meter_offset(), 0);   -- 계정 갈아탄 만큼 기준선을 옮긴다

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

create or replace function public.places_cost_now()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'month_won', greatest((select coalesce(sum(won),0) from places_cost
                   where day >= date_trunc('month',(now() at time zone 'America/Los_Angeles'))::date)
                 - places_meter_offset(), 0),
    'budget_won', (select (v->>'month')::numeric from app_settings where k='places_budget_won'),
    'offset_won', places_meter_offset(),
    'price', (select v from app_settings where k='places_price'),
    'today', (select to_jsonb(c) from places_cost c
               where c.day = (now() at time zone 'America/Los_Angeles')::date));
$$;
