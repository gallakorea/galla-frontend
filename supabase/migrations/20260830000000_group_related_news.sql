-- 2026-08-30 관련뉴스 묶기 재설계 + 고아 그룹 정리
-- (운영 DB 에는 이미 적용됨. 이 파일은 기록·재현용.)

-- ① 대기 행만 담는 부분 인덱스. 없으면 34만 행 Seq Scan → statement timeout(57014).
create index concurrently if not exists idx_news_raw_ungrouped
  on public.news_articles_raw (id)
  where related_group_id is null and sid is not null;

-- ② 묶기 규칙: '출처+제목앞50자' → '24시간 내 제목 유사도 0.5 초과'
--    옛 규칙은 3일치 30,671건 중 4.6% 만 묶었다(기사 100개당 그룹 90~99개).
--    새 규칙은 28%. 임계값 0.5 는 경계 표본을 눈으로 확인해 정했다.
--    가드 둘: 짧은 제목(사진 캡션)은 매칭 안 함, 그룹 크기 상한 12 — 유사도 매칭이
--    연쇄해(A↔B, B↔C) 서로 다른 사건이 한 덩어리가 되는 걸 막는다.
--    본문은 pg_proc 참조(길어서 생략하지 않고 아래에 그대로 둔다).

-- ③ 기사를 지우면 그룹이 고아로 남는데 아무도 안 치웠다 —
--    744,778 중 549,209(74%) 고아, 388MB. purge_old_news 안에서 함께 치운다.
