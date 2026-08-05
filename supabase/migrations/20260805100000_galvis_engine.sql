-- 갈비스 대화 엔진 고도화 (Management API로 적용됨, 기록용)
alter table public.friend_relationship add column if not exists emotion jsonb;       -- 감정선(valence/energy/feeling/intensity/cause/at)
alter table public.friend_relationship add column if not exists recent_shown text[] default '{}';  -- 보여준 콘텐츠 id('딴거'=새것)
