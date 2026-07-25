-- 🎤 무대 자진 하차 — 스피커가 스스로 청중으로 내려간다(호스트는 불가, 방 종료로만).
-- live_set_role은 호스트만 가능하므로 본인 강등 전용 RPC가 필요.
create or replace function public.live_step_down(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_role text;
begin
  if me is null then raise exception 'auth'; end if;
  select role into v_role from open_room_members where room_id=p_room and user_id=me;
  if v_role is null then return jsonb_build_object('ok',false,'reason','not_member'); end if;
  if v_role = 'host' then return jsonb_build_object('ok',false,'reason','host'); end if;   -- 호스트는 종료로만
  update open_room_members
     set role='listener', muted=true, hand_raised=false
   where room_id=p_room and user_id=me;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.live_step_down(uuid) to authenticated;
