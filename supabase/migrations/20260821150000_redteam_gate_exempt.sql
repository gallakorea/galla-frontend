/* ══ 레드팀 계정만 대화 턴 한도에서 뺀다 ═══════════════════════════
   무료 등급은 5시간 25턴이다. 배터리 한 번이 48턴이라 3계정에 나눠도 16턴씩 —
   주 1회 크론이면 안 걸린다. 다만 하루에 여러 번 돌리면(디버깅·케이스 추가 후 재검증)
   계정이 소진되고, 그러면 갈비스가 "목이 좀 쉬었다"만 답하면서 액션이 비어
   [no_deliver] 로 잡힌다 — 결함이 아닌데 결함으로 보인다(오늘 실제로 두 번 속았다).

   ⚠️ 예외는 '턴 한도'에만 준다. 예산 하드스톱(budget)·등급 잠금(tier_locked)은 그대로다.
      테스트 계정이 돈까지 무한으로 쓰면 안 된다.
   ⚠️ 대상은 redteam_pool 에 등록된 uid 뿐이다(운영자만 쓰는 테이블). */

create or replace function public.is_redteam_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from redteam_pool where uid = p_uid);
$$;

do $patch$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ai_gate';
  if src is null then raise exception 'ai_gate 를 찾지 못했다'; end if;
  if position('is_redteam_uid' in src) > 0 then raise notice '이미 적용됨'; return; end if;

  src := replace(src,
    '  if v_used + p_n > v_limit then',
    '  -- 🤖 레드팀 전용 계정은 턴 한도 면제(배터리가 반쪽 실행되며 가짜 결함을 만든다)'  || chr(10) ||
    '  if v_uid is not null and public.is_redteam_uid(v_uid) then'                      || chr(10) ||
    '    v_used := 0;'                                                                  || chr(10) ||
    '  end if;'                                                                         || chr(10) ||
    '  if v_used + p_n > v_limit then');

  execute src;
  raise notice 'ai_gate 에 레드팀 면제 삽입';
end $patch$;

do $chk$
declare g jsonb; n int;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.proname='ai_gate' and pg_get_functiondef(p.oid) like '%is_redteam_uid%';
  if n < 1 then raise exception '면제 삽입 실패'; end if;

  -- 레드팀 계정: 한도 소진 상태여도 통과해야 한다
  select public.ai_gate('galla-friend', 'u:' || (select uid::text from redteam_pool order by id limit 1), 0) into g;
  if not (g->>'ok')::boolean then raise exception '레드팀 계정이 여전히 막힌다: %', g; end if;

  -- 일반 유저: 한도 로직이 그대로여야 한다(면제가 전체로 새면 안 된다)
  select public.ai_gate('galla-friend', 'u:' || gen_random_uuid()::text, 999999) into g;
  if (g->>'ok')::boolean then raise exception '일반 유저 한도가 무력화됐다: %', g; end if;

  raise notice '레드팀 면제 OK — 일반 유저 한도는 그대로';
end $chk$;
