-- 한 프로가 재생목록 여러 개로 쪼개져 있다 — 시즌별이다.
--   전현무계획2·3 → PLrDHX3GYl0OVYZ2EUH8FR-WxFdbQYb0b7 (894편)
--   전현무계획4   → PLrDHX3GYl0OW5G2qvPTSmuimRr84sFzYc (201편)
-- 컬럼 하나로는 담을 수 없다. 목록을 행으로 둔다.
create table if not exists food_playlists (
  playlist_id text primary key,
  channel     text not null references food_channels(slug) on delete cascade,
  title       text,
  n_items     integer,
  active      boolean not null default true,
  synced_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists food_playlists_ch on food_playlists(channel) where active;
alter table food_playlists enable row level security;

create table if not exists travel_playlists (
  playlist_id text primary key,
  channel     text not null references travel_channels(slug) on delete cascade,
  title       text,
  n_items     integer,
  active      boolean not null default true,
  synced_at   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists travel_playlists_ch on travel_playlists(channel) where active;
alter table travel_playlists enable row level security;

-- 사람이 눈으로 확인한 공식 목록만 넣는다(자동 해소는 껐다)
insert into food_playlists(playlist_id, channel, title) values
  ('PLdL7USGieQC3EI1Of8ZR5klR3K2CPshZ-', 'baekban',     '식객 허영만의 백반기행 (TV조선)'),
  ('PLrDHX3GYl0OVYZ2EUH8FR-WxFdbQYb0b7','jeonhyeonmu', '전현무계획2·3 (채널S)'),
  ('PLrDHX3GYl0OW5G2qvPTSmuimRr84sFzYc','jeonhyeonmu', '전현무계획4 (채널S)'),
  ('PLjEfM9iTt3gypt0uB0tuhCv45_NnTHPl6','dongne',      '동네 한 바퀴 (KBS 교양)')
on conflict (playlist_id) do nothing;

/* 수집기가 집어갈 목록 */
create or replace function public.food_playlists_due(p_limit integer default 3)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'playlist_id', playlist_id, 'channel', channel, 'title', title)
         order by synced_at nulls first), '[]'::jsonb)
    from (select * from food_playlists where active
           order by synced_at nulls first limit greatest(coalesce(p_limit,3),1)) q;
$$;
create or replace function public.food_playlist_done(p_id text, p_n integer)
returns void language sql security definer set search_path to 'public' as $$
  update food_playlists set synced_at = now(), n_items = p_n where playlist_id = p_id;
$$;
revoke all on function public.food_playlists_due(integer) from public, anon, authenticated;
revoke all on function public.food_playlist_done(text, integer) from public, anon, authenticated;
