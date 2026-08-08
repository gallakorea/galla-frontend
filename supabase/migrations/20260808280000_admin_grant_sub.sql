-- 🎟 관리자 이용권 부여 (2026-08-08)
--  start_subscription은 결제 웹훅(service_role) 전용이라 관리자가 손으로 줄 방법이 없었다.
--  체험판·보상·환불 대응·내부 테스트에 반드시 필요하므로 관리자 전용 경로를 연다.
--  ⚠️ 권한 판정은 auth.uid()+admin_flag로 한다. SECURITY DEFINER 안에서 current_user는
--     소유자로 평가되므로 절대 권한 근거로 쓰지 않는다.
create or replace function public.admin_grant_subscription(
  p_uid uuid, p_tier text, p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_base timestamptz; v_exp timestamptz;
begin
  if not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if p_tier is null then                      -- 회수: 즉시 만료
    delete from subscriptions where user_id = p_uid;
    return jsonb_build_object('ok', true, 'tier', null);
  end if;
  if p_tier not in ('lite', 'friend', 'pro') then
    return jsonb_build_object('ok', false, 'reason', 'bad_tier');
  end if;

  select greatest(coalesce(expires_at, now()), now()) into v_base from subscriptions where user_id = p_uid;
  insert into subscriptions (user_id, tier, expires_at, source, auto_renew)
  values (p_uid, p_tier, coalesce(v_base, now()) + make_interval(days => greatest(p_days, 1)), 'admin', false)
  on conflict (user_id) do update set
    tier = excluded.tier, expires_at = excluded.expires_at, source = 'admin', updated_at = now()
  returning expires_at into v_exp;

  return jsonb_build_object('ok', true, 'tier', p_tier, 'expires_at', v_exp);
end $$;
