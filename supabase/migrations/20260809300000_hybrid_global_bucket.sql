-- 🌍 하이브리드 운영 모델 — 'global' 버킷 (2026-08-09)
--
--  결정: 나라별로 통째로 쪼개지 않는다. 쪼개면 새로 여는 나라가 유령 도시가 된다
--  (배틀은 양 진영에 사람이, 예측은 참여자가 있어야 성립한다).
--  대신 **나라가 아니라 콘텐츠 종류로** 나눈다.
--
--   · 이슈·광장·뉴스·핫튜브 → 언어별 격리. 로컬 이슈가 여론 플랫폼의 본질이고,
--                              인기 영상은 애초에 지역별이다.
--   · 예측·갈라리          → locale='global'이면 모두에게 보인다. 참여자 수가 생명이고
--                              사진·영상은 언어 의존도가 낮다.
--
--  ⚠️ 격리 대상 테이블(issues/plaza_posts/galla_news/news_articles/youtube_hot)에는
--     'global'을 찍지 마라. 찍는 순간 격리가 뚫려서 미국 유저 홈에 한국 정치가 뜬다.

alter table public.markets add column if not exists locale text not null default 'global';
create index if not exists idx_markets_locale on public.markets(locale, created_at desc);

-- 기존 마켓은 전부 한국어 질문이라 'ko'로 둔다. 영어권을 열었을 때 한국어 질문이
-- 그대로 뜨는 것보다는 안 뜨는 게 낫다. 앞으로 만드는 것부터 global/ko를 구분해 찍는다.
update public.markets set locale = 'ko' where locale = 'global';

-- 갈라리(일반 콘텐츠)는 언어 의존도가 낮아 기본을 global로 바꾼다.
-- ⚠️ 기존 행은 건드리지 않는다 — 한국어 캡션이 달린 글이라 ko로 남는 게 맞다.
alter table public.posts alter column locale set default 'global';

comment on column public.markets.locale is
  '''global''=만국 공통(모두에게 보임) / ''ko''·''en'' 등=그 언어에만. 읽기 필터는 (내 언어 OR global)';
comment on column public.posts.locale is
  '''global''=만국 공통 / 언어코드=그 언어에만. 갈라리는 기본 global(사진·영상 위주)';
