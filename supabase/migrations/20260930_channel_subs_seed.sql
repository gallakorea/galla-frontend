-- 광장 채널 구독 DB화 + 가입 시 기본 채널 자동 팔로우(2026-09-30, 블라인드식).
-- 신규 유저도 홈 드로어·내 채널이 비지 않도록 기본 카테고리 채널을 자동 팔로우한다.
-- Management API 로 적용. 멱등.

-- 1) 기본 채널 자동 팔로우 — 멱등. 19금은 성인 주제라 자동 팔로우 제외.
create or replace function seed_default_subs(p_user uuid default null) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare uid uuid := coalesce(p_user, auth.uid());
begin
  if uid is null then return; end if;
  insert into channel_subs (user_id, channel_id)
    select uid, c.id from channels c
    where c.is_default = true and c.name <> '19금'
    on conflict do nothing;
end $$;

-- 2) 온보딩 완료 시 자동 팔로우(기존 로직 + seed)
create or replace function mark_onboarded() returns boolean
  language plpgsql security definer set search_path to 'public' as $$
declare prev timestamptz;
begin
  select onboarded_at into prev from public.user_profiles where user_id = auth.uid();
  if prev is null then
    update public.user_profiles set onboarded_at = now() where user_id = auth.uid();
    perform seed_default_subs(auth.uid());   -- 🏛 기본 채널 자동 팔로우
  end if;
  return prev is not null;
end $$;

-- 3) follower_count 유지 트리거(구독 증감)
create or replace function channel_follower_count() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    update channels set follower_count = follower_count + 1 where id = new.channel_id;
  elsif tg_op = 'DELETE' then
    update channels set follower_count = greatest(0, follower_count - 1) where id = old.channel_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_channel_follower on channel_subs;
create trigger trg_channel_follower
  after insert or delete on channel_subs
  for each row execute function channel_follower_count();

-- 4) 기존 유저 소급 시드(멱등) — 지금까지 가입한 유저도 기본 채널 팔로우 상태로
insert into channel_subs (user_id, channel_id)
  select u.id, c.id from auth.users u
  cross join channels c
  where c.is_default = true and c.name <> '19금'
  on conflict do nothing;

-- 5) follower_count 정합
update channels ch set follower_count = (select count(*) from channel_subs s where s.channel_id = ch.id);
