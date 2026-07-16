-- =========================================================
-- GA4 연동 파이프라인 (2026-07-16) — 안전 아키텍처
-- 크론 엣지(ga-sync, service_role)가 GA4 Data API에서 지표를 당겨 ga_metrics에 캐시,
-- 관리자 대시보드는 게이트 RPC admin_ga()로만 읽는다(유저 JWT→엣지 문제 회피,
-- 자격증명은 엣지 env에만, 관리자 표면은 기존 _is_admin() 게이트 재사용).
-- =========================================================

create table if not exists public.ga_metrics (
  kind        text primary key,           -- 'realtime' | 'report28d'
  payload     jsonb not null,
  captured_at timestamptz not null default now()
);
alter table public.ga_metrics enable row level security;
-- 정책 없음 → anon/authenticated 직접 접근 불가. service_role(엣지)만 write,
-- 관리자는 아래 SECURITY DEFINER RPC로만 read.
revoke all on table public.ga_metrics from anon, authenticated;

-- 관리자 전용 조회 — 최신 스냅샷 반환(+ 연동 여부 플래그)
create or replace function public.admin_ga()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_rt jsonb; v_rep jsonb; v_rt_at timestamptz; v_rep_at timestamptz;
begin
  if not coalesce(_is_admin(), false) then
    return jsonb_build_object('ok', false, 'reason', 'admin_only');
  end if;
  select payload, captured_at into v_rt,  v_rt_at  from ga_metrics where kind = 'realtime';
  select payload, captured_at into v_rep, v_rep_at from ga_metrics where kind = 'report28d';
  return jsonb_build_object(
    'ok', true,
    'configured', (v_rt is not null or v_rep is not null),
    'realtime', v_rt, 'realtime_at', v_rt_at,
    'report', v_rep, 'report_at', v_rep_at
  );
end $$;
revoke all on function public.admin_ga() from public, anon;
grant execute on function public.admin_ga() to authenticated;
