-- 💬 메시지 리액션 — 말풍선을 두 번 탭하면 ❤️
-- 카톡의 '빠른 리액션'에 해당. 답장을 걸 만큼은 아닌 반응을 가볍게 남긴다.
-- 원칙: 리액션은 '그 대화에 참여한 사람'만 남길 수 있고, 자기 것만 지울 수 있다.

create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)      -- 한 사람당 한 메시지에 하나(바꾸면 덮어씀)
);

create index if not exists dm_reactions_msg_idx on public.dm_reactions(message_id);

alter table public.dm_reactions enable row level security;

/* 내가 속한 대화의 메시지인지 확인 — 정책 안에서 dm_messages/dm_threads를 직접
   참조하면 재귀·성능 문제가 생기므로 SECURITY DEFINER 함수로 분리한다.
   (난장 RLS 무한재귀로 한 번 크게 데였다 — 같은 실수를 반복하지 않는다) */
create or replace function public.can_touch_dm_message(p_msg uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.dm_messages m
    join public.dm_threads t on t.id = m.thread_id
    where m.id = p_msg
      and (t.user_lo = auth.uid() or t.user_hi = auth.uid())
  );
$$;

revoke all on function public.can_touch_dm_message(uuid) from public;
grant execute on function public.can_touch_dm_message(uuid) to authenticated;

drop policy if exists dmr_read on public.dm_reactions;
create policy dmr_read on public.dm_reactions
  for select using (public.can_touch_dm_message(message_id));

drop policy if exists dmr_ins on public.dm_reactions;
create policy dmr_ins on public.dm_reactions
  for insert with check (auth.uid() = user_id and public.can_touch_dm_message(message_id));

drop policy if exists dmr_upd on public.dm_reactions;
create policy dmr_upd on public.dm_reactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists dmr_del on public.dm_reactions;
create policy dmr_del on public.dm_reactions
  for delete using (auth.uid() = user_id);

-- 실시간으로 상대 화면에도 즉시 뜨게 (새 테이블에 구독을 붙일 땐 발행 추가가 짝이다)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'dm_reactions'
  ) then
    alter publication supabase_realtime add table public.dm_reactions;
  end if;
end $$;
