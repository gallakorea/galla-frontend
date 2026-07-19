-- 📁 채팅방 폴더 + 🚪 그룹 초대 확인 (카톡 설정 대응)
-- 폴더는 '계정의 정리 방식'이라 기기가 아니라 서버에 둔다(폰 바꿔도 그대로).

/* ── 1) 채팅방 폴더 ── */
create table if not exists public.dm_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 12),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists dm_folders_user_idx on public.dm_folders(user_id, sort);

-- 대화 ↔ 폴더 (한 대화는 한 폴더에만 — 카톡과 동일하게 단순하게)
create table if not exists public.dm_thread_folders (
  user_id   uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null,
  folder_id uuid not null references public.dm_folders(id) on delete cascade,
  primary key (user_id, thread_id)
);

alter table public.dm_folders enable row level security;
alter table public.dm_thread_folders enable row level security;

drop policy if exists dmf_all on public.dm_folders;
create policy dmf_all on public.dm_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dmtf_all on public.dm_thread_folders;
create policy dmtf_all on public.dm_thread_folders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

/* ── 2) 그룹 초대 확인 ──
   모르는 사람이 단체방에 끌어들이면 읽기도 전에 끌려 들어가는 게 문제다.
   설정을 켜면 '초대됨(pending)' 상태로 들어가고, 수락해야 실제 참여가 된다. */
create table if not exists public.dm_user_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  gate_group_invite boolean not null default false,
  updated_at        timestamptz not null default now()
);
alter table public.dm_user_settings enable row level security;

drop policy if exists dus_all on public.dm_user_settings;
create policy dus_all on public.dm_user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.open_room_members
  add column if not exists state text not null default 'joined';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'orm_state_chk') then
    alter table public.open_room_members
      add constraint orm_state_chk check (state in ('joined', 'pending'));
  end if;
end $$;

/* 초대 시 상대의 설정을 존중해 상태를 정한다.
   이미 나를 팔로우하는 사람(=아는 사이)의 초대는 게이트를 걸지 않는다 —
   설정의 목적은 '모르는 사람'을 막는 것이지 친구를 불편하게 하는 게 아니다. */
create or replace function public.invite_state_for(p_invitee uuid, p_inviter uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when not coalesce((select gate_group_invite from dm_user_settings where user_id = p_invitee), false)
      then 'joined'
    when exists (select 1 from follows f where f.follower = p_invitee and f.following = p_inviter)
      then 'joined'
    else 'pending'
  end;
$$;
grant execute on function public.invite_state_for(uuid, uuid) to authenticated;

create or replace function public.open_group_create(p_title text, p_members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  if coalesce(array_length(p_members, 1), 0) < 2 then raise exception 'need 2+ members'; end if;
  insert into open_rooms(owner_id, title, kind)
    values (me, coalesce(nullif(btrim(p_title), ''), '단체 채팅'), 'group')
    returning id into rid;
  insert into open_room_members(room_id, user_id, state)
    select rid, u, public.invite_state_for(u, me) from unnest(p_members) as u
    where u <> me
      and exists (select 1 from users x where x.id = u)
      and not exists (select 1 from dm_blocks b
                       where (b.user_id = u and b.blocked = me)
                          or (b.user_id = me and b.blocked = u))
    on conflict do nothing;
  insert into open_room_members(room_id, user_id, state) values (rid, me, 'joined')
    on conflict do nothing;
  return rid;
end $$;
grant execute on function public.open_group_create(text, uuid[]) to authenticated;

-- 초대 수락/거절
create or replace function public.room_invite_respond(p_room uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth required'; end if;
  if p_accept then
    update open_room_members set state = 'joined' where room_id = p_room and user_id = me;
  else
    delete from open_room_members where room_id = p_room and user_id = me;
  end if;
end $$;
grant execute on function public.room_invite_respond(uuid, boolean) to authenticated;
