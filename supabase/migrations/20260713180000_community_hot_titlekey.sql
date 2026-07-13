-- 커뮤니티 인기글 중복제거용 정규화 제목키
alter table public.community_hot add column if not exists title_key text;
create index if not exists idx_comhot_titlekey on public.community_hot(title_key);
