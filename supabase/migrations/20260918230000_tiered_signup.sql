-- 🪜 단계별 가입(26.9.18 사장님): 가입은 빠르게, 정보는 필요할 때.
--   1단계 가입  = 닉네임 + 약관(만 14세 이상 확인 포함) → 둘러보기·투표·댓글·글쓰기 전부.
--   2단계 통계  = 이슈 성별·나이·지역 통계를 보려면 출생연도·성별·지역을 넣는다(주고받기).
--   3단계 수익화 = 출금하려면 휴대폰 본인인증(포트원) — 실명·CI 로 예금주 확인·다계정 방지.

-- ① 소셜 가입: 출생연도·성별·지역은 이제 선택(넣었으면 검사만)
create or replace function public.social_onboard(p_nick text, p_terms boolean, p_marketing boolean default false,
  p_birth_year integer default null, p_gender text default null, p_region text default null, p_phone text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  u uuid := auth.uid();
  nick text := btrim(coalesce(p_nick, ''));
  gen  text := nullif(btrim(coalesce(p_gender,'')), '');
  reg  text := nullif(btrim(coalesce(p_region,'')), '');
  ph   text := nullif(btrim(coalesce(p_phone,'')), '');
  yr   int  := p_birth_year;
  cur  int  := extract(year from current_date)::int;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if char_length(nick) < 2 then return jsonb_build_object('ok', false, 'reason', 'nick_short'); end if;
  if not coalesce(p_terms, false) then return jsonb_build_object('ok', false, 'reason', 'terms'); end if;
  if yr is not null and (yr < 1900 or yr > cur) then return jsonb_build_object('ok', false, 'reason', 'birth'); end if;
  if yr is not null and (cur - yr) < 14 then return jsonb_build_object('ok', false, 'reason', 'age14'); end if;
  if gen is not null and gen not in ('male','female') then return jsonb_build_object('ok', false, 'reason', 'gender'); end if;
  begin
    update public.users
       set nickname   = nick,
           birth_year = coalesce(yr, birth_year),
           birth_date = coalesce(case when yr is not null then make_date(yr, 1, 1) end, birth_date),
           gender     = coalesce(gen, gender),
           region     = coalesce(reg, region),
           phone      = coalesce(ph, phone)
     where id = u;
    update public.user_profiles
       set nickname            = nick,
           birth_date          = coalesce(case when yr is not null then make_date(yr, 1, 1) end, birth_date),
           region              = coalesce(reg, region),
           phone               = coalesce(ph, phone),
           age_verified        = true,     -- 약관 항목 '만 14세 이상' 자기 확인
           terms_agreed_at     = coalesce(terms_agreed_at, now()),
           privacy_agreed_at   = coalesce(privacy_agreed_at, now()),
           marketing_opt_in    = coalesce(p_marketing, false),
           marketing_agreed_at = case when p_marketing then now() else marketing_agreed_at end
     where user_id = u;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  when others then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', sqlerrm);
  end;
  return jsonb_build_object('ok', true);
end $function$;

-- ② 통계용 정보 — 내 상태 / 넣기
create or replace function public.my_demographics()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case when auth.uid() is null then jsonb_build_object('login', false)
  else (select jsonb_build_object('login', true,
          'complete', (u.gender in ('male','female') and u.birth_date is not null and nullif(u.region,'') is not null),
          'birth_year', coalesce(u.birth_year, extract(year from u.birth_date)::int),
          'gender', u.gender, 'region', u.region)
        from users u where u.id = auth.uid()) end;
$$;

create or replace function public.set_my_demographics(p_birth_year int, p_gender text, p_region text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); cur int := extract(year from current_date)::int;
  gen text := nullif(btrim(coalesce(p_gender,'')), ''); reg text := nullif(btrim(coalesce(p_region,'')), '');
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if p_birth_year is null or p_birth_year < 1900 or p_birth_year > cur then return jsonb_build_object('ok', false, 'reason', 'birth'); end if;
  if (cur - p_birth_year) < 14 then return jsonb_build_object('ok', false, 'reason', 'age14'); end if;
  if gen is null or gen not in ('male','female') then return jsonb_build_object('ok', false, 'reason', 'gender'); end if;
  if reg is null or char_length(reg) > 20 then return jsonb_build_object('ok', false, 'reason', 'region'); end if;
  update users set birth_year = p_birth_year, birth_date = make_date(p_birth_year, 1, 1), gender = gen, region = reg where id = u;
  update user_profiles set birth_date = make_date(p_birth_year, 1, 1), region = reg where user_id = u;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.set_my_demographics(int, text, text) from public, anon;
grant execute on function public.set_my_demographics(int, text, text) to authenticated;
grant execute on function public.my_demographics() to anon, authenticated;

-- ③ 이슈 통계: 보는 사람도 정보를 넣어야 연다(서버 강제). 집계 로직은 그대로.
do $$ begin
  if not exists (select 1 from pg_proc where proname = 'issue_demographics_core') then
    alter function public.issue_demographics(bigint) rename to issue_demographics_core;
  end if;
end $$;
revoke all on function public.issue_demographics_core(bigint) from public, anon, authenticated;

create or replace function public.issue_demographics(p_issue bigint)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare me jsonb := public.my_demographics(); r jsonb;
begin
  r := public.issue_demographics_core(p_issue);
  if coalesce((me->>'complete')::boolean, false) or public.is_admin() then return r; end if;
  -- 잠금: 총 참여 수만 알려 준다(얼마나 모였는지 보고 넣을지 정하게)
  return jsonb_build_object('total', coalesce((r->>'total')::int, 0), 'locked', true,
    'need', case when coalesce((me->>'login')::boolean, false) then 'profile' else 'login' end);
end $$;
grant execute on function public.issue_demographics(bigint) to anon, authenticated;

-- ④ 출금은 휴대폰 본인인증 뒤에만
create or replace function public.request_withdrawal(p_amount integer, p_bank text, p_account text, p_holder text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid(); v_avail int; v_ok boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select coalesce(phone_verified, false) into v_ok from user_profiles where user_id = v_uid;
  if not coalesce(v_ok, false) then return jsonb_build_object('ok',false,'reason','need_phone'); end if;
  -- 최소 20만원(사장님 확정): 소액 정산은 PG 건당 비용이 수수료보다 커 정산마다 적자
  if p_amount is null or p_amount < 200000 then return jsonb_build_object('ok',false,'reason','min_200000','min',200000); end if;
  select (my_creator_earnings()->>'available')::int into v_avail;
  if v_avail < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','available',v_avail); end if;
  if coalesce(btrim(p_bank),'')='' or coalesce(btrim(p_account),'')='' or coalesce(btrim(p_holder),'')='' then
    return jsonb_build_object('ok',false,'reason','need_bank'); end if;
  insert into withdrawals(user_id, bank, account_number, holder, amount, status)
    values (v_uid, p_bank, p_account, p_holder, p_amount, 'pending');
  return jsonb_build_object('ok',true);
end $function$;

create or replace function public.my_verification()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('phone_verified', coalesce(p.phone_verified, false),
    'verified_at', p.identity_verified_at,
    'phone_tail', case when p.phone_verified and p.phone is not null then right(regexp_replace(p.phone, '\D', '', 'g'), 4) end)
  from user_profiles p where p.user_id = auth.uid();
$$;
grant execute on function public.my_verification() to authenticated;

-- 같은 사람(CI)이 여러 계정으로 인증하지 못하게
create unique index if not exists user_profiles_ci_uniq on public.user_profiles (ci) where ci is not null;
