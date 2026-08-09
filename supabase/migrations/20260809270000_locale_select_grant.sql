-- 🚨 긴급 수정: locale 컬럼에 SELECT 권한이 없어 댓글이 통째로 안 보였다 (2026-08-09)
--
--  사고 경위: 댓글 테이블 4종은 user_id 같은 PII를 가리려고 **컬럼 단위**로 SELECT를 준다
--  (테이블 레벨 grant select가 없다). 이런 테이블에 `alter table ... add column`으로
--  locale을 추가하면 새 컬럼에는 grant가 하나도 없다 → 프론트가 select에 locale을 넣는 순간
--  PostgREST가 42501 permission denied를 뱉고 **댓글 목록 전체가 빈 화면**이 된다.
--
--  ⚠️ 컬럼 잠금 테이블에 컬럼을 추가할 땐 grant select (새컬럼)을 같이 줘라.
--     "테이블에 이미 권한이 있으니 되겠지"가 통하지 않는 유일한 케이스다.
--
--  users.locale은 여기 없다 — 그건 의도적으로 비공개다(다른 사람 언어를 알 이유가 없다).
--  본인 값은 get_my_account()로 읽는다.

grant select (locale) on public.comments            to anon, authenticated;
grant select (locale) on public.plaza_comments      to anon, authenticated;
grant select (locale) on public.galla_news_comments to anon, authenticated;
grant select (locale) on public.market_comments     to anon, authenticated;
