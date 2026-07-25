-- 갈라뉴스 중복 생성 차단 + 생성 주기 완화 + 조회수 지표
-- 실측(2026-07-25): 2일간 2,272건 생성 / topic_key 2,272개 = 중복 판정 0건.
-- 그런데 "이강인 아틀레티코 이적"은 4회, "멕시코 지자체장 피살"은 5회 중복 생성됐다.
-- 원인: topic_key가 AI가 매번 새로 지어내는 주제 문장에서 나와 표현이 조금만 달라도 안 겹침.
-- 대책: 생성 직전에 '원본 기사 URL이 최근 48시간 안에 이미 쓰였는지'를 본다(엣지 함수 쪽).

-- 그 조회를 위한 인덱스 (url in (...) 조회, 현재 3.5만 행 → 무인덱스면 매 주제마다 풀스캔)
create index if not exists idx_galla_news_sources_url on public.galla_news_sources (url);

-- 생성 주기 10분 → 30분, 한 회차 주제 12개 → 8개
-- 하루 144회×12 → 48회×8. 중복 차단과 합쳐 AI 호출이 1/4 이하로 내려간다.
do $$
declare v_cmd text;
begin
  select command into v_cmd from cron.job where jobname = 'generate_galla_news_job';
  if v_cmd is null then
    raise notice 'generate_galla_news_job 없음 — 스킵';
    return;
  end if;
  -- 기존 command의 max_topics를 8로 바꾼다(없으면 그대로 두고 스케줄만 조정)
  v_cmd := regexp_replace(v_cmd, '"max_topics"\s*:\s*\d+', '"max_topics":8');
  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'generate_galla_news_job'),
    schedule => '*/30 * * * *',
    command  => v_cmd
  );
end $$;

-- 조회수 지표 — galla_news.view_count를 올리는 코드가 어디에도 없어 전 건이 0이었다.
-- (= "안 읽힌다"가 아니라 "측정을 안 하고 있었다". 뭘 줄이고 뭘 늘릴지 판단할 근거가 없었음)
create or replace function bump_news_view(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.galla_news set view_count = coalesce(view_count, 0) + 1 where id = p_id;
$$;

grant execute on function bump_news_view(uuid) to anon, authenticated;
