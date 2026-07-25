-- ♻️ 유령 라이브 청소 — 앱을 강제 종료(스와이프)하면 live_leave가 안 불려 방이 영원히 살아있다.
-- 해결: 멤버 하트비트(last_seen) + 정리 함수. 호스트가 일정시간 무응답이면 방 종료,
--       무응답 멤버는 목록에서 제거. list_live_rooms가 조회 시마다 스스로 청소한다.
alter table public.open_room_members add column if not exists last_seen timestamptz not null default now();

-- 하트비트: 무대가 열려있는 동안 클라가 주기적으로 호출(4s 폴링과 동승)
create or replace function public.live_heartbeat(p_room uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if me is null then return; end if;
  update open_room_members set last_seen = now() where room_id=p_room and user_id=me;
end $$;
grant execute on function public.live_heartbeat(uuid) to authenticated;

-- 청소: 무응답(>300s) 멤버 삭제 → '완전히 빈 방'만 종료.
-- ⚠️ '호스트 없으면 종료'는 활성 방장을 오탐 강퇴시켜(관중 퇴장·순단 등) 폐기.
--    방장 정상 퇴장은 live_end/live_leave(owner)가 즉시 종료하므로, reaper는 유령(전원 이탈)만 청소.
-- (300s = iOS 타이머 스로틀링·잠깐 백그라운드에도 방장이 억울하게 안 잘리도록 넉넉히)
create or replace function public.live_reap()
returns void language plpgsql security definer set search_path=public as $$
begin
  -- 300초 이상 무응답 멤버 제거(강제종료·백그라운드 이탈)
  delete from open_room_members m
   using open_rooms r
   where m.room_id = r.id and r.kind='live' and r.is_live=true
     and m.last_seen < now() - interval '300 seconds';
  -- 멤버가 하나도 안 남은(유령) 라이브만 종료 — 산 사람이 있으면 절대 안 닫는다
  update open_rooms r set is_live=false, ended_at=now()
   where r.kind='live' and r.is_live=true
     and not exists (select 1 from open_room_members m where m.room_id=r.id);
end $$;
grant execute on function public.live_reap() to authenticated;

-- 목록 조회 시마다 자동 청소(plpgsql로 전환해 reap 선행). 반환 형태는 20260725170000과 동일.
drop function if exists public.list_live_rooms();
create or replace function public.list_live_rooms()
returns table(id uuid, title text, topic text, owner_id uuid, host_nick text, host_avatar text,
              started_at timestamptz, listeners int, speakers int, link_type text, link_id text)
language plpgsql security definer set search_path=public as $$
begin
  perform public.live_reap();
  return query
    select r.id, r.title, r.topic, r.owner_id, u.nickname, u.avatar_url, r.started_at,
      (select count(*) from open_room_members m where m.room_id=r.id)::int as listeners,
      (select count(*) from open_room_members m where m.room_id=r.id and m.role in ('host','speaker'))::int as speakers,
      r.link_type, r.link_id
    from open_rooms r left join users u on u.id=r.owner_id
    where r.kind='live' and r.is_live=true
    order by r.started_at desc nulls last
    limit 50;
end $$;
grant execute on function public.list_live_rooms() to authenticated;
