-- 🔒 공개·비공개(26.9.18 사장님 「마이페이지 공개 비공개, 콘텐츠마다 설정, 업로드한 콘텐츠 전환」 + 계정 비공개는 인스타식)
--  · 콘텐츠: visibility 'public' | 'private'(나만 보기) — 이슈·광장·숏판롱판
--  · 계정: users.is_private — 승인한 팔로워만 내 콘텐츠를 본다. 팔로우는 '요청 → 수락'
--  · 막는 곳은 화면이 아니라 RLS(SELECT). 피드·검색·프로필·상세가 전부 테이블 직접 조회라 한 곳에서 막힌다.

-- 1) 칸
alter table public.users add column if not exists is_private boolean not null default false;
grant select (is_private) on public.users to anon, authenticated;     -- ⚠️ users 는 칸 단위 권한 — 빠뜨리면 목록이 통째로 빈다
alter table public.issues      add column if not exists visibility text not null default 'public';
alter table public.plaza_posts add column if not exists visibility text not null default 'public';
alter table public.posts       add column if not exists visibility text not null default 'public';
do $$ begin
  alter table public.issues      add constraint issues_visibility_chk      check (visibility in ('public','private'));
  exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plaza_posts add constraint plaza_posts_visibility_chk check (visibility in ('public','private'));
  exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.posts       add constraint posts_visibility_chk       check (visibility in ('public','private'));
  exception when duplicate_object then null; end $$;

-- 2) 판정 — 순서가 곧 성능: 대부분(공개 글·공개 계정)은 첫 몇 줄에서 끝난다
create or replace function public.user_is_private(p_uid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce((select is_private from users where id = p_uid), false);
$$;
create or replace function public.can_see_content(p_owner uuid, p_vis text) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select case
    when p_owner is not null and p_owner = auth.uid() then true
    when coalesce(p_vis, 'public') <> 'public' then public.is_admin()
    when p_owner is null then true
    when not public.user_is_private(p_owner) then true
    when auth.uid() is not null and exists (select 1 from follows f where f.follower = auth.uid() and f.following = p_owner) then true
    else public.is_admin()
  end;
$$;
grant execute on function public.can_see_content(uuid, text) to anon, authenticated;
grant execute on function public.user_is_private(uuid) to anon, authenticated;

-- 3) 읽기 규칙
drop policy if exists "public_read_issues" on public.issues;
drop policy if exists "issues_read_visible" on public.issues;
create policy "issues_read_visible" on public.issues for select using (public.can_see_content(user_id, visibility));

drop policy if exists "read all plaza posts" on public.plaza_posts;
drop policy if exists "plaza_posts_select_all" on public.plaza_posts;
drop policy if exists "public read plaza posts" on public.plaza_posts;
drop policy if exists "plaza_posts_read_visible" on public.plaza_posts;
create policy "plaza_posts_read_visible" on public.plaza_posts for select using (public.can_see_content(user_id, visibility));

drop policy if exists "posts_sel" on public.posts;
create policy "posts_sel" on public.posts for select using (
  (is_published and moderation_status <> 'blocked' and public.can_see_content(user_id, visibility))
  or user_id = auth.uid());

-- 4) 팔로우 — 비공개 계정엔 바로 팔로우 불가(요청으로)
drop policy if exists "Users follow others" on public.follows;
create policy "Users follow others" on public.follows for insert
  with check (auth.uid() = follower and not public.user_is_private(following));

create table if not exists public.follow_requests (
  requester uuid not null, target uuid not null, created_at timestamptz not null default now(),
  primary key (requester, target)
);
alter table public.follow_requests enable row level security;
drop policy if exists "fr_read_own" on public.follow_requests;
create policy "fr_read_own" on public.follow_requests for select using (auth.uid() = requester or auth.uid() = target);

-- 5) 함수
create or replace function public.follow_state(p_target uuid) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'private', public.user_is_private(p_target),
    'state', case
      when auth.uid() is null then 'guest'
      when auth.uid() = p_target then 'self'
      when exists (select 1 from follows where follower = auth.uid() and following = p_target) then 'following'
      when exists (select 1 from follow_requests where requester = auth.uid() and target = p_target) then 'requested'
      else 'none' end,
    'requests', case when auth.uid() = p_target then (select count(*) from follow_requests where target = p_target) else null end);
$$;

create or replace function public.follow_user(p_target uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if me = p_target then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if public._me_banned() then return jsonb_build_object('ok', false, 'reason', 'banned'); end if;
  if exists (select 1 from follows where follower = me and following = p_target) then
    return jsonb_build_object('ok', true, 'state', 'following'); end if;
  if public.user_is_private(p_target) then
    insert into follow_requests(requester, target) values (me, p_target) on conflict do nothing;
    begin
      perform public._notify(p_target, me, 'follow_request', null,
        public._nick(me) || '님이 팔로우를 요청했어요.', 'mypage.html?requests=1');
    exception when others then null; end;
    return jsonb_build_object('ok', true, 'state', 'requested');
  end if;
  insert into follows(follower, following) values (me, p_target) on conflict do nothing;
  return jsonb_build_object('ok', true, 'state', 'following');
end $$;

create or replace function public.cancel_follow_request(p_target uuid) returns jsonb
language sql security definer set search_path to 'public' as $$
  delete from follow_requests where requester = auth.uid() and target = p_target;
  select jsonb_build_object('ok', true, 'state', 'none');
$$;

create or replace function public.respond_follow_request(p_requester uuid, p_accept boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  delete from follow_requests where requester = p_requester and target = me;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_request'); end if;
  if p_accept then
    insert into follows(follower, following) values (p_requester, me) on conflict do nothing;
    begin
      perform public._notify(p_requester, me, 'follow_accept', null,
        public._nick(me) || '님이 팔로우 요청을 수락했어요.', 'mypage.html?user=' || me);
    exception when others then null; end;
  end if;
  return jsonb_build_object('ok', true, 'accepted', p_accept);
end $$;

create or replace function public.my_follow_requests() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object('uid', r.requester, 'nick', coalesce(u.nickname, '회원'),
           'avatar', u.avatar_url, 'at', r.created_at) order by r.created_at desc), '[]'::jsonb)
    from follow_requests r left join users u on u.id = r.requester
   where r.target = auth.uid();
$$;

create or replace function public.set_profile_private(p_on boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); n int := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  update users set is_private = p_on where id = me;
  if not p_on then   -- 공개로 돌리면 대기 중인 요청은 전부 수락(인스타와 같다)
    insert into follows(follower, following) select requester, me from follow_requests where target = me on conflict do nothing;
    get diagnostics n = row_count;
    delete from follow_requests where target = me;
  end if;
  return jsonb_build_object('ok', true, 'private', p_on, 'auto_accepted', n);
end $$;

create or replace function public.set_content_visibility(p_kind text, p_id text, p_vis text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_vis not in ('public','private') then return jsonb_build_object('ok', false, 'reason', 'bad_vis'); end if;
  if p_kind = 'issue' then
    update issues set visibility = p_vis where id::text = p_id and (user_id = me or public.is_admin());
  elsif p_kind = 'plaza' then
    update plaza_posts set visibility = p_vis where id::text = p_id and (user_id = me or public.is_admin());
  elsif p_kind = 'post' then
    update posts set visibility = p_vis where id::text = p_id and (user_id = me or public.is_admin());
  else return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n > 0, 'visibility', p_vis, 'reason', case when n = 0 then 'not_owner' end);
end $$;

grant execute on function public.follow_state(uuid), public.follow_user(uuid), public.cancel_follow_request(uuid),
  public.respond_follow_request(uuid, boolean), public.my_follow_requests(), public.set_profile_private(boolean),
  public.set_content_visibility(text, text, text) to authenticated;
grant execute on function public.follow_state(uuid) to anon;
