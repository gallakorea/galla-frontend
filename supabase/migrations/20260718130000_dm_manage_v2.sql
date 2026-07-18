-- ═══════════════════════════════════════════════════════════════
-- DM 관리 기능 (카카오톡 친구·채팅방 관리 차용)
-- 차단 / 숨긴 친구 / 즐겨찾기 / 채팅방 고정·나가기 / 검색 허용(프라이버시)
--
-- 카톡 기능 → 갈라 매핑:
--   차단 친구 관리        → dm_blocks (차단하면 서로 DM 불가 — 서버가 강제)
--   숨긴 친구 관리        → dm_hidden (친구 목록에서만 숨김, DM은 가능)
--   즐겨찾기              → dm_favs (친구 목록 상단 고정)
--   채팅방 고정/나가기    → dm_thread_prefs (pinned / left_at)
--   전화번호·추천 허용    → dm_settings.searchable (닉네임 검색으로 나 찾기 허용)
--   나가기 후 재등장      → left_at 이후 새 메시지가 오면 다시 보인다(카톡과 동일)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.dm_blocks (
  user_id uuid not null, blocked uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked)
);
create table if not exists public.dm_hidden (
  user_id uuid not null, hidden uuid not null,
  primary key (user_id, hidden)
);
create table if not exists public.dm_favs (
  user_id uuid not null, peer uuid not null,
  primary key (user_id, peer)
);
create table if not exists public.dm_thread_prefs (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null,
  pinned boolean not null default false,
  left_at timestamptz,
  primary key (thread_id, user_id)
);
create table if not exists public.dm_settings (
  user_id uuid primary key,
  searchable boolean not null default true
);

-- RLS: 전부 본인 행만 (차단당한 사실은 상대에게 보이지 않는다 — 카톡과 동일)
alter table public.dm_blocks enable row level security;
alter table public.dm_hidden enable row level security;
alter table public.dm_favs enable row level security;
alter table public.dm_thread_prefs enable row level security;
alter table public.dm_settings enable row level security;
do $$
declare t text;
begin
  foreach t in array array['dm_blocks','dm_hidden','dm_favs','dm_thread_prefs','dm_settings'] loop
    execute format('drop policy if exists %I_own on public.%I', t, t);
    execute format('create policy %I_own on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
  end loop;
end $$;
grant select, insert, update, delete on public.dm_blocks, public.dm_hidden, public.dm_favs, public.dm_thread_prefs, public.dm_settings to authenticated;

-- ── 차단은 서버가 강제한다 — 목록에서 숨기는 건 UI 예의일 뿐, 진짜 벽은 여기 ──
create or replace function public._dm_check_block()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_other uuid;
begin
  select case when t.user_lo = new.sender_id then t.user_hi else t.user_lo end
    into v_other from dm_threads t where t.id = new.thread_id;
  if exists (select 1 from dm_blocks
              where (user_id = v_other and blocked = new.sender_id)
                 or (user_id = new.sender_id and blocked = v_other)) then
    raise exception 'blocked';
  end if;
  return new;
end $$;
drop trigger if exists trg_dm_check_block on public.dm_messages;
create trigger trg_dm_check_block before insert on public.dm_messages
  for each row execute function public._dm_check_block();

-- 스레드 생성 자체도 차단 시 거부
create or replace function public.dm_thread_with(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lo uuid; hi uuid; tid uuid;
begin
  if me is null then raise exception 'auth required'; end if;
  if other = me then raise exception 'cannot dm self'; end if;
  if exists (select 1 from dm_blocks
              where (user_id = me and blocked = other) or (user_id = other and blocked = me)) then
    raise exception 'blocked';
  end if;
  lo := least(me, other); hi := greatest(me, other);
  select id into tid from dm_threads where user_lo = lo and user_hi = hi;
  if tid is null then
    insert into dm_threads(user_lo, user_hi) values (lo, hi) returning id into tid;
  end if;
  -- 대화를 다시 시작하면 '나감' 상태 해제(카톡: 나간 방도 새 대화로 복귀)
  update dm_thread_prefs set left_at = null where thread_id = tid and user_id = me;
  return tid;
end $$;

-- ── 유저 검색: searchable=false·차단 관계는 결과에서 제외 ──
-- 클라가 users를 직접 ilike하면 이 설정을 우회할 수 있으므로 검색은 이 RPC로만.
create or replace function public.dm_search(p_q text)
returns table(id uuid, nickname text, avatar_url text, bio text)
language sql security definer set search_path = public as $$
  select u.id, u.nickname, u.avatar_url, u.bio
  from users u
  where u.id <> auth.uid()
    and u.nickname ilike '%' || p_q || '%'
    and not exists (select 1 from dm_settings s where s.user_id = u.id and s.searchable = false)
    and not exists (select 1 from dm_blocks b
                     where (b.user_id = u.id and b.blocked = auth.uid())
                        or (b.user_id = auth.uid() and b.blocked = u.id))
  limit 20
$$;
grant execute on function public.dm_search(text) to authenticated;
