-- 🎬 릴스 실행 에이전트 — 잡 상태머신 (2026-08-14, 사장님 확정 구조)
-- 갈비스가 접수하면 잡이 생기고, reel-agent 엣지(단계 실행)와 로컬/컨테이너 렌더 워커(ffmpeg)가
-- 상태를 진행시킨다. 유저가 앱을 나가도 잡은 살아있다.
-- states: created → aligning(정렬·분석·매칭) → render_queued → rendering → done | failed
--         (voice_wait/preview_wait 게이트는 확장 지점)

create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  kind text not null default 'reel',
  state text not null default 'created',
  inputs jsonb not null default '{}'::jsonb,     -- {script, clips:[{url,kind,thumb,dur}], voice_url|voice_mode}
  artifacts jsonb not null default '{}'::jsonb,  -- {words, subtitles, clip_captions, timeline, video_url}
  progress jsonb not null default '[]'::jsonb,   -- [{at, msg}]
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_jobs_user_idx on public.agent_jobs (user_id, created_at desc);
create index if not exists agent_jobs_queue_idx on public.agent_jobs (state, created_at)
  where state in ('render_queued','rendering');

alter table public.agent_jobs enable row level security;
drop policy if exists agent_jobs_read_own on public.agent_jobs;
create policy agent_jobs_read_own on public.agent_jobs for select using (auth.uid() = user_id);
-- 쓰기는 전부 service role(엣지·워커 경유)만 — authenticated에 insert/update 권한 주지 않는다.
grant select on public.agent_jobs to authenticated;
