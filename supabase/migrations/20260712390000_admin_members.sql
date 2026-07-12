-- 🛠 관제 P3 — 회원 관리(우수/요주의/블랙리스트) + 정지/경고/GP/권한

create table if not exists public.user_bans (
  user_id uuid primary key,
  reason text, banned_by uuid, until timestamptz, created_at timestamptz not null default now()
);
alter table public.user_bans enable row level security;
drop policy if exists user_bans_self on public.user_bans;
create policy user_bans_self on public.user_bans for select using (auth.uid()=user_id or _is_admin());

create or replace function public._is_banned(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from user_bans b where b.user_id=p_user and (b.until is null or b.until > now()));
$$;

-- 정지 반영: 핵심 작성 경로 insert 차단(정지 유저)
do $$ begin
  begin create policy comments_not_banned on public.comments for insert to authenticated
    with check (not _is_banned(auth.uid())); exception when duplicate_object then null; end;
  begin create policy issues_not_banned on public.issues for insert to authenticated
    with check (not _is_banned(auth.uid())); exception when duplicate_object then null; end;
  begin create policy plaza_comments_not_banned on public.plaza_comments for insert to authenticated
    with check (not _is_banned(auth.uid())); exception when duplicate_object then null; end;
end $$;

-- 회원 목록(필터: all/top/watch/banned)
create or replace function public.admin_users(p_filter text default 'all', p_q text default null, p_limit int default 50)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  with base as (
    select u.id, u.nickname, u.avatar_url, up.level, up.warning_count, up.admin_flag,
      round(coalesce(b.balance,0))::bigint gp,
      (10000 + coalesce((select sum(delta) filter (where delta>0) from point_ledger where user_id=u.id),0))::bigint lifetime,
      _is_banned(u.id) banned, u.created_at
    from users u
    left join user_profiles up on up.user_id=u.id
    left join point_balances b on b.user_id=u.id
    where (p_q is null or u.nickname ilike '%'||p_q||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id',id,'nickname',nickname,'avatar_url',avatar_url,
    'level',level,'gp',gp,'lifetime',lifetime,'warning',coalesce(warning_count,0),
    'admin',coalesce(admin_flag,false),'banned',banned) order by ord), '[]'::jsonb) into v
  from (
    select *, case p_filter
      when 'top' then lifetime when 'watch' then coalesce(warning_count,0)::bigint
      when 'banned' then extract(epoch from created_at)::bigint
      else extract(epoch from created_at)::bigint end ord
    from base
    where case p_filter when 'watch' then coalesce(warning_count,0)>0
                        when 'banned' then banned else true end
    order by ord desc limit p_limit
  ) x;
  return jsonb_build_object('ok',true,'rows',v);
end $$;

create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select jsonb_build_object('ok',true,
    'nickname',u.nickname,'avatar_url',u.avatar_url,'email',u.email,'created_at',u.created_at,
    'level',up.level,'warning',coalesce(up.warning_count,0),'admin',coalesce(up.admin_flag,false),
    'gp',round(coalesce(pb.balance,0)),'banned',_is_banned(p_user),
    'ban_reason',(select reason from user_bans where user_id=p_user),
    'issues',(select count(*) from issues where user_id=p_user),
    'comments',(select count(*) from comments where user_id=p_user and status<>'deleted'),
    'votes',(select count(*) from votes where user_id=p_user),
    'reports_against',(select count(*) from content_reports r where
        (r.content_type='comment' and r.content_id in (select id::text from comments where user_id=p_user))
     or (r.content_type='issue' and r.content_id in (select id::text from issues where user_id=p_user)))
  ) into v from users u
    left join user_profiles up on up.user_id=u.id
    left join point_balances pb on pb.user_id=u.id
    where u.id=p_user;
  return coalesce(v, jsonb_build_object('ok',false,'reason','not_found'));
end $$;

create or replace function public.admin_set_ban(p_user uuid, p_reason text, p_days int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  insert into user_bans(user_id, reason, banned_by, until)
    values (p_user, p_reason, auth.uid(), case when p_days is null then null else now()+make_interval(days=>p_days) end)
  on conflict (user_id) do update set reason=excluded.reason, banned_by=auth.uid(), until=excluded.until, created_at=now();
  perform _admin_log('ban', p_user::text, jsonb_build_object('reason',p_reason,'days',p_days));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_unban(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  delete from user_bans where user_id=p_user;
  perform _admin_log('unban', p_user::text, null);
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_adjust_warning(p_user uuid, p_delta int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update user_profiles set warning_count = greatest(0, coalesce(warning_count,0)+p_delta) where user_id=p_user returning warning_count into v;
  perform _admin_log('warning', p_user::text, jsonb_build_object('delta',p_delta));
  return jsonb_build_object('ok',true,'warning',v);
end $$;

create or replace function public.admin_grant_gp(p_user uuid, p_amount int, p_reason text default 'admin_grant')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  insert into point_balances(user_id) values (p_user) on conflict do nothing;
  update point_balances set balance = greatest(0, balance + p_amount), updated_at=now() where user_id=p_user;
  insert into point_ledger(user_id, delta, reason) values (p_user, p_amount, p_reason);
  perform _admin_log('grant_gp', p_user::text, jsonb_build_object('amount',p_amount));
  return jsonb_build_object('ok',true);
end $$;

create or replace function public.admin_set_role(p_user uuid, p_admin boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update user_profiles set admin_flag = p_admin where user_id=p_user;
  perform _admin_log('set_role', p_user::text, jsonb_build_object('admin',p_admin));
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.admin_users(text,text,int)          to authenticated;
grant execute on function public.admin_user_detail(uuid)             to authenticated;
grant execute on function public.admin_set_ban(uuid,text,int)        to authenticated;
grant execute on function public.admin_unban(uuid)                   to authenticated;
grant execute on function public.admin_adjust_warning(uuid,int)      to authenticated;
grant execute on function public.admin_grant_gp(uuid,int,text)       to authenticated;
grant execute on function public.admin_set_role(uuid,boolean)        to authenticated;
