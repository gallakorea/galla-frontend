-- App Store 5.1.1(v): 성별은 필수가 될 수 없다(핵심기능과 무관). 통계 참여 시 성별을 '선택'으로.
-- 성별 미제공 허용(null) — 제공 시에만 male/female 검증. 출생연도·지역은 통계 자체의 축이라 유지.
CREATE OR REPLACE FUNCTION public.set_my_demographics(p_birth_year integer, p_gender text, p_region text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare u uuid := auth.uid(); cur int := extract(year from current_date)::int;
  gen text := nullif(btrim(coalesce(p_gender,'')), ''); reg text := nullif(btrim(coalesce(p_region,'')), '');
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  if p_birth_year is null or p_birth_year < 1900 or p_birth_year > cur then return jsonb_build_object('ok', false, 'reason', 'birth'); end if;
  if (cur - p_birth_year) < 14 then return jsonb_build_object('ok', false, 'reason', 'age14'); end if;
  -- 🟢 성별은 선택: 비어 있으면 통과, 값이 있을 때만 형식 검증
  if gen is not null and gen not in ('male','female') then return jsonb_build_object('ok', false, 'reason', 'gender'); end if;
  if reg is null or char_length(reg) > 20 then return jsonb_build_object('ok', false, 'reason', 'region'); end if;
  update users set birth_year = p_birth_year, birth_date = make_date(p_birth_year, 1, 1), gender = gen, region = reg where id = u;
  update user_profiles set birth_date = make_date(p_birth_year, 1, 1), region = reg where user_id = u;
  return jsonb_build_object('ok', true);
end $function$;
