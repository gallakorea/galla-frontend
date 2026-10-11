-- 2026-10-11 보안 감사: 관리자 콘솔 저장형 XSS 2건(관리자 세션 탈취) 서버 측 차단 + gc_audit 노출
-- ① 가입 메타데이터 gender 가 검증 없이 users.gender 로 → 관리자 회원 목록에 그대로 렌더(무클릭)
-- ② 익명 submit_bug 의 스크린샷이 접두사만 검사 → 관리자가 '스크린샷 보기' 누르면 속성 탈출
-- 라이브 정의를 받아 해당 한 줄씩만 바꿨다. 기존 악성 값 0건 확인 후 제약 추가.

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  bd date := null;
  agreed boolean := coalesce((m->>'terms_agreed')::boolean, false);
  mkt boolean := coalesce((m->>'marketing_opt_in')::boolean, false);
  av text := nullif(coalesce(m->>'avatar_url', m->>'picture'), '');
begin
  begin bd := nullif(m->>'birth_date','')::date; exception when others then bd := null; end;

  insert into public.users (id, nickname, phone, region, email, birth_date, gender, avatar_url)
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    new.email,
    bd,
    case when m->>'gender' in ('male','female') then m->>'gender' end,   -- 🔒 가입 메타데이터는 클라가 정한다 — 화이트리스트만(26.10.11: 관리자 화면 XSS 경로)
    av
  )
  on conflict (id) do update set
    nickname   = coalesce(excluded.nickname,   public.users.nickname),
    phone      = coalesce(excluded.phone,      public.users.phone),
    region     = coalesce(excluded.region,     public.users.region),
    email      = coalesce(excluded.email,       public.users.email),
    birth_date = coalesce(excluded.birth_date, public.users.birth_date),
    gender     = coalesce(excluded.gender,     public.users.gender),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);  -- 이미 올린 사진 우선

  insert into public.user_profiles (
    user_id, nickname, phone, region, anonymous,
    birth_date, age_verified,
    terms_agreed_at, privacy_agreed_at,
    marketing_opt_in, marketing_agreed_at
  )
  values (
    new.id,
    nullif(m->>'nickname', ''),
    nullif(m->>'phone', ''),
    nullif(m->>'region', ''),
    coalesce((m->>'anonymous')::boolean, false),
    bd,
    coalesce((m->>'age_verified')::boolean, false),
    case when agreed then now() else null end,
    case when agreed then now() else null end,
    mkt,
    case when mkt then now() else null end
  )
  on conflict (user_id) do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_bug(p_message text, p_page_url text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_viewport text DEFAULT NULL::text, p_app_version text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_shot text DEFAULT NULL::text, p_meta jsonb DEFAULT NULL::jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_uid uuid := auth.uid(); v_msg text := btrim(coalesce(p_message, ''));
begin
  -- 글이 없어도 유형이나 스크린샷이 있으면 받는다(한 번 누르고 보내기)
  if length(v_msg) < 2 and p_category is null and p_shot is null then raise exception '내용을 입력해주세요.'; end if;
  if p_shot is not null and (length(p_shot) > 900000 or p_shot !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$') then p_shot := null; end if;
  -- 도배 방지: 한 사람 1시간 10건, 비로그인 전체 1시간 60건
  if v_uid is not null then
    if (select count(*) from bug_reports where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then raise exception '잠시 후 다시 보내주세요.'; end if;
  elsif (select count(*) from bug_reports where user_id is null and created_at > now() - interval '1 hour') >= 60 then
    raise exception '잠시 후 다시 보내주세요.';
  end if;
  insert into public.bug_reports(user_id, message, page_url, user_agent, viewport, app_version, category, shot, meta)
  values (v_uid, left(coalesce(nullif(v_msg, ''), '(' || coalesce(p_category, '스크린샷') || ')'), 4000), left(p_page_url, 500), left(p_user_agent, 500),
          left(p_viewport, 60), left(p_app_version, 40), left(p_category, 40), p_shot,
          case when p_meta is not null and length(p_meta::text) < 20000 then p_meta end)
  returning id into v_id;
  return v_id;
end $function$;

alter table public.users drop constraint if exists users_gender_chk;
alter table public.users add constraint users_gender_chk check (gender is null or gender in ('male','female'));

-- ③ gc_audit(GC 발행·소진 총액 = 회사 매출 지표)가 로그인 유저 누구에게나 보였다 → 관리자 RPC 로만
revoke select on public.gc_audit from authenticated, anon, public;
create or replace function public.admin_gc_audit() returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return null; end if;
  return (select to_jsonb(a) from gc_audit a limit 1);
end $$;
revoke all on function public.admin_gc_audit() from public, anon;
grant execute on function public.admin_gc_audit() to authenticated;
