-- 🛠 관제 P2 — 콘텐츠 통합 관리 + 신고 모더레이션 (모두 _is_admin 게이트)

-- 통합 콘텐츠 목록 (이슈/광장/예측/뉴스) + 인사이트 + 정렬/검색
create or replace function public.admin_content(p_type text default 'all', p_sort text default 'recent', p_q text default null, p_limit int default 40)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  with rows as (
    select 'issue' type, i.id::text id, i.title, u.nickname author, i.created_at,
      (coalesce(i.pro_count,0)+coalesce(i.con_count,0)) votes,
      (select count(*) from comments c where c.issue_id=i.id and c.status<>'deleted') comments,
      (select count(*) from issue_likes l where l.issue_id=i.id) likes
    from issues i left join users u on u.id=i.user_id
    where (p_type='all' or p_type='issue') and (p_q is null or i.title ilike '%'||p_q||'%')
    union all
    select 'plaza', p.id::text, p.title, u.nickname, p.created_at,
      coalesce(p.up_count,0), (select count(*) from plaza_comments c where c.post_id=p.id), coalesce(p.up_count,0)
    from plaza_posts p left join users u on u.id=p.user_id
    where (p_type='all' or p_type='plaza') and (p_q is null or p.title ilike '%'||p_q||'%')
    union all
    select 'market', m.id::text, m.question, u.nickname, m.created_at,
      0, (select count(*) from market_comments c where c.market_id=m.id), round(coalesce(m.volume,0))::int
    from markets m left join users u on u.id=m.created_by
    where (p_type='all' or p_type='market') and (p_q is null or m.question ilike '%'||p_q||'%')
    union all
    select 'news', n.id::text, n.title, '갈라뉴스', n.created_at,
      0, (select count(*) from galla_news_comments c where c.news_id=n.id), 0
    from galla_news n
    where (p_type='all' or p_type='news') and (p_q is null or n.title ilike '%'||p_q||'%')
  )
  select coalesce(jsonb_agg(jsonb_build_object('type',type,'id',id,'title',title,'author',author,
    'created_at',created_at,'votes',votes,'comments',comments,'likes',likes,
    'score',(votes*2+comments*3+likes)) order by
      case when p_sort='popular' then (votes*2+comments*3+likes) else null end desc nulls last,
      created_at desc), '[]'::jsonb)
    into v from (select * from rows order by
      case when p_sort='popular' then (votes*2+comments*3+likes) else 0 end desc, created_at desc limit p_limit) x;
  return jsonb_build_object('ok',true,'rows',v);
end $$;

-- 콘텐츠 삭제(관리자) — 타입별 기존 delete RPC 재사용
create or replace function public.admin_delete_content(p_type text, p_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_type='issue' then perform delete_issue(p_id::bigint);
  elsif p_type='plaza' then perform delete_plaza_post(p_id::uuid);
  elsif p_type='market' then perform delete_market(p_id::bigint);
  elsif p_type='news' then delete from galla_news where id=p_id::bigint;
  else return jsonb_build_object('ok',false,'reason','bad_type'); end if;
  perform _admin_log('delete_content', p_type||':'||p_id, null);
  return jsonb_build_object('ok',true);
end $$;

-- 신고 큐
create or replace function public.admin_reports(p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'content_type',r.content_type,'content_id',r.content_id,'reason',r.reason,
    'reporter',ru.nickname,'created_at',r.created_at,
    'preview', case r.content_type
      when 'comment' then (select left(content,60) from comments where id=r.content_id::bigint)
      when 'issue' then (select left(title,60) from issues where id=r.content_id::bigint)
      else null end) order by r.created_at desc), '[]'::jsonb) into v
  from content_reports r left join users ru on ru.id=r.reporter_id
  limit p_limit;
  return jsonb_build_object('ok',true,'rows',v,'count',(select count(*) from content_reports));
end $$;

-- 신고 처리: dismiss(기각) | delete(콘텐츠 삭제) — 처리 후 신고 제거
create or replace function public.admin_resolve_report(p_id bigint, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r content_reports%rowtype;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into r from content_reports where id=p_id;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if p_action='delete' then
    if r.content_type='comment' then update comments set status='deleted' where id=r.content_id::bigint;
    elsif r.content_type='issue' then perform delete_issue(r.content_id::bigint);
    end if;
    perform _admin_log('report_delete', r.content_type||':'||r.content_id, null);
  else
    perform _admin_log('report_dismiss', r.content_type||':'||r.content_id, null);
  end if;
  delete from content_reports where id=p_id;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.admin_content(text,text,text,int) to authenticated;
grant execute on function public.admin_delete_content(text,text)   to authenticated;
grant execute on function public.admin_reports(int)                to authenticated;
grant execute on function public.admin_resolve_report(bigint,text) to authenticated;
