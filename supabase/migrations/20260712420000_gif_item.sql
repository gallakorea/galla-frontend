-- 🎬 GIF 사용권(gif_pack) — 댓글에 GIF 삽입 해금(영구). buy_item은 _item_price!=null 이면 통과
create or replace function public._item_price(p_key text)
returns int language sql immutable as $$
  select case p_key
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'revive'          then 800
    when 'emoticon_pack'   then 1000
    when 'nick_deco'       then 1500
    when 'duel_ticket'     then 700
    when 'sticker_pack_2'  then 1000
    when 'sticker_pack_3'  then 1000
    when 'gif_pack'        then 1500
    else null end;
$$;
