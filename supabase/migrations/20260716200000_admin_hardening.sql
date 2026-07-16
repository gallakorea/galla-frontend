-- =========================================================
-- 관리자 보안 강화 (2026-07-16) — 감사에서 발견된 구멍 봉쇄
-- ① admin_create_market: anon/authenticated EXECUTE 열려 있고 내부 게이트 없음
--    → anon 키만으로 누구나 마켓 생성 가능했던 치명 구멍. 크론(generate-predict-markets)은
--    SERVICE_ROLE_KEY 사용 확인, 프론트 미사용 확인 → 권한 회수 + 함수 내부 이중 게이트.
-- ② anon/authenticated의 TRUNCATE/TRIGGER/REFERENCES 테이블 권한(기본 GRANT ALL 잔재)
--    108개 테이블 전면 회수 — TRUNCATE는 RLS를 우회한다. + 향후 기본권한도 축소.
-- =========================================================

-- 공용 게이트: service_role(크론/엣지) 또는 관리자만 통과
create or replace function public._require_admin_or_service()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce(auth.role(),'') = 'service_role' then return; end if;
  if coalesce(_is_admin(), false) then return; end if;
  raise exception 'admin_only' using errcode = '42501';
end $$;
revoke all on function public._require_admin_or_service() from public, anon, authenticated;

-- ① admin_create_market — 원본 로직 그대로, begin 직후 게이트만 주입
CREATE OR REPLACE FUNCTION public.admin_create_market(p_question text, p_description text, p_category text, p_close_at timestamp with time zone, p_creator uuid DEFAULT '96bf8931-113c-40cf-93ad-ebaec2d06267'::uuid, p_liquidity double precision DEFAULT 300, p_is_jackpot boolean DEFAULT false, p_jackpot double precision DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_seed double precision := greatest(coalesce(p_liquidity,300),0);
begin
  perform _require_admin_or_service();   -- 🔒 이중 게이트 (2026-07-16 보안 감사)
  if p_question is null or length(trim(p_question))=0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at<=now() then raise exception 'close_at must be future'; end if;
  insert into markets(question,description,category,image_url,created_by,close_at,market_type,
     pool_yes,pool_no,total_pool,is_jackpot,jackpot_bonus,min_stake,max_stake,rake_bps,status)
   values(trim(p_question),p_description,p_category,null,p_creator,p_close_at,'binary',
     v_seed,v_seed,v_seed*2,p_is_jackpot,coalesce(p_jackpot,0),10,1000000,0,'open')
   returning id into v_id;
  insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
   values (v_id,'예',0,v_seed,v_seed,v_seed,0),
          (v_id,'아니오',1,v_seed,v_seed,v_seed,0);
  return v_id;
end $function$;

-- EXECUTE 권한 잠금: service_role만 (관리자는 게이트 통과하므로 authenticated에 열어둘 필요도 없음 — 프론트 미사용)
revoke execute on function public.admin_create_market(text,text,text,timestamptz,uuid,double precision,boolean,double precision) from public, anon, authenticated;
grant execute on function public.admin_create_market(text,text,text,timestamptz,uuid,double precision,boolean,double precision) to service_role;

-- ② 위험 테이블 권한 전면 회수 (TRUNCATE는 RLS 우회 / TRIGGER·REFERENCES 불필요)
do $$
declare r record;
begin
  -- base tables
  for r in select tablename from pg_tables where schemaname='public' loop
    execute format('revoke truncate, trigger, references on table public.%I from anon, authenticated', r.tablename);
  end loop;
  -- views / materialized views (잔여 GRANT ALL 정리)
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind in ('v','m') loop
    execute format('revoke truncate, trigger, references on %I from anon, authenticated', r.relname);
  end loop;
end $$;
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;

-- 감사 결과(2026-07-16, 이 마이그레이션으로 검증됨):
--  · admin_flag 자가승격 = authenticated에 admin_flag/role 컬럼 UPDATE 권한 없음 → 이미 차단.
--  · 관리자 RPC 32개 _is_admin() 게이트. 열려있던 admin_create_market anon EXECUTE 봉쇄.
--  · handle_warning_count는 트리거 함수(warning_count만), admin_flag 미변경 → 무해.
