-- =========================================================
-- 🔒 출시 전 보안 하드닝 (2026-07-23) — Management API로 이미 적용됨, 기록용.
-- 발견·수정 요약:
--  ① admin_wipe_markets(): 인증 가드 없이 anon 실행 가능 → 예측시장 전체 삭제 가능(치명)
--  ② ai_sticker_refund(uuid,int): 인증 없이 임의 유저에 GP 환불 → 무한 GP 발행(치명)
--  ③ 모든 _내부헬퍼(_duel_pay=GP발행 등): PUBLIC grant로 anon 직접 호출 가능
--  ④ news_articles_raw / related_groups: RLS off + anon 전체 쓰기 권한
--  ★ PostgreSQL 함수는 기본 PUBLIC EXECUTE — anon만 revoke하면 PUBLIC으로 여전히 열림.
--    반드시 FROM public 포함해서 회수해야 한다(이번 사고의 핵심 교훈).
--  ※ 엣지함수 verify_jwt(8종)·크론 Authorization 헤더(4종)는 코드/크론이라 별도 적용.
-- =========================================================

-- ① admin_wipe_markets — 관리자 가드 추가
create or replace function public.admin_wipe_markets()
returns integer language plpgsql security definer set search_path to 'public' as $fn$
declare n int;
begin
  if not _is_admin() then raise exception 'unauthorized'; end if;
  select count(*) into n from markets;
  delete from market_comment_likes; delete from market_comments; delete from market_reactions;
  delete from market_bookmarks; delete from predict_bets; delete from market_trades;
  delete from market_positions; delete from market_outcomes; delete from markets;
  return n;
end $fn$;
revoke execute on function public.admin_wipe_markets() from public, anon, authenticated;

-- ② 무한 GP 발행 함수 봉인(정상 경로는 service_role 엣지함수)
revoke execute on function public.ai_sticker_refund(uuid,integer) from public, anon, authenticated;
revoke execute on function public.purge_old_news(integer,integer) from public, anon, authenticated;

-- ③ 모든 내부 헬퍼(_접두사) 직접 호출 봉인 — 정의자 체인으로만 호출됨
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='public' and p.proname like '\_%'
             and has_function_privilege('anon',p.oid,'EXECUTE')
  loop execute format('revoke execute on function %s from public, anon, authenticated', r.sig); end loop;
end $$;

-- ④ RLS 미적용 테이블 잠금 — 읽기만 공개, 쓰기 차단(서비스가 service_role로 씀)
alter table public.news_articles_raw enable row level security;
alter table public.related_groups   enable row level security;
drop policy if exists nar_read on public.news_articles_raw;
create policy nar_read on public.news_articles_raw for select using (true);
drop policy if exists rg_read on public.related_groups;
create policy rg_read on public.related_groups for select using (true);
revoke insert, update, delete on public.news_articles_raw from anon, authenticated;
revoke insert, update, delete on public.related_groups   from anon, authenticated;

-- ※ 참고(코드/크론에서 별도 적용 완료):
--   verify_jwt=true 로 잠근 엣지함수: categorize-raw-news, collect-raw-news, generate-ai-news,
--     group-related-news, get-image-upload-url, get-video-upload-url,
--     fetch_article_thumbnail, fetch_missing_thumbnails
--   Authorization 헤더 주입한 크론: categorize_raw_news_job, fetch_article_thumbnail_job,
--     fetch_missing_thumbnails_job, group_related_news_job
