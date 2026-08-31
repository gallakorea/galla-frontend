-- 📈 브레인 성과 역연결 전 유형 확장 (2026-08-14)
-- 기존: issues.title_pattern만 채점(pattern_perf_score) → 갈라리/숏판/롱판(posts)·광장(plaza_posts)·예측(markets)도
-- 갈비스 제목 공식(title_pattern)을 기록하고, 크론이 유형별 실제 참여를 합산해 공식 점수(perf_boost)에 반영.

alter table public.posts       add column if not exists title_pattern text;
alter table public.plaza_posts add column if not exists title_pattern text;
alter table public.markets     add column if not exists title_pattern text;

-- 유형별 참여 지표: 이슈=찬반 참전, 갈라리=좋아요+댓글, 광장=업+다운, 예측=베팅 수.
-- 스케일이 제각각이지만 기존 캡(40)과 raw 평균 방식을 유지 — 유형 간 정규화는 표본이 쌓인 뒤 별도 판단.
create or replace function public.pattern_perf_score()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  with samples as (
    select title_pattern as style,
           (coalesce(pro_count,0)+coalesce(con_count,0))::numeric as eng
      from issues
     where title_pattern is not null and status='normal'
       and created_at > now() - interval '45 days'
    union all
    select title_pattern,
           (coalesce(like_count,0)+coalesce(comment_count,0))::numeric
      from posts
     where title_pattern is not null and is_published = true
       and created_at > now() - interval '45 days'
    union all
    select title_pattern,
           (coalesce(up_count,0)+coalesce(down_count,0))::numeric
      from plaza_posts
     where title_pattern is not null
       and created_at > now() - interval '45 days'
    union all
    select m.title_pattern,
           (select count(*) from predict_bets b where b.market_id = m.id)::numeric
      from markets m
     where m.title_pattern is not null
       and m.created_at > now() - interval '45 days'
  ),
  agg as (
    select style, avg(eng) as eng, count(*) as n
      from samples
     group by style
    having count(*) >= 1
  )
  update creator_patterns cp
     set perf_boost = least(40, round(a.eng))::int
    from agg a
   where cp.kind='title' and cp.style=a.style;
end;$function$;
