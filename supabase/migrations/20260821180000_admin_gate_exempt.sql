/* ══ 관리자 대화 턴 한도 면제 ═══════════════════════════════════
   사장님 계정(role=admin)이 tier='free' 로 취급돼 5시간 25턴 한도에 걸렸다
   ("갈비스 시간제한 걸림" — 실측: used 25/25, rate_limit).
   운영자가 자기 앱에서 잘리면 QA 도 운영도 못 한다.

   레드팀 면제(20260821150000)와 동일 원칙:
   · 면제는 '턴 한도'에만 — 예산 하드스톱(budget)·등급 잠금은 그대로.
   · 대상은 user_profiles.admin_flag = true 뿐. */

create or replace function public.is_admin_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from user_profiles where user_id = p_uid and admin_flag = true);
$$;

do $patch$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ai_gate';
  if src is null then raise exception 'ai_gate 없음'; end if;
  if position('is_admin_uid' in src) > 0 then raise notice '이미 적용됨'; return; end if;

  src := replace(src,
    'if v_uid is not null and public.is_redteam_uid(v_uid) then',
    'if v_uid is not null and (public.is_redteam_uid(v_uid) or public.is_admin_uid(v_uid)) then');
  if position('is_admin_uid' in src) = 0 then raise exception '삽입 지점(레드팀 면제)을 못 찾았다'; end if;
  execute src;
  raise notice '관리자 면제 삽입';
end $patch$;

do $chk$
declare g jsonb;
begin
  select public.ai_gate('galla-friend',
    'u:' || (select user_id::text from user_profiles where admin_flag = true limit 1), 0) into g;
  if not (g->>'ok')::boolean then raise exception '관리자가 여전히 막힌다: %', g; end if;
  select public.ai_gate('galla-friend', 'u:' || gen_random_uuid()::text, 999999) into g;
  if (g->>'ok')::boolean then raise exception '일반 유저 한도가 무력화됐다'; end if;
  raise notice '관리자 면제 OK — 일반 유저 한도 그대로';
end $chk$;
