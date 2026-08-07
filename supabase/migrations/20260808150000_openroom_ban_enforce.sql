-- 🎪 난장(오픈챗) 밴 실효화 (2026-08-08 QA9)
--  실측 문제 2가지:
--   ① open_room_members INSERT 정책이 open_room_bans를 보지 않아 **밴당해도 재입장하면 그대로 발화**(밴 무력)
--   ② open_room_bans에 RLS 정책이 0개 → 방장이 밴을 넣을 수 없음(기능 자체가 안 돎)
--  정상 참여자 경험은 그대로 두고 밴만 실효화한다.

-- ① 밴이면 입장 불가
drop policy if exists open_members_join on public.open_room_members;
create policy open_members_join on public.open_room_members
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.open_room_bans b
       where b.room_id = open_room_members.room_id and b.user_id = auth.uid()
    )
    and (
      exists (select 1 from public.open_rooms r
               where r.id = open_room_members.room_id and r.kind = any (array['open','live']))
      or exists (select 1 from public.open_room_members m
                  where m.room_id = open_room_members.room_id and m.user_id = auth.uid())
    )
  );

-- ② 밴 관리 — 방장만 추가·해제, 조회는 방장 + 본인(내가 밴인지 확인)
alter table public.open_room_bans enable row level security;

drop policy if exists open_bans_owner_ins on public.open_room_bans;
create policy open_bans_owner_ins on public.open_room_bans
  for insert to authenticated
  with check (exists (select 1 from public.open_rooms r
                       where r.id = open_room_bans.room_id and r.owner_id = auth.uid()));

drop policy if exists open_bans_owner_del on public.open_room_bans;
create policy open_bans_owner_del on public.open_room_bans
  for delete to authenticated
  using (exists (select 1 from public.open_rooms r
                  where r.id = open_room_bans.room_id and r.owner_id = auth.uid()));

drop policy if exists open_bans_read on public.open_room_bans;
create policy open_bans_read on public.open_room_bans
  for select to authenticated
  using (user_id = auth.uid()
         or exists (select 1 from public.open_rooms r
                     where r.id = open_room_bans.room_id and r.owner_id = auth.uid()));

-- ③ 밴 = 즉시 퇴장(멤버 행 제거) — 방장이 밴만 넣어도 실제로 쫓겨나게
create or replace function public._openroom_ban_kick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.open_room_members where room_id = new.room_id and user_id = new.user_id;
  return new;
end $$;

drop trigger if exists trg_openroom_ban_kick on public.open_room_bans;
create trigger trg_openroom_ban_kick
  after insert on public.open_room_bans
  for each row execute function public._openroom_ban_kick();
