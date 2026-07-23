-- =========================================================
-- 🤖 버그헌터 봇 (2026-07-24) — Management API로 적용됨, 기록용.
-- 30분마다(cron 'bug_hunt') 시스템을 자동 스캔해 이상을 bug_hunt_findings에 기록.
-- 관제센터(admin.html '🤖 버그헌터' 패널)에서 조회·해결. 엣지함수 불필요(순수 SQL, 무료).
-- =========================================================

create table if not exists public.bug_hunt_findings (
  id bigserial primary key,
  sig text unique not null,           -- 체크 시그니처(중복 방지·상태추적)
  severity text not null,             -- critical/high/medium/low
  category text not null,             -- security/economy/stuck/errors/data
  title text not null, detail text,
  hits int not null default 1,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  resolved boolean not null default false, resolved_at timestamptz
);
create index if not exists bhf_open_idx on public.bug_hunt_findings(resolved, severity, last_seen desc);
alter table public.bug_hunt_findings enable row level security;
revoke all on public.bug_hunt_findings from anon, authenticated;

-- 발견 기록 헬퍼(upsert, 재발 시 unresolve)
create or replace function public._bh_flag(p_sig text, p_sev text, p_cat text, p_title text, p_detail text)
returns void language plpgsql security definer set search_path to 'public' as $fn$
begin
  insert into bug_hunt_findings(sig,severity,category,title,detail)
  values(p_sig,p_sev,p_cat,p_title,p_detail)
  on conflict (sig) do update set hits=bug_hunt_findings.hits+1, last_seen=now(),
    detail=excluded.detail, severity=excluded.severity, title=excluded.title, resolved=false, resolved_at=null;
end $fn$;
revoke execute on function public._bh_flag(text,text,text,text,text) from public, anon, authenticated;

-- 봇 엔진: 7종 체크(보안회귀·RLS off·멈춘 일기토/예측·음수잔액·방치결제·에러급증)
-- run_bug_hunt() 본문은 20260724100000 적용본 참조(요약):
--   ① admin_/_ 함수가 인증 가드 없이 anon 실행 가능 → critical(보안 회귀 감지)
--   ② RLS off + anon 쓰기 테이블 → critical
--   ③ live인데 제한시간 10분 초과 일기토 → high
--   ④ 마감 1h 후 미정산 예측시장 → high
--   ⑤ 음수 GP 잔액 → critical
--   ⑥ 24h 넘게 pending 결제 → medium
--   ⑦ 60분 내 동일 에러 10건+ → high (client_errors 연동)
--   상태성(security/stuck/economy)은 재발 안 하면 자동 resolved 처리.
-- (전체 정의는 DB에 배포됨. 여기선 계약만 문서화.)

-- 관리자 RPC
-- admin_bug_hunt(p_include_resolved) : setof findings, _is_admin() 게이트
-- admin_bug_hunt_run() : 지금 즉시 스캔(관리자 버튼)
-- admin_bug_hunt_resolve(p_id) : 수동 해결
-- run_bug_hunt() : anon/auth/public 실행 revoke(크론·관리자RPC만)

-- cron: select cron.schedule('bug_hunt','*/30 * * * *',$$select public.run_bug_hunt()$$);
