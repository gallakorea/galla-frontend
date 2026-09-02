-- 몇 번 해봐도 안 되는 주소는 그만 물어본다.
--
-- 착한가격 9,014곳 중 9,002곳(99.87%)이 세워졌다. 남은 12곳은 정부 원본 주소가
-- 지오코더로 풀리지 않는 것들이다 — 시/군이 통째로 빠졌거나(경기도 '양촌읍', 충청남도 '엄사면')
-- 지하상가 주소이거나(부평중앙지하상가 가동 지하 28호) 도로명 자체가 오타다('중마용도3길').
--
-- ⚠️ 그대로 두면 크론이 15분마다 그 12곳을 영원히 다시 물어본다(실측: found 0 / miss 22 를
--    네 시간 반복). 호출은 무료지만 이력이 지저분해지고 '아직 안 끝났다'로 보인다.
--    시도 횟수를 세서 3번 넘으면 큐에서 뺀다. 원본은 그대로 두니 나중에 손으로 고치면 다시 잡힌다.
alter table food_goodprice add column if not exists tries int not null default 0;

create or replace function food_goodprice_touch(p_ids bigint[])
returns integer language sql security definer set search_path to 'public' as $$
  with u as (update food_goodprice
                set tried_at = now(), tries = tries + 1
              where id = any(coalesce(p_ids, '{}')) returning 1)
  select count(*)::int from u;
$$;

create or replace function food_goodprice_todo(p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'gid', g.id, 'name', g.name, 'address', g.address,
           'sigun', g.sigun, 'cat', g.cat, 'tel', g.tel, 'menus', g.menus)), '[]'::jsonb)
    from (select * from food_goodprice
           where place_id is null and address is not null and address <> ''
             and tries < 3                       -- 세 번 해봤으면 접는다
           order by tried_at nulls first, id limit greatest(p_limit, 1)) g;
$$;

-- 다 끝났으니 주기를 늦춘다. 분기마다 원본이 갱신되면 새 업소만 집으면 된다.
select cron.unschedule('good_price_geocode');
select cron.schedule('good_price_geocode', '35 5 * * *', $$
  select net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/geocode-good-price?n=250',
    headers := jsonb_build_object('x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),
      'Content-Type','application/json'),
    timeout_milliseconds := 145000);
$$);
