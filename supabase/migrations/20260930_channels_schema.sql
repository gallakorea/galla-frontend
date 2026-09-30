-- 광장 채널 백엔드(A안, 2026-09-30): 유저가 개설·운영하는 채널.
-- 1단계: 스키마 + 홈 12분류 기본 채널 시드. (plaza_posts.channel_id 백필은 2단계 별도)
-- Management API로 직접 적용됨(아래는 기록용, 멱등).

-- ── 채널 ──
create table if not exists channels (
  id            uuid primary key default gen_random_uuid(),
  name          text unique not null,
  slug          text unique,
  description   text default '',
  color         text default 'linear-gradient(135deg,#3a4fff,#6f86ff)',
  emoji         text default '💬',
  owner_id      uuid references auth.users(id) on delete set null,  -- null = 시스템(기본 채널)
  is_default    boolean default false,                              -- 홈 12분류 기본 채널
  created_at    timestamptz default now(),
  follower_count int default 0,
  post_count    int default 0
);
alter table channels enable row level security;
drop policy if exists channels_read on channels;
create policy channels_read on channels for select using (true);
drop policy if exists channels_insert on channels;
create policy channels_insert on channels for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists channels_update on channels;
create policy channels_update on channels for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- 기본 채널(owner_id null)은 update/delete 불가(정책 없음 = 거부).

-- ── 채널 구독(팔로우) ──
create table if not exists channel_subs (
  user_id    uuid references auth.users(id) on delete cascade,
  channel_id uuid references channels(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, channel_id)
);
alter table channel_subs enable row level security;
drop policy if exists csub_all on channel_subs;
create policy csub_all on channel_subs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── 채널 운영진(부운영자) ──
create table if not exists channel_mods (
  channel_id uuid references channels(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  role       text default 'mod',          -- 'mod'(부운영자). owner 는 channels.owner_id.
  created_at timestamptz default now(),
  primary key (channel_id, user_id)
);
alter table channel_mods enable row level security;
drop policy if exists cmod_read on channel_mods;
create policy cmod_read on channel_mods for select using (true);
drop policy if exists cmod_owner on channel_mods;
create policy cmod_owner on channel_mods for all
  using (exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid()));

-- ── 기본 채널 시드(홈 12분류) ──
insert into channels (name, slug, emoji, color, is_default, description) values
('자유·수다','free','💬','linear-gradient(135deg,#6f86ff,#4361ff)',true,'주제 없이 자유롭게 수다'),
('정치·사회','politics','🗳️','linear-gradient(135deg,#8a5aff,#5a6bff)',true,'시사·정치 토론'),
('경제·투자','economy','📈','linear-gradient(135deg,#2fd07a,#1f9d5e)',true,'경제·재테크·투자'),
('직장·경력','career','🏢','linear-gradient(135deg,#5ab0ff,#4361ff)',true,'직장 생활·커리어'),
('연애·결혼','love','💘','linear-gradient(135deg,#ff5a9a,#ff5a6e)',true,'연애·결혼·육아'),
('엔터·스포츠','ent','🎬','linear-gradient(135deg,#ffcf5a,#ff9a5a)',true,'엔터·방송·스포츠'),
('음식·맛집','food','🍜','linear-gradient(135deg,#ff9a5a,#ff5a6e)',true,'맛집·요리·먹거리'),
('세계·여행','travel','✈️','linear-gradient(135deg,#4d8dff,#6f86ff)',true,'여행·세계 이야기'),
('패션·뷰티','fashion','💄','linear-gradient(135deg,#ff5a9a,#c15aff)',true,'패션·뷰티'),
('19금','adult','🔞','linear-gradient(135deg,#c15aff,#8a5aff)',true,'성인 주제')
on conflict (name) do nothing;
