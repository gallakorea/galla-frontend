-- 🔒 출시 전 모의침투 보완(26.9.22) — 심각(High) 없음, 방어심화·불필요표면 회수
-- 원칙: authenticated·service_role 경로는 유지, anon/public 만 걷어 화면 백지화 방지

-- ── 3) search_logs: 익명 쓰기 잠금(트렌드 조작 방지, PII 없음·프론트 미사용) ──
drop policy if exists "allow insert search logs" on public.search_logs;
revoke insert on public.search_logs from anon, authenticated;
-- 읽기(트렌드 표시)는 유지

-- ── 5) redteam_pool: QA 계정 평문 크레덴셜 — service_role(레드팀 함수)만 접근 ──
revoke all on public.redteam_pool from anon, authenticated;   -- RLS로 이미 차단이나 이중방어

-- ── 4) admin_* 62개 + gc_clawback: 익명/public EXECUTE 회수(본문가드 위 이중방어) ──
--    관리자는 authenticated 라 명시 grant 후 anon/public 회수(→ 익명은 권한계층에서 차단)
do $$
declare r record;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and (p.proname like 'admin\_%' or p.proname='gc_clawback')
  loop
    execute format('grant execute on function public.%I(%s) to authenticated', r.proname, r.args);
    execute format('revoke execute on function public.%I(%s) from anon, public', r.proname, r.args);
  end loop;
end $$;
