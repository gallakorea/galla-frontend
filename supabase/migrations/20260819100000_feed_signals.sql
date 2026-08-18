-- 📊 공통 신호 층 — 추천 알고리즘의 '연료'. 표면(숏판·롱판·광장·이슈·예측)이 달라도 스키마는 하나다.
--    지금은 "본 것"만 남고(content_daily_views) **보여줬는데 안 본 것·얼마나 봤는지**가 없어서
--    어떤 랭킹을 얹어도 눈감고 튜닝하는 상태였다. 그 구멍을 메운다.
--
--    설계 원칙
--    ① 원본 이벤트는 **30일만** 보관(튜닝용). 랭킹은 집계 테이블만 읽는다 → 테이블 비대·비용 방지.
--    ② 클라는 **배치 1회 호출**(log_signals). 카드 하나 볼 때마다 쏘면 요금과 배터리가 죽는다.
--    ③ 남의 신호는 아무도 못 읽는다(프라이버시). 집계만 공개.

create table if not exists public.feed_signals (
  id          bigserial primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  kind        text not null,                    -- vertical|horizontal|plaza|issue|predict|news|hottube
  content_id  text not null,
  surface     text,                             -- home|reels|plaza|issue|search … (어디서 봤나)
  imp         smallint not null default 0,      -- 노출(1초 이상 화면에 보임)
  dwell_ms    integer  not null default 0,      -- 머문 시간
  watch_pct   smallint not null default 0,      -- 영상 완주율 0~100
  act         text,                             -- open|like|comment|share|bookmark|skip|follow
  created_at  timestamptz not null default now()
);
create index if not exists feed_signals_rollup_idx on public.feed_signals (created_at, kind, content_id);
create index if not exists feed_signals_user_idx   on public.feed_signals (user_id, created_at desc);

alter table public.feed_signals enable row level security;
-- 🔒 본인 기록만 남길 수 있고, **아무도 읽을 수 없다**(집계는 서비스 롤이 한다).
drop policy if exists feed_signals_insert_self on public.feed_signals;
create policy feed_signals_insert_self on public.feed_signals
  for insert to authenticated with check (user_id = (select auth.uid()));
grant insert on public.feed_signals to authenticated;
grant usage, select on sequence public.feed_signals_id_seq to authenticated;

-- ── 배치 기록 ────────────────────────────────────────────────
--    한 번의 호출로 최대 200건. 값은 서버에서 정규화한다(클라 숫자를 믿지 않는다).
create or replace function public.log_signals(p_rows jsonb)
returns integer
language plpgsql
security invoker            -- ⚠️ definer로 만들면 남의 user_id를 밀어넣을 수 있다(권한 가드 함정)
set search_path = public
as $$
declare v_uid uuid := (select auth.uid()); v_n integer;
begin
  if v_uid is null then return 0; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then return 0; end if;

  insert into public.feed_signals (user_id, kind, content_id, surface, imp, dwell_ms, watch_pct, act)
  select v_uid,
         left(coalesce(r->>'kind', ''), 24),
         left(coalesce(r->>'id', ''), 64),
         left(nullif(r->>'surface', ''), 24),
         least(greatest(coalesce((r->>'imp')::int, 0), 0), 1),
         least(greatest(coalesce((r->>'ms')::int, 0), 0), 600000),      -- 10분 상한(탭 방치 방어)
         least(greatest(coalesce((r->>'pct')::int, 0), 0), 100),
         left(nullif(r->>'act', ''), 16)
    from jsonb_array_elements(p_rows) r
   where coalesce(r->>'id', '') <> '' and coalesce(r->>'kind', '') <> ''
   limit 200;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.log_signals(jsonb) from public;
grant execute on function public.log_signals(jsonb) to authenticated;

-- ── 콘텐츠별 일 집계 — 랭킹이 읽는 유일한 테이블 ─────────────
create table if not exists public.content_signal_daily (
  day         date not null,
  kind        text not null,
  content_id  text not null,
  imps        integer not null default 0,       -- 노출 수(분모!)
  opens       integer not null default 0,       -- 클릭·진입
  dwell_ms    bigint  not null default 0,
  watch_sum   integer not null default 0,       -- 완주율 합(평균 계산용)
  watch_cnt   integer not null default 0,
  completes   integer not null default 0,       -- 90% 이상 시청
  engages     integer not null default 0,       -- 좋아요·댓글·공유·북마크
  uniques     integer not null default 0,
  primary key (day, kind, content_id)
);
alter table public.content_signal_daily enable row level security;
drop policy if exists content_signal_daily_read on public.content_signal_daily;
create policy content_signal_daily_read on public.content_signal_daily for select to anon, authenticated using (true);
grant select on public.content_signal_daily to anon, authenticated;

create or replace function public.rollup_feed_signals()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.content_signal_daily as d
        (day, kind, content_id, imps, opens, dwell_ms, watch_sum, watch_cnt, completes, engages, uniques)
  select (created_at at time zone 'Asia/Seoul')::date, kind, content_id,
         sum(imp),
         count(*) filter (where act = 'open'),
         sum(dwell_ms),
         sum(watch_pct) filter (where watch_pct > 0),
         count(*)       filter (where watch_pct > 0),
         count(*)       filter (where watch_pct >= 90),
         count(*)       filter (where act in ('like','comment','share','bookmark')),
         count(distinct user_id)
    from public.feed_signals
   where created_at >= now() - interval '2 days'
   group by 1, 2, 3
  on conflict (day, kind, content_id) do update
     set imps = excluded.imps, opens = excluded.opens, dwell_ms = excluded.dwell_ms,
         watch_sum = excluded.watch_sum, watch_cnt = excluded.watch_cnt,
         completes = excluded.completes, engages = excluded.engages, uniques = excluded.uniques;

  delete from public.feed_signals where created_at < now() - interval '30 days';
end $$;
revoke all on function public.rollup_feed_signals() from public;

-- pg_cron은 래퍼로 부른다(SECURITY DEFINER 함정: current_user가 소유자로 평가됨)
select cron.unschedule('feed_signals_rollup') where exists (select 1 from cron.job where jobname = 'feed_signals_rollup');
select cron.schedule('feed_signals_rollup', '*/15 * * * *', $$select public.rollup_feed_signals()$$);
