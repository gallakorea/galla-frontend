-- 🔐 소셜/패스키 온보딩 확장 — 이메일 가입과 동일 항목 수집
-- 필수: 닉네임·생년월일·성별·지역·약관(만14세+이용약관+개인정보)
-- 선택: 전화번호·마케팅
-- 소셜(구글)·패스키 신규는 이메일+이름/아바타만 들어오므로 첫 활동 전 이걸로 채운다.

create or replace function public.social_onboard(
  p_nick text,
  p_terms boolean,
  p_marketing boolean default false,
  p_birth date default null,
  p_gender text default null,
  p_region text default null,
  p_phone text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  nick text := btrim(coalesce(p_nick, ''));
  gen  text := nullif(btrim(coalesce(p_gender,'')), '');
  reg  text := nullif(btrim(coalesce(p_region,'')), '');
  ph   text := nullif(btrim(coalesce(p_phone,'')), '');
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  -- 필수 검증
  if char_length(nick) < 2 then return jsonb_build_object('ok', false, 'reason', 'nick_short'); end if;
  if not coalesce(p_terms, false) then return jsonb_build_object('ok', false, 'reason', 'terms'); end if;
  if p_birth is null then return jsonb_build_object('ok', false, 'reason', 'birth'); end if;
  if p_birth > (current_date - interval '14 years') then return jsonb_build_object('ok', false, 'reason', 'age14'); end if;
  if gen is null or gen not in ('male','female') then return jsonb_build_object('ok', false, 'reason', 'gender'); end if;
  if reg is null then return jsonb_build_object('ok', false, 'reason', 'region'); end if;

  begin
    update public.users
       set nickname   = nick,
           birth_date = p_birth,
           birth_year = extract(year from p_birth)::int,
           gender     = gen,
           region     = reg,
           phone      = coalesce(ph, phone)
     where id = u;

    update public.user_profiles
       set nickname            = nick,
           birth_date          = p_birth,
           region              = reg,
           phone               = coalesce(ph, phone),
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
end $$;
grant execute on function public.social_onboard(text, boolean, boolean, date, text, text, text) to authenticated;

-- needs_onboard: 닉네임 미설정 = 소셜/패스키 신규 미완료 (이메일 가입자는 항상 닉네임 보유 → 영향 없음)
create or replace function public.needs_onboard()
returns boolean
language sql security definer set search_path = public as $$
  select case when auth.uid() is null then false
    else coalesce((select nickname is null or btrim(nickname) = '' from public.users where id = auth.uid()), true)
  end;
$$;
grant execute on function public.needs_onboard() to authenticated;
