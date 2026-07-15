-- 다른 유명 페이지들의 실시간 검색어 랭킹 (구글 트렌드 · 네이트/줌 집계)
-- 엣지 함수(collect-external-trends)가 주기적으로 수집해 소스별 최신 스냅샷을 담는다.
-- 프론트는 anon SELECT 로 읽는다. 쓰기는 서비스롤(엣지 함수)만.

create table if not exists portal_search_trends (
  id         bigserial primary key,
  source     text        not null,          -- 'google' | 'signal'
  rank       int         not null,
  keyword    text        not null,
  traffic    text,                           -- 구글: '2만+' 등 대략치, 없으면 null
  fetched_at timestamptz not null default now()
);
create index if not exists idx_portal_trends_source_rank on portal_search_trends(source, rank);

alter table portal_search_trends enable row level security;

-- 공개 읽기 (검색어는 사실 정보, 출처 표기와 함께 노출)
drop policy if exists portal_trends_read on portal_search_trends;
create policy portal_trends_read on portal_search_trends for select using (true);
-- 쓰기 정책 없음 → 서비스롤만 기록 (RLS 우회)

-- 20분마다 수집 (anon 키를 Bearer 로 전달해 JWT 검증을 켠 채로도 호출 가능)
select cron.unschedule('collect_external_trends_job') where exists (
  select 1 from cron.job where jobname = 'collect_external_trends_job'
);
select cron.schedule(
  'collect_external_trends_job',
  '*/20 * * * *',
  $$select net.http_post(
      url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/collect-external-trends',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM'
      ),
      body := '{}'::jsonb
    );$$
);
