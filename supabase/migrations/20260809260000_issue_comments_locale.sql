-- 🌐 이슈 댓글에도 작성 언어 각인 (2026-08-09) — 번역 버튼이 출발 언어를 알아야 한다
alter table if exists public.comments add column if not exists locale text not null default 'ko';
create index if not exists idx_comments_locale2 on public.comments(locale);
