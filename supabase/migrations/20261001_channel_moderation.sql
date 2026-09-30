-- 광장 채널 운영자 관리 1차(2026-10-01, 레딧/블라인드식 개방형 모더레이션).
-- 필수 4종: 조정 큐(신고 처리) · 유저 제재(밴/뮤트) · 공지 고정 · 조치 로그(투명성).
-- 카페식 회원제(가입승인·등업) 배제. 운영자 = channels.owner_id 또는 channel_mods.
-- Management API 로 적용. 멱등.

-- ── 공지 ──
alter table channels add column if not exists notice text default '';

-- ── 채널 제재(밴/뮤트) ──
create table if not exists channel_bans (
  channel_id uuid references channels(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  kind       text default 'ban',        -- 'ban'(글·댓글 금지) | 'mute'(댓글만 금지)
  reason     text default '',
  until      timestamptz,               -- null = 영구
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  primary key (channel_id, user_id)
);
alter table channel_bans enable row level security;
drop policy if exists cban_read on channel_bans;
-- 본인 제재 여부는 본인이 읽고, 운영자는 채널 전체를 읽는다(정책은 아래 mod 함수로 판정하지 않고 단순 조건)
create policy cban_read on channel_bans for select using (
  user_id = auth.uid()
  or exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid())
  or exists (select 1 from channel_mods m where m.channel_id = channel_bans.channel_id and m.user_id = auth.uid())
);
-- 쓰기는 RPC(security definer)로만.

-- ── 조치 로그(투명성) ──
create table if not exists channel_mod_log (
  id          bigserial primary key,
  channel_id  uuid references channels(id) on delete cascade,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text,                     -- remove_post|remove_comment|ban|mute|unban|pin_notice|...
  target_type text,                     -- post|comment|user
  target_id   text,
  reason      text default '',
  created_at  timestamptz default now()
);
alter table channel_mod_log enable row level security;
drop policy if exists cmodlog_read on channel_mod_log;
create policy cmodlog_read on channel_mod_log for select using (
  exists (select 1 from channels c where c.id = channel_id and c.owner_id = auth.uid())
  or exists (select 1 from channel_mods m where m.channel_id = channel_mod_log.channel_id and m.user_id = auth.uid())
);
create index if not exists idx_modlog_channel on channel_mod_log(channel_id, created_at desc);

-- ── 운영자 판별 ──
create or replace function channel_is_mod(p_channel uuid) returns boolean
  language sql security definer set search_path to 'public' stable as $$
  select coalesce(
    exists (select 1 from channels c where c.id = p_channel and c.owner_id = auth.uid())
    or exists (select 1 from channel_mods m where m.channel_id = p_channel and m.user_id = auth.uid())
    or public.is_admin(), false);
$$;

-- ── 조정 큐: 그 채널의 신고된 글 목록 ──
create or replace function mod_queue(p_channel uuid)
  returns table(post_id uuid, title text, author uuid, reports bigint, last_reason text, reported_at timestamptz)
  language plpgsql security definer set search_path to 'public' stable as $$
begin
  if not channel_is_mod(p_channel) then raise exception 'not_authorized'; end if;
  return query
    select p.id, p.title, p.user_id,
           count(r.id) as reports,
           (array_agg(r.reason order by r.created_at desc))[1] as last_reason,
           max(r.created_at) as reported_at
    from content_reports r
    join plaza_posts p on p.id::text = r.content_id
    where r.content_type = 'plaza' and p.channel_id = p_channel
    group by p.id, p.title, p.user_id
    order by reports desc, reported_at desc;
end $$;

-- ── 신고 무시(승인=그대로 둠) ──
create or replace function mod_dismiss_reports(p_post uuid) returns void
  language plpgsql security definer set search_path to 'public' as $$
declare ch uuid;
begin
  select channel_id into ch from plaza_posts where id = p_post;
  if ch is null or not channel_is_mod(ch) then raise exception 'not_authorized'; end if;
  delete from content_reports where content_type = 'plaza' and content_id = p_post::text;
  insert into channel_mod_log(channel_id, actor_id, action, target_type, target_id)
    values (ch, auth.uid(), 'dismiss_reports', 'post', p_post::text);
end $$;

-- ── 글 제거(운영자) ──
create or replace function mod_remove_post(p_post uuid, p_reason text default '') returns void
  language plpgsql security definer set search_path to 'public' as $$
declare ch uuid;
begin
  select channel_id into ch from plaza_posts where id = p_post;
  if ch is null or not channel_is_mod(ch) then raise exception 'not_authorized'; end if;
  delete from plaza_comment_votes where comment_id in (select id from plaza_comments where post_id = p_post);
  delete from plaza_comments where post_id = p_post;
  delete from plaza_votes     where post_id = p_post;
  delete from plaza_bookmarks where post_id = p_post;
  delete from plaza_posts     where id = p_post;
  delete from content_reports where content_type = 'plaza' and content_id = p_post::text;
  insert into channel_mod_log(channel_id, actor_id, action, target_type, target_id, reason)
    values (ch, auth.uid(), 'remove_post', 'post', p_post::text, p_reason);
end $$;

-- ── 유저 제재/해제 ──
create or replace function mod_ban_user(p_channel uuid, p_user uuid, p_kind text default 'ban', p_reason text default '', p_days int default null) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not channel_is_mod(p_channel) then raise exception 'not_authorized'; end if;
  if exists (select 1 from channels c where c.id = p_channel and c.owner_id = p_user) then
    raise exception 'cannot_ban_owner';
  end if;
  insert into channel_bans(channel_id, user_id, kind, reason, until, created_by)
    values (p_channel, p_user, coalesce(p_kind,'ban'), coalesce(p_reason,''),
            case when p_days is null then null else now() + (p_days || ' days')::interval end, auth.uid())
    on conflict (channel_id, user_id) do update
      set kind = excluded.kind, reason = excluded.reason, until = excluded.until, created_by = auth.uid(), created_at = now();
  insert into channel_mod_log(channel_id, actor_id, action, target_type, target_id, reason)
    values (p_channel, auth.uid(), coalesce(p_kind,'ban'), 'user', p_user::text, coalesce(p_reason,''));
end $$;

create or replace function mod_unban_user(p_channel uuid, p_user uuid) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not channel_is_mod(p_channel) then raise exception 'not_authorized'; end if;
  delete from channel_bans where channel_id = p_channel and user_id = p_user;
  insert into channel_mod_log(channel_id, actor_id, action, target_type, target_id)
    values (p_channel, auth.uid(), 'unban', 'user', p_user::text);
end $$;

-- ── 공지 설정 ──
create or replace function mod_set_notice(p_channel uuid, p_text text) returns void
  language plpgsql security definer set search_path to 'public' as $$
begin
  if not channel_is_mod(p_channel) then raise exception 'not_authorized'; end if;
  update channels set notice = coalesce(p_text, '') where id = p_channel;
  insert into channel_mod_log(channel_id, actor_id, action, target_type, target_id, reason)
    values (p_channel, auth.uid(), 'notice', 'channel', p_channel::text, left(coalesce(p_text,''), 200));
end $$;

-- ── 밴 강제: 밴/뮤트된 유저의 그 채널 글 작성 차단 ──
create or replace function plaza_enforce_ban() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
declare b channel_bans;
begin
  if new.channel_id is null then return new; end if;
  select * into b from channel_bans where channel_id = new.channel_id and user_id = new.user_id;
  if b.channel_id is not null and b.kind = 'ban' and (b.until is null or b.until > now()) then
    raise exception 'channel_banned';
  end if;
  return new;
end $$;
drop trigger if exists trg_plaza_enforce_ban on plaza_posts;
create trigger trg_plaza_enforce_ban
  before insert on plaza_posts
  for each row execute function plaza_enforce_ban();
