-- ⚡ 부하 테스트에서 드러난 누락 인덱스 (2026-08-08)
--  ① galla_news: 인덱스는 published_at에만 있는데 앱은 **created_at desc**로 정렬 →
--     21,431행 Seq Scan + Sort = **1,939ms**. 뉴스 탭을 여는 모든 유저가 2초를 기다리는 중이었다.
--  ② related_groups: 573,766행에 PK뿐 → seq_scan 146만회(idx_scan 10회). 뉴스 파이프라인이 매번 풀스캔.
--  ③ notifications: user_id 조회인데 PK뿐 → seq 78%.
--  CONCURRENTLY는 트랜잭션 안에서 못 쓰므로 일반 CREATE INDEX(테이블이 작거나 쓰기 빈도 낮음).

-- ① 뉴스 목록(최신순) — 앱의 실제 정렬 키
create index if not exists galla_news_created_idx on public.galla_news (created_at desc);
-- 카테고리 탭 + 최신순
create index if not exists galla_news_cat_created_idx on public.galla_news (category, created_at desc);

-- ② 뉴스 그룹핑 — sid/fingerprint 조회 경로
create index if not exists related_groups_sid_idx on public.related_groups (sid);
create index if not exists related_groups_fp_idx on public.related_groups (fingerprint);
create index if not exists related_groups_sid_fp_idx on public.related_groups (sid, fingerprint);

-- ③ 알림함 — 내 알림 최신순
create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_from_idx on public.notifications (from_user);

-- ④ 광장 목록(최신순) — seq 25%
create index if not exists plaza_posts_created_idx on public.plaza_posts (created_at desc);

analyze public.galla_news;
analyze public.related_groups;
analyze public.notifications;
analyze public.plaza_posts;
