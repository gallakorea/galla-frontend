-- ═══════════════════════════════════════════════════════════════
-- 난장 — 오픈 채팅방 (카카오 오픈채팅 대응)
-- 사용자가 주제를 정해 방을 열고, 아무나 들어와 떠드는 공개 단체 채팅.
-- DM(1:1)과 별개 테이블 — dm_threads는 1:1 전제(user_lo/user_hi)라 섞지 않는다.
--
-- 보안 원칙(DM과 동일 결):
--   · 방 목록/멤버 수는 공개(둘러보기), 메시지는 '참여자만' — RLS가 강제
--   · 참여도 서버가 강제(insert 정책에 멤버 존재 조건) — 클라 우회 불가
--   · 방 만들기는 RPC(방+방장 멤버십 원자 생성)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.open_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 30),
  topic text not null default '' check (char_length(topic) <= 100),
  member_count int not null default 0,
  last_message text,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.open_room_members (
  room_id uuid not null references public.open_rooms(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create table if not exists public.open_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.open_rooms(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'text',
  created_at timestamptz not null default now()
);
create index if not exists idx_open_messages_room on public.open_messages(room_id, created_at);

alter table public.open_rooms enable row level security;
alter table public.open_room_members enable row level security;
alter table public.open_messages enable row level security;

-- 방·멤버 목록은 로그인 유저 누구나 열람(오픈챗 둘러보기) — 메시지만 참여자 전용
drop policy if exists open_rooms_read on public.open_rooms;
create policy open_rooms_read on public.open_rooms for select to authenticated using (true);
drop policy if exists open_rooms_owner_upd on public.open_rooms;
create policy open_rooms_owner_upd on public.open_rooms for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists open_rooms_owner_del on public.open_rooms;
create policy open_rooms_owner_del on public.open_rooms for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists open_members_read on public.open_room_members;
create policy open_members_read on public.open_room_members for select to authenticated using (true);
drop policy if exists open_members_join on public.open_room_members;
create policy open_members_join on public.open_room_members for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists open_members_leave on public.open_room_members;
create policy open_members_leave on public.open_room_members for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists open_msgs_read on public.open_messages;
create policy open_msgs_read on public.open_messages for select to authenticated
  using (exists (select 1 from public.open_room_members m
                  where m.room_id = open_messages.room_id and m.user_id = auth.uid()));
drop policy if exists open_msgs_send on public.open_messages;
create policy open_msgs_send on public.open_messages for insert to authenticated
  with check (sender_id = auth.uid()
    and exists (select 1 from public.open_room_members m
                 where m.room_id = open_messages.room_id and m.user_id = auth.uid()));

-- 컬럼 단위 grant — dm_messages와 같은 문법(insert 컬럼 고정, update는 방장 제목·주제만)
grant select on public.open_rooms, public.open_room_members, public.open_messages to authenticated;
grant update (title, topic) on public.open_rooms to authenticated;
grant delete on public.open_rooms to authenticated;
grant insert (room_id, user_id), delete on public.open_room_members to authenticated;
grant insert (room_id, sender_id, body, kind) on public.open_messages to authenticated;

-- ── 방 만들기: 방 + 방장 멤버십을 한 번에(원자) ──
create or replace function public.open_room_create(p_title text, p_topic text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); rid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  insert into open_rooms(owner_id, title, topic) values (me, btrim(p_title), coalesce(p_topic, ''))
    returning id into rid;
  insert into open_room_members(room_id, user_id) values (rid, me);
  return rid;
end $$;
grant execute on function public.open_room_create(text, text) to authenticated;

-- ── 비정규화 유지: 멤버 수 / 마지막 메시지 (목록 프리뷰용 — N+1 방지) ──
create or replace function public._open_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update open_rooms set member_count = (select count(*) from open_room_members where room_id = coalesce(new.room_id, old.room_id))
    where id = coalesce(new.room_id, old.room_id);
  -- 마지막 사람이 나가면 방도 정리(유령 방 방지)
  if tg_op = 'DELETE' then
    delete from open_rooms where id = old.room_id and member_count = 0;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_open_member_count on public.open_room_members;
create trigger trg_open_member_count after insert or delete on public.open_room_members
  for each row execute function public._open_member_count();

create or replace function public._open_last_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update open_rooms set last_message = left(new.body, 80), last_message_at = new.created_at
    where id = new.room_id;
  return new;
end $$;
drop trigger if exists trg_open_last_message on public.open_messages;
create trigger trg_open_last_message after insert on public.open_messages
  for each row execute function public._open_last_message();

-- 실시간: 방 안 새 메시지 push (RLS가 참여자만 거른다)
do $$ begin
  alter publication supabase_realtime add table public.open_messages;
exception when duplicate_object then null; end $$;
