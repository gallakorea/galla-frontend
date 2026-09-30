-- 광장 채널 백엔드(A안) 2단계: plaza_posts.channel_id 백필.
-- 기존 글의 category(=채널명, canonical 통일됨) → channels.id 연결. 멱등.
alter table plaza_posts add column if not exists channel_id uuid references channels(id) on delete set null;
create index if not exists idx_plaza_posts_channel on plaza_posts(channel_id);
update plaza_posts p set channel_id = c.id
  from channels c where c.name = p.category and p.channel_id is null;
-- 채널별 글 수 캐시
update channels ch set post_count = (select count(*) from plaza_posts p where p.channel_id = ch.id);
