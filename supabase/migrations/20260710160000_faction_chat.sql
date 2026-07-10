-- 💬 진영 작전회의(실시간 채팅) — 이슈별·진영별 오픈채팅
-- 절대 규칙: 상대 진영은 읽기/쓰기/실시간 수신 모두 불가 (RLS 강제, realtime도 RLS 적용됨)
create table if not exists public.faction_chats (
  id bigserial primary key,
  issue_id bigint not null references public.issues(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  faction text not null check (faction in ('pro','con')),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz default now()
);
create index if not exists idx_faction_chats_room on public.faction_chats (issue_id, faction, created_at desc);
alter table public.faction_chats enable row level security;

-- 읽기: 그 이슈에 같은 진영으로 투표한 사람만
create policy fc_select_same_faction on public.faction_chats for select to authenticated
  using (exists (
    select 1 from votes v
     where v.issue_id = faction_chats.issue_id
       and v.user_id = auth.uid()
       and v.type = faction_chats.faction));

-- 쓰기: 본인 명의 + 자기 진영 채팅방에만
create policy fc_insert_own_faction on public.faction_chats for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from votes v
       where v.issue_id = faction_chats.issue_id
         and v.user_id = auth.uid()
         and v.type = faction_chats.faction));

alter publication supabase_realtime add table public.faction_chats;
