-- 🎙 육성 난장: 방장 앱이 강제 종료되면(pagehide 가 안 불림) 청중이 남아 있는 한 방이 끝나지 않았다.
--    청중 하트비트가 방을 붙잡아 '방장 없는 방'이 목록에 계속 떴다(26.9.21 두 폰 실측: 4분+ 잔존, 새 청중이 옛 방으로 입장).
--    방장(role=host) 신호가 120초 끊기면 방을 닫는다. 막 연 방(60초 이내)은 제외.
create or replace function public.live_reap() returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from open_room_members m using open_rooms r
   where m.room_id = r.id and r.kind='live' and r.is_live=true and m.last_seen < now() - interval '300 seconds';
  with ended as (
  update open_rooms r set is_live=false, ended_at=now()
   where r.kind='live' and r.is_live=true
     and (not exists (select 1 from open_room_members m where m.room_id=r.id)
          or (coalesce(r.started_at, r.created_at) < now() - interval '60 seconds'
              and not exists (select 1 from open_room_members m where m.room_id=r.id and m.role='host' and m.last_seen > now() - interval '120 seconds')))
   returning r.id)
  -- 닫힌 방의 청중도 비운다 → 청중 화면(live_room_state 빈 결과 2회)이 「종료됐어요」로 닫힌다
  delete from open_room_members m using ended e where m.room_id = e.id;
end $$;
