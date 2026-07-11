-- 갈라 대표 썸네일 (3:4, 마이페이지 카드용). 없으면 사진/영상으로 대체
alter table public.issues       add column if not exists card_thumb_url text;
alter table public.issues_draft add column if not exists card_thumb_url text;
