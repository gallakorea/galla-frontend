/* ══ 운영자(admin_flag) 계정을 갈비스 시간제한에서 뺀다 ═══════════════════
   사장님이 갈비스를 실사용 테스트하다 "아 목이 좀 쉬었다 ㅋㅋ HH:MM쯤 다시 올게"에
   걸렸다(무료 등급 5시간 25턴 롤링 창). 운영 계정은 하루 종일 자기 서비스를 두드리는
   게 일인데, 턴 한도가 테스트를 끊으면 QA 자체가 안 된다 — 레드팀 풀(20260821150000)과
   똑같은 문제의 '사람 버전'이다.

   면제 범위(레드팀 면제와 동일한 원칙):
   · ai_gate 의 롤링 창 턴 한도(5시간 25턴 등) — 면제 ✅
   · ai_user_take 의 유저별 일일 캡(기본 300/일) — 면제 ✅ (다음으로 걸릴 벽이라 같이 푼다)
   · 예산 하드스톱(budget)·등급 잠금(tier_locked)·기능 disabled — 그대로 ⛔
     (한도 면제지 무한 과금이 아니다. 지출 통제 장치는 건드리지 않는다.)

   ⚠️ 대상은 user_profiles.admin_flag = true 계정뿐이다(관리자 화면에서만 부여 가능,
      authenticated 에 컬럼 UPDATE 권한이 없어 자가승격 불가 — 20260716200000 참조). */

-- 서비스 롤 경로(엣지 함수)에서 부르므로 auth.uid() 기반 _is_admin() 은 못 쓴다. uid 인자 버전.
create or replace function public.is_admin_uid(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from user_profiles p
                  where p.user_id = p_uid and coalesce(p.admin_flag, false));
$$;

-- 1) ai_gate — 롤링 창 판정 직전에 운영자면 사용량을 0으로 본다(사용 기록 자체는 계속 쌓인다: 관제용).
do $patch$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ai_gate';
  if src is null then raise exception 'ai_gate 를 찾지 못했다'; end if;
  if position('is_admin_uid' in src) > 0 then raise notice 'ai_gate 이미 적용됨'; return; end if;

  src := replace(src,
    '  if v_used + p_n > v_limit then',
    '  -- 👑 운영자 계정은 턴 한도 면제(자기 서비스 테스트가 한도에 끊기면 QA가 안 된다)' || chr(10) ||
    '  if v_uid is not null and public.is_admin_uid(v_uid) then'                            || chr(10) ||
    '    v_used := 0;'                                                                      || chr(10) ||
    '  end if;'                                                                             || chr(10) ||
    '  if v_used + p_n > v_limit then');

  execute src;
  raise notice 'ai_gate 에 운영자 면제 삽입';
end $patch$;

-- 2) ai_user_take — 일일 캡도 같은 방식으로. disabled(한도 0 = 기능 꺼짐)는 그대로 둔다.
do $patch$
declare src text;
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'ai_user_take';
  if src is null then raise exception 'ai_user_take 를 찾지 못했다'; end if;
  if position('is_admin_uid' in src) > 0 then raise notice 'ai_user_take 이미 적용됨'; return; end if;

  src := replace(src,
    '  if v_used + p_n > v_limit then',
    '  -- 👑 운영자 계정은 일일 캡 면제(위 ai_gate 면제와 한 몸 — 다음 벽에서 또 걸리면 의미가 없다)' || chr(10) ||
    '  if public.is_admin_uid(p_uid) then'                                                             || chr(10) ||
    '    v_used := 0;'                                                                                 || chr(10) ||
    '  end if;'                                                                                        || chr(10) ||
    '  if v_used + p_n > v_limit then');

  execute src;
  raise notice 'ai_user_take 에 운영자 면제 삽입';
end $patch$;

-- 검증 — 면제가 들어갔고, 일반 유저 한도는 그대로인지
do $chk$
declare g jsonb; n int; v_admin uuid;
begin
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'ai_gate' and pg_get_functiondef(p.oid) like '%is_admin_uid%';
  if n < 1 then raise exception 'ai_gate 면제 삽입 실패'; end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'ai_user_take' and pg_get_functiondef(p.oid) like '%is_admin_uid%';
  if n < 1 then raise exception 'ai_user_take 면제 삽입 실패'; end if;

  -- 운영자 계정: 한도가 소진돼 있어도 통과해야 한다(계정이 없는 새 DB면 건너뛴다)
  select p.user_id into v_admin from user_profiles p where coalesce(p.admin_flag, false) limit 1;
  if v_admin is not null then
    select public.ai_gate('galla-friend', 'u:' || v_admin::text, 1) into g;
    if not (g->>'ok')::boolean then raise exception '운영자 계정이 여전히 막힌다: %', g; end if;
    select public.ai_user_take('galla-friend', v_admin, 1) into g;
    if not (g->>'ok')::boolean then raise exception '운영자 일일 캡이 여전히 막는다: %', g; end if;
  end if;

  -- 일반 유저: 한도 로직이 그대로여야 한다(면제가 전체로 새면 안 된다)
  select public.ai_gate('galla-friend', 'u:' || gen_random_uuid()::text, 999999) into g;
  if (g->>'ok')::boolean then raise exception '일반 유저 창 한도가 무력화됐다: %', g; end if;

  raise notice '운영자 면제 OK — 일반 유저 한도는 그대로';
end $chk$;
