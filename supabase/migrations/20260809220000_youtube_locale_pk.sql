-- 🌍 같은 영상이 여러 나라에서 급상승할 수 있다 (2026-08-09)
--   PK가 (feed, video_id)라 미국 차트가 한국 행을 덮어쓰고 locale이 뒤집힌다.
--   ⚠️ 지금은 한국 데이터뿐이라 바꾸기 가장 싼 시점이다. 오픈 후엔 운영 중 마이그레이션이 된다.
alter table public.youtube_hot drop constraint if exists youtube_hot_pkey;
alter table public.youtube_hot add constraint youtube_hot_pkey primary key (locale, feed, video_id);
