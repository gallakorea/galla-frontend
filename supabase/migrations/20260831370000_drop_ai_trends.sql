/* ai_trends 는 2026-01-05 프로토타입이다 — "AI 가 뽑은 급상승 이슈"(제목·분류·찬반비율·
   고른 이유·점수). 마이그레이션 없이 SQL 에디터에서 만들어졌고 코드·함수·뷰·크론
   어디서도 참조하지 않았다. 남아 있던 3행은 전부 데모 시드였고 가리키던 이슈 1·2·3 은
   이미 사라져 전부 고아였다.

   이 아이디어는 compute_hot_scores(이슈 hot_score — 투표 5 · 댓글 4 · 좋아요 3 ·
   조회 log 2 + 접전 보너스)와 hot_search_trends · hot_trend_today 로 제대로 구현됐다.
   대체된 프로토타입이라 지운다. */
drop table if exists public.ai_trends;
