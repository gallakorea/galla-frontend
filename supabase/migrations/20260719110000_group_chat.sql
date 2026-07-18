-- ═══════════════════════════════════════════════════════════════
-- 단체 채팅 (카카오 그룹채팅 대응) — 난장(open_rooms) 스키마 재사용
--   kind='open'  : 난장. 목록 공개, 아무나 참여
--   kind='group' : 단체 채팅. 멤버만 방 존재를 볼 수 있고, 초대는 멤버만
-- 메시지 RLS(참여자만)는 이미 두 종류 모두를 지킨다.
-- ═══════════════════════════════════════════════════════════════

alter table public.open_rooms add column if not exists kind text not null default 'open';
do $$ begin
  alter table public.open_rooms add constraint open_rooms_kind_chk check (kind in ('open','group'));
exception when duplicate_object then null; end $$;

-- 방 열람: 난장은 공개, 단체 채팅은 멤버만
drop policy if exists open_rooms_read on public.open_rooms;
create policy open_rooms_read on public.open_rooms for select to authenticated
  using (kind = 'open'
    or exists (select 1 from public.open_room_members m
                where m.room_id = open_rooms.id and m.user_id = auth.uid()));

-- 참여: 난장은 본인이 뛰어들기, 단체 채팅은 '기존 멤버가 초대'만
drop policy if exists open_members_join on public.open_room_members;
create policy open_members_join on public.open_room_members for insert to authenticated
  with check (
    (user_id = auth.uid()
      and exists (select 1 from public.open_rooms r where r.id = room_id and r.kind = 'open'))
    or exists (select 1 from public.open_room_members m
                where m.room_id = open_room_members.room_id and m.user_id = auth.uid())
  );

-- 멤버 목록 열람도 방 열람과 같은 선: 단체 채팅 멤버는 멤버만 볼 수 있다
drop policy if exists open_members_read on public.open_room_members;
create policy open_members_read on public.open_room_members for select to authenticated
  using (exists (select 1 from public.open_rooms r
                  where r.id = open_room_members.room_id
                    and (r.kind = 'open'
                      or exists (select 1 from public.open_room_members m2
                                  where m2.room_id = r.id and m2.user_id = auth.uid()))));

-- ── 단체 채팅 만들기: 방 + 나 + 멤버들 원자 생성 (차단 관계는 조용히 제외) ──
create or replace function public.open_group_create(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  if coalesce(array_length(p_members, 1), 0) < 2 then raise exception 'need 2+ members'; end if;
  insert into open_rooms(owner_id, title, kind)
    values (me, coalesce(nullif(btrim(p_title), ''), '단체 채팅'), 'group')
    returning id into rid;
  insert into open_room_members(room_id, user_id)
    select rid, u from unnest(p_members) as u
    where u <> me
      and exists (select 1 from users x where x.id = u)
      and not exists (select 1 from dm_blocks b
                       where (b.user_id = u and b.blocked = me)
                          or (b.user_id = me and b.blocked = u))
    on conflict do nothing;
  insert into open_room_members(room_id, user_id) values (rid, me);
  return rid;
end $$;
grant execute on function public.open_group_create(text, uuid[]) to authenticated;
