-- 26.10.11 보안 감사: 엣지 함수 호출자 인증(크론·서버 전용 관문 isCronOrService) 에 맞춘 DB 쪽 변경 기록
-- 1) weather_sync_job 이 anon JWT 만 보내고 있었다 → x-cron-secret(vault cron_secret) 을 보내게 재등록.
--    (weather-sync 는 이제 x-cron-secret 또는 서명 검증된 서비스 키만 받는다. weather_room() 은 svc_role_key 로 부른다.)
select cron.alter_job(
  (select jobid from cron.job where jobname = 'weather_sync_job'),
  schedule := '5-59/10 * * * *',
  command := $cmd$ select net.http_post(url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/weather-sync', headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret')), body:='{}'::jsonb, timeout_milliseconds := 60000) $cmd$
);

-- 2) ai-write-helper(로그인 사용자 전용으로 바뀜) 일일 호출 천장 — ai_budget_take('ai-write-helper') 가 센다.
update app_settings
   set v = coalesce(v, '{}'::jsonb) || jsonb_build_object('ai-write-helper', 300)
 where k = 'ai_daily_caps';

-- 3) air_sync_job · flight_deals_job 은 Authorization: Bearer <vault svc_role_key> 만 보냈다 → 14:07 air-sync 401 실측.
--    (vault 의 구형 JWT 서비스 키가 isCronOrService 의 서명 확인을 못 넘음) → x-cron-secret 을 함께 보낸다.
select cron.alter_job((select jobid from cron.job where jobname='air_sync_job'),
  command := $cmd$ select net.http_post( url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/air-sync', headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'svc_role_key')), body:='{}'::jsonb, timeout_milliseconds := 120000) $cmd$);
select cron.alter_job((select jobid from cron.job where jobname='flight_deals_job'),
  command := $cmd$ select net.http_post( url:='https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/flight-deals', headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='cron_secret'),'Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'svc_role_key')), body:='{}'::jsonb, timeout_milliseconds := 120000) $cmd$);

-- 4) weather_room() 의 동네 수집 요청도 x-cron-secret 을 함께 보낸다(같은 이유).
CREATE OR REPLACE FUNCTION public.weather_room(p_region text, p_limit integer DEFAULT 40)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; c record;
begin
  select r.code, r.name, r.kind, s.name sido, o.temp, o.precip, o.code wmo, o.obs_at
    into c
    from weather_regions r
    left join weather_regions s on s.code = r.parent
    left join weather_obs o on o.region = r.code
   where r.code = p_region;
  if c.code is null then return jsonb_build_object('ok',false,'reason','bad_region'); end if;

  if c.kind = 'dong' and (c.obs_at is null or c.obs_at < now() - interval '60 minutes') then
    if not exists (select 1 from weather_fetch_req where region = c.code and requested_at > now() - interval '5 minutes')
       and (select count(*) from weather_fetch_req where requested_at > now() - interval '1 hour') < 300 then
      insert into weather_fetch_req(region, requested_at) values (c.code, now())
        on conflict (region) do update set requested_at = excluded.requested_at;
      begin
        perform net.http_post(
          url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/weather-sync',
          headers := jsonb_build_object('Content-Type','application/json',
                       'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'),
                       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'svc_role_key')),
          body := jsonb_build_object('region', c.code),
          timeout_milliseconds := 20000);
      exception when others then null;   -- 수집 요청 실패가 방 열기를 막으면 안 된다
      end;
    end if;
  end if;

  /* 한마디는 최근 2시간만. 날씨는 순간이라 어제 글이 섞이면 판이 죽는다. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id, 'body', t.body, 'at', t.created_at,
           'nick', coalesce(u.nickname,'익명'), 'uid', t.user_id
         ) order by t.created_at desc), '[]'::jsonb)
    into v
    from (select * from weather_comments
           where region = p_region and status='active' and created_at > now() - interval '2 hours'
           order by created_at desc limit greatest(1, least(coalesce(p_limit,40),100))) t
    left join users u on u.id = t.user_id;

  return jsonb_build_object('ok',true,
    'region', jsonb_build_object('code',c.code,'name',c.name,'sido',c.sido,
                                 'temp',c.temp,'precip',c.precip,
                                 'code_wmo', coalesce(to_jsonb(c.wmo), '"na"'::jsonb),
                                 'obs_at',c.obs_at, 'air', public.air_of(c.code)),
    'says', v,
    'reports', (select jsonb_build_object(
        'rain',count(*) filter (where kind='rain'),
        'snow',count(*) filter (where kind='snow'),
        'none',count(*) filter (where kind='none'))
      from weather_reports where region=p_region and created_at > now()-interval '30 minutes'),
    'faved', (auth.uid() is not null and exists (select 1 from weather_favs where user_id=auth.uid() and region=p_region)));
end $function$
;
