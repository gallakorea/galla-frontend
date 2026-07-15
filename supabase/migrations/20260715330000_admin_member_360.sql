-- 🛠 관제 회원관리 360° — 신원 전체·전 활동 내역(익명 포함)·수정 권한

/* ── 회원 상세 v2: 신원(이메일·전화·지역·성별·출생연도) + 최근 접속 + 지갑(무료/충전/GC) + 활동 요약 ── */
create or replace function public.admin_user_detail(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select jsonb_build_object('ok',true,
    'user_id',u.id,
    'nickname',u.nickname,'avatar_url',u.avatar_url,'bio',u.bio,
    'email',u.email,'phone',u.phone,'region',u.region,'gender',u.gender,'birth_year',u.birth_year,
    'created_at',u.created_at,
    'last_sign_in',(select last_sign_in_at from auth.users au where au.id=u.id),
    'last_ping',(select max(created_at) from activity_pings where user_id=u.id),
    'level',up.level,'warning',coalesce(up.warning_count,0),'admin',coalesce(up.admin_flag,false),
    'gp_free',round(coalesce(pb.balance,0)),'gp_paid',round(coalesce(pb.paid_balance,0)),
    'gc',coalesce((select balance from gc_balances where user_id=u.id),0),
    'banned',_is_banned(p_user),
    'ban_reason',(select reason from user_bans where user_id=p_user),
    'ban_until',(select until from user_bans where user_id=p_user),
    'issues',(select count(*) from issues where user_id=p_user),
    'issues_anon',(select count(*) from issues where user_id=p_user and coalesce(is_anonymous,false)),
    'comments',(select count(*) from comments where user_id=p_user and status<>'deleted'),
    'comments_anon',(select count(*) from comments where user_id=p_user and status<>'deleted' and coalesce(is_anonymous,false)),
    'plaza_posts',(select count(*) from plaza_posts where user_id=p_user),
    'plaza_comments',(select count(*) from plaza_comments where user_id=p_user),
    'votes',(select count(*) from votes where user_id=p_user),
    'bets',(select count(*) from predict_bets where user_id=p_user),
    'bet_wins',(select count(*) from predict_bets where user_id=p_user and won),
    'donations_sent',(select coalesce(sum(amount),0) from donations where supporter_id=p_user and status='paid'),
    'donations_recv',(select coalesce(sum(net),0) from donations where creator_id=p_user and status='paid'),
    'withdrawn',(select coalesce(sum(amount),0) from withdrawals where user_id=p_user and status in ('done','completed','approved')),
    'reports_against',(select count(*) from content_reports r where
        (r.content_type='comment' and r.content_id in (select id::text from comments where user_id=p_user))
     or (r.content_type='issue' and r.content_id in (select id::text from issues where user_id=p_user)))
  ) into v from users u
    left join user_profiles up on up.user_id=u.id
    left join point_balances pb on pb.user_id=u.id
    where u.id=p_user;
  return coalesce(v, jsonb_build_object('ok',false,'reason','not_found'));
end $$;

/* ── 전 활동 타임라인 — 익명 활동도 전부 노출(anon 플래그) ──
   p_kind: content(발제·댓글·광장·투표·예측) / gp(포인트 원장) / gc(코인·후원) / sanction(제재·관리 이력) */
create or replace function public.admin_user_timeline(p_user uuid, p_kind text default 'content', p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  if p_kind = 'content' then
    select coalesce(jsonb_agg(x order by ts desc), '[]'::jsonb) into v from (
      select jsonb_build_object('type','issue','icon','🔥','label','갈라 발제','text',title,
        'anon',coalesce(is_anonymous,false),'ts',created_at,'link','issue.html?id='||id) x, created_at ts
        from issues where user_id=p_user
      union all
      select jsonb_build_object('type','comment','icon','💬','label','전투 댓글'||case when status='deleted' then '(삭제됨)' else '' end,
        'text',left(content,80),'anon',coalesce(is_anonymous,false),'ts',created_at,'link','issue.html?id='||issue_id), created_at
        from comments where user_id=p_user
      union all
      select jsonb_build_object('type','plaza','icon','🗣','label','광장 글','text',title,
        'anon',(nickname is null or nickname in ('익명','')),'ts',created_at,'link','plaza_detail.html?id='||id), created_at
        from plaza_posts where user_id=p_user
      union all
      select jsonb_build_object('type','plaza_c','icon','🗨','label','광장 댓글','text',left(body,80),
        'anon',(anon_name is not null),'ts',created_at,'link','plaza_detail.html?id='||post_id), created_at
        from plaza_comments where user_id=p_user
      union all
      select jsonb_build_object('type','vote','icon','🗳','label','찬반 투표','text',vote_type,
        'anon',false,'ts',created_at,'link','issue.html?id='||issue_id), created_at
        from votes where user_id=p_user
      union all
      select jsonb_build_object('type','bet','icon','🎯','label','예측 참여'||case when b.settled then (case when b.won then '(적중)' else '(미적중)' end) else '' end,
        'text',(select left(question,60) from markets m where m.id=b.market_id)||' · '||round(b.stake)||'GP',
        'anon',false,'ts',b.created_at,'link','predict-market.html?id='||b.market_id), b.created_at
        from predict_bets b where b.user_id=p_user
      order by ts desc limit p_limit
    ) t;

  elsif p_kind = 'gp' then
    select coalesce(jsonb_agg(jsonb_build_object('delta',delta,'reason',reason,'market_id',market_id,'ts',created_at)
      order by created_at desc), '[]'::jsonb) into v
    from (select * from point_ledger where user_id=p_user order by created_at desc limit p_limit) l;

  elsif p_kind = 'gc' then
    select coalesce(jsonb_agg(x order by ts desc), '[]'::jsonb) into v from (
      select jsonb_build_object('kind','ledger','delta',delta,'reason',reason,'ts',created_at) x, created_at ts
        from gc_ledger where user_id=p_user
      union all
      select jsonb_build_object('kind','donation_sent','amount',amount,'to',(select nickname from users where id=creator_id),
        'ts',created_at), created_at from donations where supporter_id=p_user and status='paid'
      union all
      select jsonb_build_object('kind','donation_recv','amount',net,'from',
        case when is_anonymous then '익명' else (select nickname from users where id=supporter_id) end,
        'ts',created_at), created_at from donations where creator_id=p_user and status='paid'
      union all
      select jsonb_build_object('kind','withdrawal','amount',amount,'status',status,'ts',created_at), created_at
        from withdrawals where user_id=p_user
      order by ts desc limit p_limit
    ) t;

  elsif p_kind = 'sanction' then
    select coalesce(jsonb_agg(jsonb_build_object('action',action,'meta',meta,'by',
      (select nickname from users where id=a.actor),'ts',a.created_at) order by a.created_at desc), '[]'::jsonb) into v
    from (select * from admin_audit where target=p_user::text order by created_at desc limit p_limit) a;

  else
    return jsonb_build_object('ok',false,'reason','bad_kind');
  end if;

  return jsonb_build_object('ok',true,'rows',coalesce(v,'[]'::jsonb));
end $$;

/* ── 회원 정보 수정(닉네임·소개) — 관리자 권한 ── */
create or replace function public.admin_update_user(p_user uuid, p_nickname text default null, p_bio text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_nick text;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_nickname is not null then
    v_nick := btrim(p_nickname);
    if length(v_nick) < 2 or length(v_nick) > 20 then return jsonb_build_object('ok',false,'reason','bad_nickname'); end if;
    if exists (select 1 from users where nickname=v_nick and id<>p_user) then
      return jsonb_build_object('ok',false,'reason','dup_nickname'); end if;
    update users set nickname=v_nick where id=p_user;
    update user_profiles set nickname=v_nick where user_id=p_user;   -- 표시 캐시 동기
  end if;
  if p_bio is not null then
    update users set bio=left(btrim(p_bio),200) where id=p_user;
  end if;
  perform _admin_log('update_user', p_user::text, jsonb_build_object('nickname',p_nickname,'bio',p_bio));
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.admin_user_timeline(uuid,text,int) to authenticated;
grant execute on function public.admin_update_user(uuid,text,text) to authenticated;
