-- =========================================================
-- 갈비스 대화를 유료 전용으로 (사장님 결정 2026-08-27)
--
-- "그냥 무료를 없애자. 전부 결제 후 되는 걸로"
--
-- ⚠️ 갈라 앱 자체는 계속 무료다. 이슈·광장·예측·숏판·뉴스 전부 그대로.
--    잠그는 건 **갈비스 대화**뿐이다.
--
-- 어떻게 잠그나: 무료·게스트의 galla-friend 창을 0 으로 둔다.
--   ai_gate 는 limit<=0 이면 tier_locked 를 돌려주고, 화면은 "이용권 올리면 바로 열려"로
--   이용권 시트를 연다. 막되 이유와 길을 같이 준다 — 아무 반응 없는 게 제일 나쁘다.
--
-- ⚠️ 되돌리는 건 이 값을 다시 넣는 것뿐이다(25 / 5). 코드는 안 건드린다.
-- ⚠️ 애플 심사: 결제 뒤에만 되는 기능은 리뷰어 계정을 줘야 한다. 안 주면 반려된다.
--    관리자 부여(admin_grant_subscription)로 심사용 계정에 이용권을 미리 넣어 둘 것.
-- =========================================================

update app_settings set v = jsonb_set(
  jsonb_set(v, '{free,windows,galla-friend}',  jsonb_build_object('n', 0, 'hours', 5)),
  '{guest,windows,galla-friend}', jsonb_build_object('n', 0, 'hours', 24)
) where k = 'ai_tiers';

-- 앱 조작도 같이 잠근다 — 대화가 막힌 상태에서 조작만 열려 있으면 앞뒤가 안 맞는다.
update app_settings set v = jsonb_set(
  jsonb_set(v, '{free,tool_turns}', '0'::jsonb),
  '{guest,tool_turns}', '0'::jsonb
) where k = 'ai_tiers';

do $$
declare v_free int; v_guest int; v_paid int;
begin
  select (v->'free'->'windows'->'galla-friend'->>'n')::int,
         (v->'guest'->'windows'->'galla-friend'->>'n')::int,
         (v->'companion_sometimes'->'windows'->'galla-friend'->>'n')::int
    into v_free, v_guest, v_paid from app_settings where k='ai_tiers';
  if coalesce(v_free,-1) <> 0 or coalesce(v_guest,-1) <> 0 then
    raise exception '무료/게스트가 안 잠겼다 (free %, guest %)', v_free, v_guest;
  end if;
  -- 유료는 살아 있어야 한다. 다 잠그면 파는 게 없다.
  if coalesce(v_paid,0) <= 0 then raise exception '유료 단까지 잠겼다 — 팔 게 없다'; end if;
end $$;

comment on table public.subscriptions is
  '컴패니언 구독. 2026-08-27부터 갈비스 대화는 이용권 전용(무료·게스트 창 0). 앱의 다른 기능은 무료.';
