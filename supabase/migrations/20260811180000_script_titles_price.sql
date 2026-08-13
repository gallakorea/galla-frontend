-- =========================================================
-- 대본·제목 유료화
--
-- 지금까지: gc_prices 에 script/titles 가 0 GC 로 있었지만 애초에 과금 배선이 없었다.
--   대본·제목은 galla-friend 대화 안에서 gen_script / gen_titles 툴로 만들어지고,
--   통제는 채팅 턴 한도(ai_tiers.windows.galla-friend)뿐이었다.
--   원가는 나간다 — DeepSeek 실측 ₩1.64/턴에 긴 출력이 붙는다.
--
-- 이번 변경
--   · script 200 GC / titles 40 GC
--     20260808240000(ai_alacarte_gc)에 기록돼 있던 원래 의도값이다.
--     썸네일 200 · 영상 1000 사이에서 위치도 맞는다.
--   · galla-friend 는 service_role 로 도는 엣지 함수라 auth.uid() 를 못 쓴다.
--     → ai_creation_charge_for(p_user, ...) 를 만든다. service_role 전용.
--     클라이언트가 호출할 수 있으면 남의 지갑을 깎을 수 있으니 권한을 반드시 막는다.
--
-- ⚠️ 이용권과의 관계: 썸네일이 이미 그렇듯, 이용권은 '사용 한도'를 주고
--    GC 는 '건별 요금'으로 따로 받는 게 지금 구조다. 대본·제목도 같게 맞췄다.
--    "프로는 대본 무료" 같은 정책을 원하면 tier 별 면제 로직을 따로 넣어야 한다.
-- =========================================================

update public.gc_prices set
  gc = 200, cost_krw = 6.00, updated_at = now(),
  cost_basis = 'DeepSeek chat 실측 ₩1.64/턴 기준, 대본은 긴 출력(2~3천 토큰) → 건당 약 ₩6'
where item = 'script';

update public.gc_prices set
  gc = 40, cost_krw = 2.00, updated_at = now(),
  cost_basis = 'DeepSeek chat 실측 ₩1.64/턴, 제목 8개는 짧은 출력 → 건당 약 ₩2'
where item = 'titles';

-- ---------------------------------------------------------
-- 유저 지정 과금 — 엣지 함수(service_role) 전용
-- ---------------------------------------------------------
create or replace function public.ai_creation_charge_for(
  p_user uuid, p_kind text, p_n integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_unit int; v_price int; v_bal double precision;
begin
  -- 🔒 service_role 또는 관리자만. 이게 뚫리면 남의 지갑을 깎을 수 있다.
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;
  if p_user is null then return jsonb_build_object('ok',false,'reason','no_user'); end if;

  select gc into v_unit from gc_prices where item = p_kind and active;
  if v_unit is null then
    return jsonb_build_object('ok',false,'reason','no_price','item',p_kind); end if;

  v_price := v_unit * greatest(1, coalesce(p_n,1));
  if v_price <= 0 then return jsonb_build_object('ok',true,'charged',0); end if;

  v_bal := _gc_spend(p_user, v_price, 'ai_creation:' || p_kind);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id = p_user),0));
  end if;
  return jsonb_build_object('ok',true,'charged',v_price,'currency','GC','balance',v_bal);
end $$;

revoke execute on function public.ai_creation_charge_for(uuid, text, integer) from anon, authenticated, public;
grant  execute on function public.ai_creation_charge_for(uuid, text, integer) to service_role;

comment on function public.ai_creation_charge_for(uuid, text, integer) is
  'service_role 전용 유저 지정 GC 과금. galla-friend 같이 auth.uid()가 없는 엣지 함수용. authenticated 에 절대 grant 하지 말 것 — 남의 지갑을 깎을 수 있다.';
