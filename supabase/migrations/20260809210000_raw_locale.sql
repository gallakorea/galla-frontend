-- 수집 원본 테이블에도 소스 언어를 남긴다 — 여기서 빠지면 파이프라인 뒤쪽에서 언어를 알 수 없다
alter table if exists public.news_articles_raw add column if not exists locale text not null default 'ko';
create index if not exists idx_news_articles_raw_locale on public.news_articles_raw(locale);
comment on column public.news_articles_raw.locale is '소스 언어. 수집기가 직접 넣는다.';
