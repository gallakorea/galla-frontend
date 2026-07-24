-- 🔐 소셜 로그인(구글·카카오·네이버) 온보딩
-- 소셜 가입은 handle_new_user 트리거가 프로필을 만들지만 '닉네임이 없다'(메타데이터에 없음).
-- 정통망법 대비 약관 동의도 없음. 그래서 소셜 신규 유저는 첫 로그인 후 이 RPC로
-- 닉네임 + 약관동의(+선택 생년/성별)를 채운다. 닉네임 유니크는 기존 트리거가 서버 강제.

create or replace function public.social_onboard(
  p_nick text,
  p_terms boolean,
  p_marketing boolean default false,
  p_birth date default null,
  p_gender text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  u uuid := auth.uid();
  nick text := btrim(coalesce(p_nick, ''));
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if not coalesce(p_terms, false) then return jsonb_build_object('ok', false, 'reason', 'terms'); end if;
  if char_length(nick) < 2 then return jsonb_build_object('ok', false, 'reason', 'nick_short'); end if;

  -- 닉네임 세팅(유니크·형식은 users/user_profiles 트리거가 강제 → 위반 시 예외를 잡아 반환)
  begin
    update public.users
       set nickname = nick,
           birth_date = coalesce(p_birth, birth_date),
           gender = coalesce(nullif(p_gender,''), gender)
     where id = u;

    update public.user_profiles
       set nickname = nick,
           birth_date = coalesce(p_birth, birth_date),
           terms_agreed_at = coalesce(terms_agreed_at, now()),
           privacy_agreed_at = coalesce(privacy_agreed_at, now()),
           marketing_opt_in = coalesce(p_marketing, false),
           marketing_agreed_at = case when p_marketing then now() else marketing_agreed_at end
     where user_id = u;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'nick_taken');
  when others then
    return jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', sqlerrm);
  end;

  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.social_onboard(text, boolean, boolean, date, text) to authenticated;

-- 온보딩 필요 여부(닉네임 유무)를 한 번에 — 프론트 게이트용
create or replace function public.needs_onboard()
returns boolean
language sql security definer set search_path = public as $$
  select case when auth.uid() is null then false
    else coalesce((select nickname is null or btrim(nickname) = '' from public.users where id = auth.uid()), true)
  end;
$$;
grant execute on function public.needs_onboard() to authenticated;
