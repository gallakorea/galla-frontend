-- 🚨 무한 재귀: open_rooms 정책이 open_room_members를 보고,
--    open_room_members 정책이 다시 open_rooms를 보면서 서로를 호출했다.
--    → 난장 목록 조회가 통째로 에러("난장 방 안 열리고 예전 것도 안 보임")
--
-- 해결: 멤버십 확인을 SECURITY DEFINER 함수로 빼서 RLS를 우회한다(정책 안에서 정책을 안 탄다).

create or replace function public.is_room_member(p_room uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from open_room_members m
                  where m.room_id = p_room and m.user_id = p_user)
$$;
grant execute on function public.is_room_member(uuid, uuid) to authenticated;

create or replace function public.room_kind(p_room uuid)
returns text language sql stable security definer set search_path = public as $$
  select kind from open_rooms where id = p_room
$$;
grant execute on function public.room_kind(uuid) to authenticated;

-- 방: 난장은 공개, 단체 채팅은 멤버만 (멤버 확인은 함수로 — 재귀 차단)
drop policy if exists open_rooms_read on public.open_rooms;
create policy open_rooms_read on public.open_rooms for select to authenticated
  using (kind = 'open' or is_room_member(id));

-- 멤버 목록: 난장 방이면 공개, 단체면 멤버만 (방 종류도 함수로)
drop policy if exists open_members_read on public.open_room_members;
create policy open_members_read on public.open_room_members for select to authenticated
  using (room_kind(room_id) = 'open' or is_room_member(room_id));

-- 참여: 난장은 본인 뛰어들기, 단체는 기존 멤버가 초대
drop policy if exists open_members_join on public.open_room_members;
create policy open_members_join on public.open_room_members for insert to authenticated
  with check (
    (user_id = auth.uid() and room_kind(room_id) = 'open')
    or is_room_member(room_id)
  );

-- 메시지도 같은 함수로 (기존 exists 서브쿼리 → 함수)
drop policy if exists open_msgs_read on public.open_messages;
create policy open_msgs_read on public.open_messages for select to authenticated
  using (is_room_member(room_id));
drop policy if exists open_msgs_send on public.open_messages;
create policy open_msgs_send on public.open_messages for insert to authenticated
  with check (sender_id = auth.uid() and is_room_member(room_id));
