-- 📈 핫튜브 '진짜 급상승' — 최근 증가분(델타) 기반 랭킹 (2026-08-08)
--  사장님 지적: "옛날 거라도 다시 급상승하는 거면 놔둬야 하지 않나?" — 맞다.
--  직전 수정(조회수 ÷ 평생 나이)은 **평생 평균 속도**라, 오래된 영상이 지금 다시 터져도
--  분모(나이)가 커서 영원히 상위로 못 온다. 재발견·밈화·관련 이슈로 되살아난 영상을 놓친다.
--  → 30분마다 수집하므로 **직전 조회수를 보존해 증가분(Δviews / Δ시간)** 으로 매긴다.
alter table public.youtube_hot
  add column if not exists prev_view_count bigint,
  add column if not exists prev_collected_at timestamptz,
  add column if not exists velocity double precision;   -- 시간당 조회수 증가(랭킹·디버깅용)

create index if not exists youtube_hot_velocity_idx on public.youtube_hot (feed, velocity desc);
