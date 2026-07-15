-- 회원 목록 스프레드시트화 — 신원·지갑·활동·후원·접속을 한 행에 전부
create or replace function public.admin_users(p_filter text default 'all', p_q text default null, p_limit int default 200)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  with base as (
    select u.id, u.nickname, u.avatar_url, u.email, u.phone, u.region, u.gender, u.birth_year,
      up.level, up.warning_count, up.admin_flag,
      round(coalesce(b.balance,0))::bigint gp_free,
      round(coalesce(b.paid_balance,0))::bigint gp_paid,
      coalesce((select balance from gc_balances g where g.user_id=u.id),0)::bigint gc,
      (10000 + coalesce((select sum(delta) filter (where delta>0) from point_ledger where user_id=u.id),0))::bigint lifetime,
      _is_banned(u.id) banned, u.created_at,
      (select max(created_at) from activity_pings ap where ap.user_id=u.id) last_ping,
      (select count(*) from issues i where i.user_id=u.id)::int issues,
      (select count(*) from comments c where c.user_id=u.id and c.status<>'deleted')::int comments,
      (select count(*) from votes vt where vt.user_id=u.id)::int votes,
      (select count(*) from predict_bets pb where pb.user_id=u.id)::int bets,
      (select coalesce(sum(amount),0) from donations d where d.supporter_id=u.id and d.status='paid')::bigint don_sent,
      (select coalesce(sum(net),0) from donations d where d.creator_id=u.id and d.status='paid')::bigint don_recv
    from users u
    left join user_profiles up on up.user_id=u.id
    left join point_balances b on b.user_id=u.id
    where (p_q is null or u.nickname ilike '%'||p_q||'%' or u.email ilike '%'||p_q||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id',id,'nickname',nickname,'avatar_url',avatar_url,
    'email',email,'phone',phone,'region',region,'gender',gender,'birth_year',birth_year,
    'level',level,'gp_free',gp_free,'gp_paid',gp_paid,'gc',gc,'lifetime',lifetime,
    'warning',coalesce(warning_count,0),'admin',coalesce(admin_flag,false),'banned',banned,
    'created_at',created_at,'last_ping',last_ping,
    'issues',issues,'comments',comments,'votes',votes,'bets',bets,
    'don_sent',don_sent,'don_recv',don_recv) order by ord), '[]'::jsonb) into v
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
grant execute on function public.admin_users(text,text,int) to authenticated;
