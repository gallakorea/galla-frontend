-- =========================================================
-- 이슈 '관련 보도'가 앱에서만 안 붙던 문제 — 쿼리 타임아웃(57014)
--
-- 증상: 이슈 페이지에 "아직 언론에서 다뤄지지 않은 논점입니다" 만 떴다.
--       그런데 관리자 콘솔에서 같은 RPC 를 부르면 6건이 멀쩡히 나왔다.
--
-- 원인: 역할별 statement_timeout 차이 때문에 콘솔에서만 멀쩡해 보였다.
--         anon 3s · authenticated 8s · (관리 API 는 제한 없음)
--       news_articles_raw 는 35만행·635MB 인데 WHERE 가
--         (title ILIKE '%kw%' OR description ILIKE '%kw%')  × 최대 12개
--       였다. description 에는 트라이그램 인덱스가 없어 전수 스캔이 됐고,
--       거기에 스코어용 ILIKE 20여 개가 더 붙어 3초를 넘겼다.
--
-- ── 조치 ────────────────────────────────────────────────
--   ① WHERE 는 title 만 본다(idx_news_raw_title_trgm 사용).
--      description 은 스코어에는 그대로 쓰므로 매칭 품질은 유지된다.
--   ② WHERE 키워드는 3글자 이상만, 최대 6개.
--      ⚠️ pg_trgm 은 패턴이 3글자 미만이면 인덱스를 못 탄다 — 2글자 태그가
--         하나만 섞여도 그 OR 가지가 전수 스캔이 되어 통째로 타임아웃난다.
--   ③ 시간창 45일 → 14일, 후보 상한 800 → 300.
--
-- 실측(anon 키, 최근 이슈 12건): 전부 6건 반환, 0.20~2.66초, 타임아웃 0건.
--   (이전: 12건 중 대부분 57014 타임아웃)
--
-- ⚠️ 이 파일은 기록용이다. 운영에는 pg_get_functiondef 로 뽑은 원본에
--    위 세 지점만 치환해 적용했다(본문이 길어 전문 재작성 시 표류 위험).
-- =========================================================

do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'issue_related_news'
       and p.prosrc like '%3글자 미만이면 인덱스를 못 탄다%'
  ) then
    raise exception 'issue_related_news 최적화가 적용되지 않았다 — 관련 보도가 다시 타임아웃난다';
  end if;
end $$;
