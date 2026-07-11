-- 1:1 다이렉트 메시지 (광장 헤더 DM)
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_lo uuid not null,          -- least(a,b) 로 정규화 → 쌍당 스레드 1개
  user_hi uuid not null,          -- greatest(a,b)
  last_message text,
  last_sender uuid,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_lo, user_hi)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_dm_messages_thread on public.dm_messages(thread_id, created_at);

-- 스레드 조회/생성 (쌍 정규화). 클라이언트는 이 RPC로만 스레드 생성
create or replace function public.dm_thread_with(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lo uuid; hi uuid; tid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  if other = me then raise exception 'cannot dm self'; end if;
  lo := least(me, other); hi := greatest(me, other);
  select id into tid from dm_threads where user_lo = lo and user_hi = hi;
  if tid is null then
    insert into dm_threads(user_lo, user_hi) values (lo, hi) returning id into tid;
  end if;
  return tid;
end $$;

-- 메시지 insert 시 스레드 요약 갱신 (목록/실시간용)
create or replace function public.dm_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update dm_threads
     set last_message = new.body, last_sender = new.sender_id, last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;
drop trigger if exists trg_dm_touch on public.dm_messages;
create trigger trg_dm_touch after insert on public.dm_messages
  for each row execute function public.dm_touch_thread();

-- RLS
alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists dm_threads_participant on public.dm_threads;
create policy dm_threads_participant on public.dm_threads
  for select using (auth.uid() in (user_lo, user_hi));

drop policy if exists dm_messages_select on public.dm_messages;
create policy dm_messages_select on public.dm_messages
  for select using (exists (
    select 1 from dm_threads t where t.id = thread_id and auth.uid() in (t.user_lo, t.user_hi)));

drop policy if exists dm_messages_insert on public.dm_messages;
create policy dm_messages_insert on public.dm_messages
  for insert with check (
    sender_id = auth.uid() and exists (
      select 1 from dm_threads t where t.id = thread_id and auth.uid() in (t.user_lo, t.user_hi)));

-- 수신자가 읽음 처리(read_at) 가능
drop policy if exists dm_messages_read on public.dm_messages;
create policy dm_messages_read on public.dm_messages
  for update using (
    sender_id <> auth.uid() and exists (
      select 1 from dm_threads t where t.id = thread_id and auth.uid() in (t.user_lo, t.user_hi)))
  with check (true);

-- 실시간
alter publication supabase_realtime add table public.dm_messages;
alter publication supabase_realtime add table public.dm_threads;
