-- 🩹 상점에 뜨는데 서버에 가격이 없던 품목 6종 (2026-08-09)
--
--  클라이언트 카탈로그(js/items.js)에는 있는데 _item_price에 없어서 buy_item이 bad_key로
--  실패하던 품목들이다. 가격은 화면에 이미 표시되던 값 그대로 옮긴다(새로 정하지 않는다).
--
--  겸사겸사 통화도 확정한다 — 무전기는 꾸미기라 GC, 일기토 아이템은 승패에 영향을 주니 GP.

create or replace function public._item_price(p_key text)
returns int language sql immutable as $$
  select case p_key
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'reply_pass'      then 300
    when 'revive'          then 800
    when 'shield'          then 400
    when 'breaker'         then 500
    when 'emoticon_pack'   then 1000
    when 'nick_deco'       then 1500
    when 'duel_ticket'     then 700
    when 'sticker_pack_2'  then 1000
    when 'sticker_pack_3'  then 1000
    when 'gif_pack'        then 1500
    when 'voice_pack'      then 2000
    -- ↓ 여기부터 누락분(화면 표시가와 동일)
    when 'walkie_pass'        then 1200
    when 'duel_extend_pass'   then 400
    when 'duel_finisher_pass' then 300
    when 'duel_rematch_pass'  then 500
    when 'duel_cheer_boost'   then 300
    when 'duel_roar_pass'     then 2000
    else null end;
$$;

-- 무전기 사용권은 '꾸미기'라 GC. 일기토 아이템은 승패에 영향을 주므로 GP로 남긴다.
update public.app_settings
   set v = (select jsonb_agg(x) from (
             select jsonb_array_elements_text(v) x from app_settings where k='gc_items'
             union select 'walkie_pass') t)
 where k = 'gc_items';
