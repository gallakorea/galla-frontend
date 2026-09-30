-- 광장 채널화(B안, 2026-09-30): 잡다 분류를 '자유·수다' 채널로 이관, 분류 있는 건 채널로 유지.
-- 백업: plaza_posts_catbak_20260930 (id, category). 원복은 백업 조인으로.
--   update plaza_posts p set category=b.category from plaza_posts_catbak_20260930 b where p.id=b.id;
-- Management API로 직접 적용됨(아래는 기록용).
update plaza_posts set category = '자유·수다' where category in ('생활·일상', '기타', '일상');
update plaza_posts set category = '정치·사회' where category = '정치';
