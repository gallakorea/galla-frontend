-- 🔕 버그 신고·버그헌터 관리자 알림 끄기 + 보안 발견 처리(26.9.19)
create or replace function public._trg_bug_notify_admin() returns trigger language plpgsql security definer set search_path to 'public' as $f$
begin
  -- 🔕 관리자 알림 끔(26.9.19 사장님: 「어드민 페이지에서만 확인」) — 트리거는 남겨 두고 아무것도 안 한다
  return new;
end $f$;
CREATE OR REPLACE FUNCTION public.run_bug_hunt()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; c int; v_state_sigs text[] := '{}'; v_new int := 0; v_titles text := ''; v_healed int := 0; v_open int;
  procedure_note text;
  function_new boolean;
begin
  -- ═══ 자동 치유: 멈춘 일기토(live/voting 제한시간 초과)를 duel_resolve로 진행 ═══
  for r in select id from duels where status='live' and live_ends_at < now()-interval '10 min' loop
    begin
      perform duel_resolve(r.id);                                   -- live → voting
      update duels set voting_ends_at = now()-interval '1 s' where id=r.id and status='voting';
      perform duel_resolve(r.id);                                   -- voting → finished
      v_healed := v_healed + 1;
    exception when others then null; end;
  end loop;

  -- ① 보안 회귀
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')
      and (p.proname like 'admin\_%' or p.proname like '\_%')
      and not (pg_get_functiondef(p.oid) ~* '(_is_admin|auth\.uid|service_role|unauthorized)') loop
    function_new := _bh_flag('sec_anon_fn:'||r.proname,'critical','security','민감 함수가 인증 없이 anon 실행 가능','함수 '||r.proname||' 가드 없이 anon 노출 — 즉시 revoke/가드');
    if function_new then v_new:=v_new+1; v_titles:=v_titles||'· '||r.proname||' 노출\n'; end if;
    v_state_sigs := array_append(v_state_sigs,'sec_anon_fn:'||r.proname);
  end loop;
  -- ② RLS off
  for r in select t.tablename from pg_tables t where t.schemaname='public' and t.rowsecurity=false
    and exists(select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=t.tablename
      and g.grantee in ('anon','authenticated') and g.privilege_type in ('INSERT','UPDATE','DELETE')) loop
    if _bh_flag('sec_rls_off:'||r.tablename,'critical','security','RLS 꺼진 테이블 익명 쓰기','테이블 '||r.tablename||' RLS off + 쓰기권한')
      then v_new:=v_new+1; v_titles:=v_titles||'· '||r.tablename||' RLS off\n'; end if;
    v_state_sigs := array_append(v_state_sigs,'sec_rls_off:'||r.tablename);
  end loop;
  -- ③ 치유 후에도 남은 멈춘 일기토
  select count(*) into c from duels where status in ('live','voting') and coalesce(voting_ends_at,live_ends_at) < now()-interval '20 min';
  if c>0 then if _bh_flag('stuck_duel','high','stuck','자동종료 실패한 일기토', c||'건이 치유 시도 후에도 멈춤 — duel_resolve 로직 점검') then v_new:=v_new+1; v_titles:=v_titles||'· 멈춘 일기토 '||c||'건\n'; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_duel'); end if;
  -- ④ 마감 후 미정산 예측시장
  select count(*) into c from markets where coalesce(resolved,false)=false and coalesce(status,'')<>'resolved' and close_at < now()-interval '50 hours';
  if c>0 then if _bh_flag('stuck_market','high','stuck','마감 후 미정산 예측시장', c||'건 마감 50h 후 미정산 — predict-auto-resolve 는 AI 판정 불가 시 48h 유예 후 환불한다. 그보다 오래 남았으면 진짜 멈춘 것') then v_new:=v_new+1; v_titles:=v_titles||'· 미정산 예측 '||c||'건\n'; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_market'); end if;
  -- ⑤ 음수 잔액
  select count(*) into c from point_balances where balance<0 or coalesce(paid_balance,0)<0;
  if c>0 then if _bh_flag('neg_balance','critical','economy','음수 GP 잔액', c||'개 계정 잔액 음수 — 차감 로직 결함') then v_new:=v_new+1; v_titles:=v_titles||'· 음수잔액 '||c||'개\n'; end if; v_state_sigs:=array_append(v_state_sigs,'neg_balance'); end if;
  -- ⑥ 방치 결제
  select count(*) into c from gp_charges where status='pending' and created_at < now()-interval '24 hours';
  if c>0 then if _bh_flag('stuck_charge','medium','economy','24h+ 미완료 결제', c||'건 pending 방치 — PG 웹훅 점검') then v_new:=v_new+1; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_charge'); end if;
  -- ⑦ 크론 자기감시(최근 40분 3회+ 실패)
  for r in select j.jobname, count(*) f, left(max(d.return_message),140) m from cron.job_run_details d join cron.job j on j.jobid=d.jobid
    where d.status='failed' and d.start_time > now()-interval '40 min' group by j.jobname having count(*)>=3 loop
    if _bh_flag('cron_fail:'||r.jobname,'high','stuck','크론 반복 실패: '||r.jobname, '최근 40분 '||r.f||'회 실패. '||coalesce(r.m,'')) then v_new:=v_new+1; v_titles:=v_titles||'· 크론실패 '||r.jobname||'\n'; end if;
    v_state_sigs:=array_append(v_state_sigs,'cron_fail:'||r.jobname);
  end loop;
  /* ⑨ GP 원장 드리프트 — 잔액이 원장 합계와 어긋나면 어딘가 원장을 안 남기고 잔액만 건드린 것이다.
     실측(2026-08-31): 14명 중 1명 100 GP 어긋남. point_ledger.delta·point_balances.balance 가
     double precision 이라 미세 오차도 쌓일 수 있어 0.5 를 문턱으로 둔다(그보다 크면 누락이다).
     GP 는 랭킹·예측 정산의 근거라 어긋나면 공정성이 깨진다. */
  select count(*) into c
    from point_balances b
    left join (select user_id, sum(delta) s from point_ledger group by 1) l on l.user_id = b.user_id
   where abs(coalesce(b.balance,0) - coalesce(l.s,0)) > 0.5;
  if c>0 then if _bh_flag('gp_drift','high','economy','GP 잔액이 원장과 안 맞음', c||'개 계정에서 잔액≠원장합. 원장 없이 잔액만 바꾼 경로가 있다 — 지급·차감 코드 점검') then v_new:=v_new+1; v_titles:=v_titles||'· GP드리프트 '||c||'개\n'; end if; v_state_sigs:=array_append(v_state_sigs,'gp_drift'); end if;

  -- ⑧ 신고 적체(48h+ 미처리)
  select count(*) into c from reports where coalesce(status,'pending') in ('pending','new','open') and created_at < now()-interval '48 hours';
  if c>0 then if _bh_flag('report_backlog','medium','data','미처리 신고 적체', c||'건이 48h+ 미처리 — 모더레이션 필요') then v_new:=v_new+1; end if; v_state_sigs:=array_append(v_state_sigs,'report_backlog'); end if;

  -- 상태성 발견 자동 해제
  update bug_hunt_findings set resolved=true, resolved_at=now()
    where resolved=false and category in ('security','stuck','economy','data') and not (sig = any(v_state_sigs));

  -- ⑨ 에러 급증(이력성, 자동해제 제외)
  for r in select message, count(*) cc from client_errors where created_at>now()-interval '60 min' group by message having count(*)>=10 loop
    if _bh_flag('err_spike:'||left(md5(r.message),12),'high','errors','클라이언트 에러 급증','최근 60분 '||r.cc||'회: '||left(r.message,200)) then v_new:=v_new+1; end if;
  end loop;

  -- 🔕 관리자 알림(알림함·웹푸시·메일) 끔 — 발견은 관리자 페이지(🤖 버그헌터)에서만 본다(26.9.19 사장님)

  select count(*) into v_open from bug_hunt_findings where resolved=false;
  return jsonb_build_object('ok',true,'open',v_open,'new',v_new,'healed',v_healed,'ran_at',now());
end $function$;

-- 🔒 버그헌터 보안 발견 처리 — 익명 쓰기 가능했던 테이블 4개: 읽기는 두고 쓰기만 막는다(서버 함수는 definer 라 그대로 동작)
do $$ declare t text; begin
  foreach t in array array['travel_region_alias','travel_geocache','kr_region_names','food_cheap'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_read', t);
    execute format('create policy %I on public.%I for select using (true)', t||'_read', t);
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
  end loop;
end $$;
revoke execute on function public._trg_crisis_notify_admin() from public, anon, authenticated;

-- 🧹 에러 급증 자동 닫기(3일 재발 없음)
CREATE OR REPLACE FUNCTION public.run_bug_hunt()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; c int; v_state_sigs text[] := '{}'; v_new int := 0; v_titles text := ''; v_healed int := 0; v_open int;
  procedure_note text;
  function_new boolean;
begin
  -- ═══ 자동 치유: 멈춘 일기토(live/voting 제한시간 초과)를 duel_resolve로 진행 ═══
  for r in select id from duels where status='live' and live_ends_at < now()-interval '10 min' loop
    begin
      perform duel_resolve(r.id);                                   -- live → voting
      update duels set voting_ends_at = now()-interval '1 s' where id=r.id and status='voting';
      perform duel_resolve(r.id);                                   -- voting → finished
      v_healed := v_healed + 1;
    exception when others then null; end;
  end loop;

  -- ① 보안 회귀
  for r in select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and has_function_privilege('anon',p.oid,'EXECUTE')
      and (p.proname like 'admin\_%' or p.proname like '\_%')
      and not (pg_get_functiondef(p.oid) ~* '(_is_admin|auth\.uid|service_role|unauthorized)') loop
    function_new := _bh_flag('sec_anon_fn:'||r.proname,'critical','security','민감 함수가 인증 없이 anon 실행 가능','함수 '||r.proname||' 가드 없이 anon 노출 — 즉시 revoke/가드');
    if function_new then v_new:=v_new+1; v_titles:=v_titles||'· '||r.proname||' 노출\n'; end if;
    v_state_sigs := array_append(v_state_sigs,'sec_anon_fn:'||r.proname);
  end loop;
  -- ② RLS off
  for r in select t.tablename from pg_tables t where t.schemaname='public' and t.rowsecurity=false
    and exists(select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=t.tablename
      and g.grantee in ('anon','authenticated') and g.privilege_type in ('INSERT','UPDATE','DELETE')) loop
    if _bh_flag('sec_rls_off:'||r.tablename,'critical','security','RLS 꺼진 테이블 익명 쓰기','테이블 '||r.tablename||' RLS off + 쓰기권한')
      then v_new:=v_new+1; v_titles:=v_titles||'· '||r.tablename||' RLS off\n'; end if;
    v_state_sigs := array_append(v_state_sigs,'sec_rls_off:'||r.tablename);
  end loop;
  -- ③ 치유 후에도 남은 멈춘 일기토
  select count(*) into c from duels where status in ('live','voting') and coalesce(voting_ends_at,live_ends_at) < now()-interval '20 min';
  if c>0 then if _bh_flag('stuck_duel','high','stuck','자동종료 실패한 일기토', c||'건이 치유 시도 후에도 멈춤 — duel_resolve 로직 점검') then v_new:=v_new+1; v_titles:=v_titles||'· 멈춘 일기토 '||c||'건\n'; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_duel'); end if;
  -- ④ 마감 후 미정산 예측시장
  select count(*) into c from markets where coalesce(resolved,false)=false and coalesce(status,'')<>'resolved' and close_at < now()-interval '50 hours';
  if c>0 then if _bh_flag('stuck_market','high','stuck','마감 후 미정산 예측시장', c||'건 마감 50h 후 미정산 — predict-auto-resolve 는 AI 판정 불가 시 48h 유예 후 환불한다. 그보다 오래 남았으면 진짜 멈춘 것') then v_new:=v_new+1; v_titles:=v_titles||'· 미정산 예측 '||c||'건\n'; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_market'); end if;
  -- ⑤ 음수 잔액
  select count(*) into c from point_balances where balance<0 or coalesce(paid_balance,0)<0;
  if c>0 then if _bh_flag('neg_balance','critical','economy','음수 GP 잔액', c||'개 계정 잔액 음수 — 차감 로직 결함') then v_new:=v_new+1; v_titles:=v_titles||'· 음수잔액 '||c||'개\n'; end if; v_state_sigs:=array_append(v_state_sigs,'neg_balance'); end if;
  -- ⑥ 방치 결제
  select count(*) into c from gp_charges where status='pending' and created_at < now()-interval '24 hours';
  if c>0 then if _bh_flag('stuck_charge','medium','economy','24h+ 미완료 결제', c||'건 pending 방치 — PG 웹훅 점검') then v_new:=v_new+1; end if; v_state_sigs:=array_append(v_state_sigs,'stuck_charge'); end if;
  -- ⑦ 크론 자기감시(최근 40분 3회+ 실패)
  for r in select j.jobname, count(*) f, left(max(d.return_message),140) m from cron.job_run_details d join cron.job j on j.jobid=d.jobid
    where d.status='failed' and d.start_time > now()-interval '40 min' group by j.jobname having count(*)>=3 loop
    if _bh_flag('cron_fail:'||r.jobname,'high','stuck','크론 반복 실패: '||r.jobname, '최근 40분 '||r.f||'회 실패. '||coalesce(r.m,'')) then v_new:=v_new+1; v_titles:=v_titles||'· 크론실패 '||r.jobname||'\n'; end if;
    v_state_sigs:=array_append(v_state_sigs,'cron_fail:'||r.jobname);
  end loop;
  /* ⑨ GP 원장 드리프트 — 잔액이 원장 합계와 어긋나면 어딘가 원장을 안 남기고 잔액만 건드린 것이다.
     실측(2026-08-31): 14명 중 1명 100 GP 어긋남. point_ledger.delta·point_balances.balance 가
     double precision 이라 미세 오차도 쌓일 수 있어 0.5 를 문턱으로 둔다(그보다 크면 누락이다).
     GP 는 랭킹·예측 정산의 근거라 어긋나면 공정성이 깨진다. */
  select count(*) into c
    from point_balances b
    left join (select user_id, sum(delta) s from point_ledger group by 1) l on l.user_id = b.user_id
   where abs(coalesce(b.balance,0) - coalesce(l.s,0)) > 0.5;
  if c>0 then if _bh_flag('gp_drift','high','economy','GP 잔액이 원장과 안 맞음', c||'개 계정에서 잔액≠원장합. 원장 없이 잔액만 바꾼 경로가 있다 — 지급·차감 코드 점검') then v_new:=v_new+1; v_titles:=v_titles||'· GP드리프트 '||c||'개\n'; end if; v_state_sigs:=array_append(v_state_sigs,'gp_drift'); end if;

  -- ⑧ 신고 적체(48h+ 미처리)
  select count(*) into c from reports where coalesce(status,'pending') in ('pending','new','open') and created_at < now()-interval '48 hours';
  if c>0 then if _bh_flag('report_backlog','medium','data','미처리 신고 적체', c||'건이 48h+ 미처리 — 모더레이션 필요') then v_new:=v_new+1; end if; v_state_sigs:=array_append(v_state_sigs,'report_backlog'); end if;

  -- 상태성 발견 자동 해제
  update bug_hunt_findings set resolved=true, resolved_at=now()
    where resolved=false and category in ('security','stuck','economy','data') and not (sig = any(v_state_sigs));

  -- ⑨ 에러 급증(이력성, 자동해제 제외)
  for r in select message, count(*) cc from client_errors where created_at>now()-interval '60 min' group by message having count(*)>=10 loop
    if _bh_flag('err_spike:'||left(md5(r.message),12),'high','errors','클라이언트 에러 급증','최근 60분 '||r.cc||'회: '||left(r.message,200)) then v_new:=v_new+1; end if;
  end loop;

  -- 🔕 관리자 알림(알림함·웹푸시·메일) 끔 — 발견은 관리자 페이지(🤖 버그헌터)에서만 본다(26.9.19 사장님)

  -- 🧹 에러 급증은 3일간 재발 없으면 저절로 닫는다 — 닫는 장치가 없어 8월 기록 212개가 열린 채 쌓였다(26.9.19)
  update bug_hunt_findings set resolved=true, resolved_at=now() where not resolved and sig like 'err_spike:%' and last_seen < now()-interval '3 days';

  select count(*) into v_open from bug_hunt_findings where resolved=false;
  return jsonb_build_object('ok',true,'open',v_open,'new',v_new,'healed',v_healed,'ran_at',now());
end $function$;
