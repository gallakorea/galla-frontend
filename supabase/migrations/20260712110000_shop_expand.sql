-- 상점 카탈로그 확장: 꾸미기·도전 아이템 추가
create or replace function public._item_price(p_key text)
returns int language sql immutable as $$
  select case p_key
    -- 전투 (소비형)
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'revive'          then 800
    -- 꾸미기 (영구 해금)
    when 'emoticon_pack'   then 1000
    when 'nick_deco'       then 1500
    -- 도전 (소비형)
    when 'duel_ticket'     then 700
    else null end;
$$;
