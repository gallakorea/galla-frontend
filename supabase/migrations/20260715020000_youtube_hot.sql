-- ============================================================
-- 핫 영상 (유튜브 인기 급상승) — 검색 탭 신설
--
-- YouTube Data API v3 의 chart=mostPopular 를 30분마다 수집한다.
-- 쿼터: videos.list = 1 unit / 호출. 하루 48회 = 48 units (무료 한도 10,000).
-- 영상은 우리가 호스팅하지 않고 공식 iframe 으로만 재생한다(ToS 준수).
-- ============================================================

create table if not exists public.youtube_hot (
  video_id      text primary key,
  title         text not null,
  channel_title text,
  channel_id    text,
  thumbnail     text,
  description   text,
  published_at  timestamptz,
  view_count    bigint default 0,
  like_count    bigint default 0,
  comment_count bigint default 0,
  duration      text,              -- ISO8601 (PT3M21S)
  category_id   text,
  rank          int,               -- 인기 급상승 순위 (1 = 1위)
  collected_at  timestamptz default now()
);

create index if not exists idx_yt_hot_rank on public.youtube_hot (rank);
create index if not exists idx_yt_hot_collected on public.youtube_hot (collected_at desc);

-- 읽기는 공개(비로그인도 탐색 가능), 쓰기는 수집 함수(service_role)만
alter table public.youtube_hot enable row level security;

drop policy if exists yt_hot_read on public.youtube_hot;
create policy yt_hot_read on public.youtube_hot
  for select to anon, authenticated using (true);

-- service_role 은 RLS를 우회하므로 별도 정책 불필요 (insert/update/delete 정책 없음 = 일반 유저 차단)


-- 30분마다 수집
select cron.unschedule('collect_youtube_hot_job') where exists (
  select 1 from cron.job where jobname = 'collect_youtube_hot_job'
);
select cron.schedule(
  'collect_youtube_hot_job',
  '*/30 * * * *',
  $$select net.http_post(
      url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-youtube-hot',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{}'::jsonb
    );$$
);
