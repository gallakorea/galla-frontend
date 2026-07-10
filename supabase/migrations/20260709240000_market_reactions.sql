-- 예측(마켓) 좋아요/싫어요. 로그인 필수, 본인만. value: 1(좋아요) / -1(싫어요)
create table if not exists public.market_reactions (
  market_id bigint not null references public.markets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz default now(),
  primary key (market_id, user_id)
);
alter table public.market_reactions enable row level security;
create policy mkr_select_all on public.market_reactions for select using (true);
create policy mkr_insert_own on public.market_reactions for insert to authenticated with check (auth.uid() = user_id);
create policy mkr_update_own on public.market_reactions for update to authenticated using (auth.uid() = user_id);
create policy mkr_delete_own on public.market_reactions for delete to authenticated using (auth.uid() = user_id);
create index if not exists idx_market_reactions_market on public.market_reactions(market_id);
