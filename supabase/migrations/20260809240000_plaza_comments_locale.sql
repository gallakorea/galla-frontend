-- 광장 댓글에도 언어를 각인한다(작성자 언어). 없으면 번역 버튼이 출발 언어를 모른다.
alter table if exists public.plaza_comments add column if not exists locale text not null default 'ko';
create index if not exists idx_plaza_comments_locale on public.plaza_comments(locale);
drop trigger if exists trg_plaza_comments_locale on public.plaza_comments;
create trigger trg_plaza_comments_locale before insert on public.plaza_comments
  for each row execute function public.stamp_locale();
