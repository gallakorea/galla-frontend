-- 🏷️ 칭호 = 획득제로 전환 (구매 폐지) — 등급/시즌/업적으로만. 희소성·성취 보존
-- 갈라 지수(GI) 서버 계산 → 등급 도달 검증 후 등급 칭호 장착

-- GI = 활동 + 전투 + 예측 (gallian.js와 동일 공식)
create or replace function public._user_gi(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select (
    coalesce((select count(*) from issues where user_id=p_user),0)*50
  + coalesce((select count(*) from comments where user_id=p_user and status<>'deleted'),0)*10
  + coalesce((select count(*) from votes where user_id=p_user),0)*2
  + coalesce((select count(*) from plaza_posts where user_id=p_user),0)*15
  + coalesce((select count(*) from plaza_comments where user_id=p_user),0)*5
  + coalesce((select count(*) from comment_actions where user_id=p_user),0)*8
  + coalesce((select count(*) from market_trades where user_id=p_user),0)*10
  )::bigint;
$$;

-- 등급 칭호 카탈로그: key → (name, min_gi)
create or replace function public._tier_title(p_key text)
returns table(name text, min_gi int) language sql immutable as $$
  select case p_key
    when 'gi_spark' then '🌱 눈팅 뉴비' when 'gi_breaker' then '🔥 발끈러'
    when 'gi_vanguard' then '⌨️ 키보드 전사' when 'gi_authority' then '🎤 여론 논객'
    when 'gi_dominion' then '🌪️ 갈라 선동가' when 'gi_apex' then '👑 갈라 대장군' else null end,
  case p_key
    when 'gi_spark' then 0 when 'gi_breaker' then 150 when 'gi_vanguard' then 500
    when 'gi_authority' then 1500 when 'gi_dominion' then 4500 when 'gi_apex' then 15000 else null end;
$$;

-- 등급 칭호 장착 (도달 검증)
create or replace function public.equip_tier_title(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_name text; v_min int; v_gi bigint;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key='none' then
    insert into user_cosmetics(user_id, title) values (v_user, null)
      on conflict (user_id) do update set title=null, updated_at=now();
    return jsonb_build_object('ok',true,'title',null);
  end if;
  select name, min_gi into v_name, v_min from _tier_title(p_key);
  if v_name is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  v_gi := _user_gi(v_user);
  if v_gi < v_min then return jsonb_build_object('ok',false,'reason','locked','need',v_min,'gi',v_gi); end if;
  insert into user_cosmetics(user_id, title) values (v_user, v_name)
    on conflict (user_id) do update set title=v_name, updated_at=now();
  return jsonb_build_object('ok',true,'title',v_name);
end $$;

-- 내 획득 칭호: 등급(잠금/해금) + 시즌 수상 + 현재 장착
create or replace function public.my_earned_titles()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_gi bigint;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  v_gi := _user_gi(v_user);
  return jsonb_build_object('ok',true,'gi',v_gi,
    'tiers', jsonb_build_array(
      jsonb_build_object('key','gi_spark','name','🌱 눈팅 뉴비','min',0,'unlocked', v_gi>=0),
      jsonb_build_object('key','gi_breaker','name','🔥 발끈러','min',150,'unlocked', v_gi>=150),
      jsonb_build_object('key','gi_vanguard','name','⌨️ 키보드 전사','min',500,'unlocked', v_gi>=500),
      jsonb_build_object('key','gi_authority','name','🎤 여론 논객','min',1500,'unlocked', v_gi>=1500),
      jsonb_build_object('key','gi_dominion','name','🌪️ 갈라 선동가','min',4500,'unlocked', v_gi>=4500),
      jsonb_build_object('key','gi_apex','name','👑 갈라 대장군','min',15000,'unlocked', v_gi>=15000)
    ),
    'awards', coalesce((select jsonb_agg(jsonb_build_object('key',title_key,'name',custom_name))
                        from user_titles where user_id=v_user and custom_name is not null), '[]'::jsonb),
    'equipped', (select title from user_cosmetics where user_id=v_user));
end $$;

-- 구매형 칭호 폐지: buy_title 무력화(호환용으로 남기되 항상 거부)
create or replace function public.buy_title(p_key text)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('ok',false,'reason','deprecated');
$$;

grant execute on function public.equip_tier_title(text) to authenticated;
grant execute on function public.my_earned_titles()     to authenticated;
grant execute on function public._user_gi(uuid)         to authenticated;
