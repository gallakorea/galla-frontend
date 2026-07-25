-- 갈라뉴스 90일 정리 (사장님 확정)
-- 지금까지 galla_news에는 retention이 없었다. purge_old_news_daily는 원본 뉴스
-- (news_articles_raw, 451MB)만 30일 정리하고 갈라뉴스 본문은 계속 쌓였다.
-- 하루 250~400건 페이스 × 무기한 = 무한 증식이라 90일에서 끊는다.
--
-- ⚠️ galla_news를 지우면 자식이 전부 CASCADE로 함께 지워진다
--    (galla_news_comments / reactions / bookmarks / sources).
--    댓글·리액션·북마크는 유저가 남긴 것이고, 조회된 기사는 검색 유입 자산이다.
--    그래서 '아무 흔적도 없는' 기사만 지운다:
--      · 댓글 없음 · 리액션 없음 · 북마크 없음 · 조회수 0
--    하나라도 붙었으면 90일이 지나도 남긴다.

create or replace function purge_galla_news(days int default 90, batch int default 5000)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.galla_news g
   where g.ctid in (
     select t.ctid from public.galla_news t
      where t.created_at < now() - make_interval(days => days)
        and coalesce(t.view_count, 0) = 0
        and not exists (select 1 from public.galla_news_comments  c where c.news_id = t.id)
        and not exists (select 1 from public.galla_news_reactions r where r.news_id = t.id)
        and not exists (select 1 from public.galla_news_bookmarks b where b.news_id = t.id)
      limit batch
   );
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function purge_galla_news(int, int) from anon, authenticated, public;

-- 매일 03:40 KST 기준이 아니라 UTC 기준 스케줄(기존 크론들과 동일 관례).
-- purge_old_news_daily(03:30)와 겹치지 않게 10분 뒤로 둔다.
do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'purge_galla_news_daily';
  if v_id is not null then
    perform cron.unschedule(v_id);
  end if;
  perform cron.schedule('purge_galla_news_daily', '40 3 * * *',
                        'select public.purge_galla_news(90, 5000);');
end $$;
