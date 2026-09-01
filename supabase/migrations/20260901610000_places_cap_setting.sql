-- 월 상한을 app_settings 로 뺀다. 크레딧 잔액을 확인한 뒤 마이그레이션 없이 바꾸려면 필요하다.
--   기본값 1000 = 무료 SKU 한도(Text Search Ent+Atmo · Photos). 설정이 없으면 이 값이다 —
--   못 읽으면 조용히 커지는 게 아니라 **무료 한도로 잠긴다**(실수해도 돈이 안 나가는 쪽).
insert into app_settings(k, v) values ('places_free_month', jsonb_build_object('calls', 1000))
on conflict (k) do nothing;

create or replace function places_take(p_want integer, p_cap integer default 1200)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  d date := (now() at time zone 'America/Los_Angeles')::date;
  m date := date_trunc('month', (now() at time zone 'America/Los_Angeles'))::date;
  free_month integer;
  used_day integer; used_month integer; grant_n integer;
begin
  select greatest(coalesce((v->>'calls')::int, 1000), 0) into free_month
    from app_settings where k = 'places_free_month';
  free_month := coalesce(free_month, 1000);

  insert into places_usage(day) values (d) on conflict (day) do nothing;
  select calls into used_day from places_usage where day = d for update;
  select coalesce(sum(calls), 0) into used_month from places_usage where day >= m;

  /* 일 상한과 월 한도 중 더 빡빡한 쪽이 이긴다 */
  grant_n := greatest(least(coalesce(p_want, 0),
                            coalesce(p_cap, 1200) - used_day,
                            free_month - used_month), 0);
  if grant_n > 0 then
    update places_usage set calls = calls + grant_n, updated_at = now() where day = d;
  end if;
  return grant_n;
end $$;
