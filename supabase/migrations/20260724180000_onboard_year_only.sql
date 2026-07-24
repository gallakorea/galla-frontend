-- 🔐 온보딩 나이 = 출생'연도'만 수집(월·일 제거, 사장님 요청 2026-07-24)
-- 기존 7인자(p_birth date) 제거하고 p_birth_year int 버전으로 교체.
drop function if exists public.social_onboard(text, boolean, boolean, date, text, text, text);

create or replace function public.social_onboard(
  p_nick text,
  p_terms boolean,
  p_marketing boolean default false,
  p_birth_year int default null,
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
  yr   int  := p_birth_year;
  cur  int  := extract(year from current_date)::int;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if char_length(nick) < 2 then return jsonb_build_object('ok', false, 'reason', 'nick_short'); end if;
  if not coalesce(p_terms, false) then return jsonb_build_object('ok', false, 'reason', 'terms'); end if;
  if yr is null or yr < 1900 or yr > cur then return jsonb_build_object('ok', false, 'reason', 'birth'); end if;
  if (cur - yr) < 14 then return jsonb_build_object('ok', false, 'reason', 'age14'); end if;
  if gen is null or gen not in ('male','female') then return jsonb_build_object('ok', false, 'reason', 'gender'); end if;
  if reg is null then return jsonb_build_object('ok', false, 'reason', 'region'); end if;

  begin
    update public.users
       set nickname   = nick,
           birth_year = yr,
           birth_date = make_date(yr, 1, 1),   -- 연도만 받으므로 1월 1일로 채움(통계는 birth_year 사용)
           gender     = gen,
           region     = reg,
           phone      = coalesce(ph, phone)
     where id = u;

    update public.user_profiles
       set nickname            = nick,
           birth_date          = make_date(yr, 1, 1),
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
grant execute on function public.social_onboard(text, boolean, boolean, int, text, text, text) to authenticated;
