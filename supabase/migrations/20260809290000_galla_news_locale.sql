-- 🌍 갈라뉴스에 locale (2026-08-09)
--
--  갈라뉴스(AI 종합)만 locale이 없었다. 읽기 필터를 홈 피드에 붙이는 순간
--  이 테이블만 필터를 못 걸어서, 두 번째 언어를 열면 영어권 유저 홈에 한국어 종합뉴스가 섞인다.
--
--  ⚠️ 컬럼 잠금 테이블이 아니라 테이블 레벨 SELECT가 있으므로 grant는 따로 필요 없다.
--     (comments 계열은 컬럼 단위라 grant select (locale)이 필요했다 — 다른 종류의 테이블이다)

alter table public.galla_news add column if not exists locale text not null default 'ko';
create index if not exists idx_galla_news_locale on public.galla_news(locale, published_at desc);
