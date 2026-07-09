-- 뉴스 DB 비용 관리: news_articles_raw 가 DB의 64%(437MB)를 차지하고 하루 ~8천건씩
-- 무한 증가하던 문제. 목록은 24h, 검색은 "지금 뉴스"용이라 오래된 건 사실상 죽은 데이터.
--
-- 30일 초과 기사 자동 삭제(단, 갈라 이슈에 엮인 기사 issue_articles FK 참조분은 영구 보존).
-- 관리 API로 이미 적용함 + 초기 17.9만건 정리 + VACUUM FULL(205MB로 축소) 완료. 기록용.

create or replace function public.purge_old_news(days int default 30, batch int default 50000)
returns integer language plpgsql as $fn$
declare n int;
begin
  delete from public.news_articles_raw
  where ctid in (
    select t.ctid
    from public.news_articles_raw t
    where t.published_at < now() - make_interval(days => days)
      and not exists (
        select 1 from public.issue_articles ia where ia.raw_article_id = t.id
      )
    limit batch
  );
  get diagnostics n = row_count;
  return n;
end
$fn$;

-- 매일 03:30 정리
select cron.schedule(
  'purge_old_news_daily',
  '30 3 * * *',
  $$ select public.purge_old_news(30, 50000); $$
);
