-- ⚔️ 일기토 재설계: 실시간 채팅 대결(온라인 옥타곤) — 댓글 배틀 귀속
-- 비동기 턴제(duel_rounds/duel_argue) 폐기 → 실시간 파이터/관중 채팅으로 대체

drop function if exists public.duel_argue(bigint, text);
drop table if exists public.duel_rounds cascade;

-- duels 확장 ---------------------------------------------------------------
alter table public.duels
  add column if not exists issue_id        bigint,
  add column if not exists stake           int not null default 500,
  add column if not exists time_limit_secs int not null default 300,
  add column if not exists mode            text not null default 'instant',  -- instant | scheduled
  add column if not exists scheduled_at    timestamptz,
  add column if not exists live_started_at timestamptz,
  add column if not exists live_ends_at    timestamptz,
  add column if not exists grace_until     timestamptz,
  add column if not exists chal_entered    boolean not null default false,
  add column if not exists opp_entered     boolean not null default false,
  add column if not exists fled_by         uuid;

-- 상태 체크 제약 확장 (scheduled/live/noshow 추가)
alter table public.duels drop constraint if exists duels_status_check;
alter table public.duels add constraint duels_status_check
  check (status in ('pending','scheduled','live','voting','finished','declined','expired','noshow'));

-- 파이터 링(실시간 대결 채팅) --------------------------------------------
create table if not exists public.duel_messages (
  id bigint generated always as identity primary key,
  duel_id bigint not null references public.duels(id) on delete cascade,
  user_id uuid not null,
  side text not null check (side in ('challenger','opponent')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.duel_messages enable row level security;
drop policy if exists duel_messages_read on public.duel_messages;
create policy duel_messages_read on public.duel_messages for select using (true);
create index if not exists duel_messages_idx on public.duel_messages(duel_id, created_at);

-- 관중석(응원 채팅) ------------------------------------------------------
create table if not exists public.duel_cheers (
  id bigint generated always as identity primary key,
  duel_id bigint not null references public.duels(id) on delete cascade,
  user_id uuid not null,
  team text not null default 'neutral' check (team in ('challenger','opponent','neutral')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.duel_cheers enable row level security;
drop policy if exists duel_cheers_read on public.duel_cheers;
create policy duel_cheers_read on public.duel_cheers for select using (true);
create index if not exists duel_cheers_idx on public.duel_cheers(duel_id, created_at);

-- 실시간 publication 등록 (이미 있으면 무시)
do $$ begin
  begin alter publication supabase_realtime add table public.duel_messages; exception when others then null; end;
  begin alter publication supabase_realtime add table public.duel_cheers; exception when others then null; end;
  begin alter publication supabase_realtime add table public.duels; exception when others then null; end;
end $$;
