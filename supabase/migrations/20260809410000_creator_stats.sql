-- 📊 내 글 통계 (2026-08-09) — 이용권 프렌드↑ 혜택
--
--  현실 확인부터: 조회수는 **누적값만** 있다(issues/plaza_posts/posts.view_count).
--  일별 추이를 보여주려면 스냅샷을 쌓아야 하고, 쌓기 시작한 날부터만 나온다.
--  반대로 댓글·투표·좋아요·팔로우는 created_at이 있어서 **과거까지 바로** 뽑힌다.
--  → 조회는 오늘부터 쌓고, 반응은 지금 당장 보여준다. 화면에서도 그렇게 설명한다.

-- ─── 일별 조회수 스냅샷. delta가 본체다(누적값은 추이를 못 보여준다).
create table if not exists public.content_daily_views (
  day         date not null,
  kind        text not null,          -- issue | plaza | post
  content_id  text not null,
  user_id     uuid,
  views_total int  not null default 0,
  views_delta int  not null default 0,
  primary key (day, kind, content_id)
);
create index if not exists idx_cdv_user_day on public.content_daily_views(user_id, day desc);
alter table public.content_daily_views enable row level security;
revoke all on public.content_daily_views from anon, authenticated;   -- 읽기는 RPC로만

-- ─── 스냅샷 1회. 크론이 매일 부른다. 수동 재실행해도 안전(같은 날은 덮어쓴다).
--  ⚠️ galla_news는 제외한다 — AI가 만든 것이라 '내 글'이 아니다.
create or replace function public.snapshot_daily_views()
returns int language plpgsql security definer set search_path to 'public' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; v_n int;
begin
  with cur as (
    select 'issue' kind, id::text cid, user_id, coalesce(view_count,0) v from issues where user_id is not null
    union all
    select 'plaza', id::text, user_id, coalesce(view_count,0) from plaza_posts where user_id is not null
    union all
    select 'post',  id::text, user_id, coalesce(view_count,0) from posts where user_id is not null
  ), prev as (
    -- '어제'가 아니라 '그 콘텐츠의 가장 최근 스냅샷'과 비교한다.
    -- 크론이 하루 걸러 실패해도 델타가 0으로 뭉개지지 않는다.
    select distinct on (kind, content_id) kind, content_id, views_total
      from content_daily_views where day < v_day
     order by kind, content_id, day desc
  )
  insert into content_daily_views (day, kind, content_id, user_id, views_total, views_delta)
  select v_day, c.kind, c.cid, c.user_id, c.v, greatest(0, c.v - coalesce(p.views_total, c.v))
    from cur c left join prev p on p.kind = c.kind and p.content_id = c.cid
  on conflict (day, kind, content_id) do update
    set views_total = excluded.views_total,
        views_delta = excluded.views_delta,
        user_id     = excluded.user_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 첫 스냅샷을 지금 찍어 기준선을 만든다(안 그러면 내일 델타가 전체 누적값이 된다)
select public.snapshot_daily_views();

-- 매일 03:10 KST (= 18:10 UTC)
select cron.unschedule('snapshot_daily_views_job')
 where exists (select 1 from cron.job where jobname = 'snapshot_daily_views_job');
select cron.schedule('snapshot_daily_views_job', '10 18 * * *', 'select public.snapshot_daily_views()');

-- ─── 내 통계. 이용권 features에 stats가 있어야 본다.
--  ⚠️ 남의 통계는 못 본다 — auth.uid()만 본다. 인자로 uid를 받지 않는 이유다.
create or replace function public.my_stats(p_days int default 14)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_ok boolean; v_from date; v_out jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  v_ok := coalesce((select v -> tier_of(v_uid) -> 'features' from app_settings where k='ai_tiers')
                   ? 'stats', false);
  if not v_ok then
    -- 잠금이어도 '총합'은 준다 — 뭘 얻는지 보여야 구독한다. 추이만 가린다.
    return jsonb_build_object('ok',true,'locked',true,
      'need_tier','friend',
      'totals', jsonb_build_object(
        'issues',  (select count(*) from issues where user_id=v_uid),
        'plaza',   (select count(*) from plaza_posts where user_id=v_uid),
        'views',   (select coalesce(sum(view_count),0) from issues where user_id=v_uid)
                 + (select coalesce(sum(view_count),0) from plaza_posts where user_id=v_uid),
        'followers',(select count(*) from follows where following=v_uid)));
  end if;

  p_days := least(greatest(coalesce(p_days,14), 7), 90);
  v_from := ((now() at time zone 'Asia/Seoul')::date - (p_days - 1));

  select jsonb_build_object(
    'ok', true, 'locked', false, 'days', p_days,
    'totals', jsonb_build_object(
      'issues',   (select count(*) from issues where user_id=v_uid),
      'plaza',    (select count(*) from plaza_posts where user_id=v_uid),
      'views',    (select coalesce(sum(view_count),0) from issues where user_id=v_uid)
                + (select coalesce(sum(view_count),0) from plaza_posts where user_id=v_uid),
      'comments', (select count(*) from comments c join issues i on i.id=c.issue_id
                    where i.user_id=v_uid and c.author_id is distinct from v_uid),
      'votes',    (select count(*) from votes vt join issues i on i.id=vt.issue_id where i.user_id=v_uid),
      'followers',(select count(*) from follows where following=v_uid)),
    -- 일별 추이: 조회는 스냅샷(오늘부터), 나머지는 created_at으로 과거까지
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day', d::date::text, 'views', vw, 'comments', cm, 'votes', vt, 'followers', fl) order by d), '[]'::jsonb)
        from generate_series(v_from, (now() at time zone 'Asia/Seoul')::date, '1 day') d
        cross join lateral (
          select
            (select coalesce(sum(views_delta),0) from content_daily_views
              where user_id=v_uid and day=d::date) vw,
            (select count(*) from comments c join issues i on i.id=c.issue_id
              where i.user_id=v_uid and c.author_id is distinct from v_uid
                and (c.created_at at time zone 'Asia/Seoul')::date = d::date) cm,
            (select count(*) from votes v2 join issues i on i.id=v2.issue_id
              where i.user_id=v_uid and (v2.created_at at time zone 'Asia/Seoul')::date = d::date) vt,
            (select count(*) from follows f
              where f.following=v_uid and (f.created_at at time zone 'Asia/Seoul')::date = d::date) fl
        ) x),
    -- 반응 좋은 글 TOP 5 (이슈·광장 통합)
    -- ⚠️ UNION 결과를 표현식으로 정렬하려면 한 번 감싸야 한다(UNION의 ORDER BY는 컬럼명만 허용)
    'top', (
      select coalesce(jsonb_agg(t order by (t->>'score')::int desc), '[]'::jsonb) from (
       select t from (
        select jsonb_build_object('kind','issue','id',i.id,'title',i.title,
                 'views',coalesce(i.view_count,0),
                 'reactions',(select count(*) from comments c where c.issue_id=i.id)
                            +(select count(*) from votes v3 where v3.issue_id=i.id),
                 'score',coalesce(i.view_count,0)
                        +5*((select count(*) from comments c where c.issue_id=i.id)
                           +(select count(*) from votes v3 where v3.issue_id=i.id))) t
          from issues i where i.user_id=v_uid
        union all
        select jsonb_build_object('kind','plaza','id',p.id,'title',p.title,
                 'views',coalesce(p.view_count,0),
                 'reactions',(select count(*) from plaza_comments pc where pc.post_id=p.id),
                 'score',coalesce(p.view_count,0)
                        +5*(select count(*) from plaza_comments pc where pc.post_id=p.id)) t
          from plaza_posts p where p.user_id=v_uid
       ) u order by (t->>'score')::int desc limit 5) s),
    -- 내 이슈에 모인 진영 반응 (여론 플랫폼다운 지표)
    'factions', (
      select jsonb_build_object(
        'pro', coalesce(sum(case when v4.type='pro' then 1 else 0 end),0),
        'con', coalesce(sum(case when v4.type='con' then 1 else 0 end),0))
        from votes v4 join issues i on i.id=v4.issue_id where i.user_id=v_uid)
  ) into v_out;
  return v_out;
end $$;
grant execute on function public.my_stats(int) to authenticated;
