-- 갈라뉴스: 여러 언론사 보도를 AI로 종합·재작성한 원본 기사 + 출처(관련기사) 링크.
-- 저작권: 사실 기반 재작성 + 다중 소스 종합 + 출처 아웃링크(퍼플렉시티/구글 AI 오버뷰 모델).
-- 관리 API로 이미 적용. 기록용.

create table if not exists public.galla_news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text not null,
  category text,
  hero_image text,           -- 소스 대표 이미지(출처 명시)
  topic_key text unique,     -- 중복 생성 방지
  source_count int default 0,
  status text default 'published',
  created_at timestamptz default now(),
  published_at timestamptz default now()
);

create table if not exists public.galla_news_sources (
  id bigserial primary key,
  news_id uuid references public.galla_news(id) on delete cascade,
  url text,
  press_name text,
  title text,
  thumbnail_url text,
  published_at timestamptz
);

create index if not exists idx_galla_news_pub on public.galla_news (published_at desc);
create index if not exists idx_galla_news_sources_nid on public.galla_news_sources (news_id);

alter table public.galla_news enable row level security;
alter table public.galla_news_sources enable row level security;
create policy galla_news_read on public.galla_news for select using (true);
create policy galla_news_sources_read on public.galla_news_sources for select using (true);

-- 생성: generate-galla-news 엣지 함수(gpt-4o-mini)를 15분마다 호출(신선도).
-- 다중소스 종합 + 중요 단독기사도 AI 요약·재구성. 병렬 처리 + topic_key 중복방지(대부분 스킵돼 비용 낮음).
-- 뉴스탭이 galla_news를 보여주므로 생성 주기가 곧 "최신" 신선도가 됨.
-- select cron.schedule('generate_galla_news_job','*/15 * * * *',
--   $$ select net.http_post(url:='.../functions/v1/generate-galla-news',
--        headers:=jsonb_build_object('Content-Type','application/json'),
--        body:='{"max_topics":15,"hours":6}'::jsonb); $$);
