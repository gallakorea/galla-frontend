-- 🙋 나와의 채팅(셀프 메모) — dm_thread_with는 self를 막으므로 전용 RPC.
-- 친구목록 최상단 '내 프로필'에서 나에게 메모를 보낸다(카톡 나와의 채팅).
create or replace function public.dm_self_thread()
returns uuid language plpgsql security definer set search_path=public as $f$
declare me uuid := auth.uid(); tid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  select id into tid from dm_threads where user_lo = me and user_hi = me;
  if tid is null then
    insert into dm_threads(user_lo, user_hi) values (me, me) returning id into tid;
  end if;
  update dm_thread_prefs set left_at = null where thread_id = tid and user_id = me;
  return tid;
end $f$;
grant execute on function public.dm_self_thread() to authenticated;
