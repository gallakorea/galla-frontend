-- 📊 관제: 원가만이 아니라 '마진'을 본다 (2026-08-08)
--
--  기존 admin_ai_margin은 원가만 줬다. 정작 판단에 필요한 건 매출 대비 얼마가 남느냐다.
--  · 등급별 원가 + 매출(구독료 일할) + 마진/마진율
--  · 모델별 원가 — "어디에 돈이 새는가"
--  · 원가 상위 유저 — 남용·이상치를 눈으로 잡는다(한 명이 전체를 태우는 상황 조기 발견)
--
--  ⚠️ 매출은 '현재 활성 구독'을 기간으로 일할한 추정치다. 실제 결제 원장이 붙으면 그걸로 교체할 것.
--     앱스토어 IAP는 실수령 70%라 net_rate를 적용해 '실수령 기준'으로 계산한다(웹과 섞어 보면 착시).

create or replace function public.admin_ai_margin(p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_krw numeric; v_cfg jsonb; v_tiers jsonb; v_since date; v_d int;
  v_by_tier jsonb; v_by_model jsonb; v_top jsonb;
  v_cost numeric; v_rev numeric;
begin
  if not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  v_d := greatest(coalesce(p_days, 30), 1);
  v_since := (now() - make_interval(days => v_d))::date;
  select v into v_cfg from app_settings where k = 'ai_margin';
  select v into v_tiers from app_settings where k = 'ai_tiers';
  v_krw := coalesce((v_cfg ->> 'krw_per_usd')::numeric, 1380);

  -- 등급별 원가 + 매출(활성 구독 일할, 실수령 반영) + 마진
  with spend as (
    select case when s.user_id = public.ai_guest_uid() then 'guest' else public.tier_of(s.user_id) end tier,
           s.user_id, sum(s.cost_usd) c, sum(s.calls) calls
      from ai_spend s where s.day >= v_since group by 1, 2
  ), agg as (
    select tier, count(*) users, sum(c) * v_krw cost_krw, sum(calls) calls from spend group by tier
  ), rev as (
    select sub.tier,
           sum(coalesce((v_tiers -> sub.tier ->> 'price')::numeric, 0)
               * coalesce((v_cfg -> 'net_rate' ->> coalesce(sub.source, 'web_pg'))::numeric, 0.97)
               * (v_d / 30.0)) rev_krw
      from subscriptions sub where sub.expires_at > now() group by sub.tier
  )
  select jsonb_agg(jsonb_build_object(
    'tier', t.tier,
    'users', coalesce(a.users, 0),
    'calls', coalesce(a.calls, 0),
    'cost_krw', round(coalesce(a.cost_krw, 0)),
    'revenue_krw', round(coalesce(r.rev_krw, 0)),
    'margin_krw', round(coalesce(r.rev_krw, 0) - coalesce(a.cost_krw, 0)),
    'margin_pct', case when coalesce(r.rev_krw, 0) > 0
                       then round((1 - coalesce(a.cost_krw, 0) / r.rev_krw) * 100) else null end,
    'cost_per_user_krw', round(coalesce(a.cost_krw, 0) / greatest(coalesce(a.users, 0), 1))
  ) order by array_position(array['guest','free','lite','friend','pro'], t.tier))
  into v_by_tier
  from (select unnest(array['guest','free','lite','friend','pro']) tier) t
  left join agg a on a.tier = t.tier
  left join rev r on r.tier = t.tier;

  -- 모델별 원가 — 어디에 돈이 나가는지
  select jsonb_agg(x order by (x->>'cost_krw')::numeric desc) into v_by_model from (
    select jsonb_build_object('model', model, 'calls', sum(calls),
      'cost_krw', round(sum(cost_usd) * v_krw),
      'out_tokens', sum(out_tokens)) x
    from ai_spend where day >= v_since group by model
  ) q;

  -- 원가 상위 유저 — 한 명이 전체를 태우는 상황을 눈으로 잡는다
  select jsonb_agg(x order by (x->>'cost_krw')::numeric desc) into v_top from (
    select jsonb_build_object(
      'user_id', s.user_id,
      -- 닉네임이 없다고 전부 게스트로 표기하면 실제 회원이 게스트로 오인된다(탈퇴·프로필 미생성과 구분).
      'nickname', case when s.user_id = public.ai_guest_uid() then '(게스트 합산)'
                       else coalesce((select u.nickname from users u where u.id = s.user_id), '(탈퇴·미상)') end,
      'tier', case when s.user_id = public.ai_guest_uid() then 'guest' else public.tier_of(s.user_id) end,
      'calls', sum(s.calls), 'cost_krw', round(sum(s.cost_usd) * v_krw)) x
    from ai_spend s where s.day >= v_since group by s.user_id
    order by sum(s.cost_usd) desc limit 10
  ) q;

  select coalesce(sum(cost_usd), 0) * v_krw into v_cost from ai_spend where day >= v_since;
  select coalesce(sum(coalesce((v_tiers -> sub.tier ->> 'price')::numeric, 0)
           * coalesce((v_cfg -> 'net_rate' ->> coalesce(sub.source, 'web_pg'))::numeric, 0.97)
           * (v_d / 30.0)), 0) into v_rev
    from subscriptions sub where sub.expires_at > now();

  return jsonb_build_object('ok', true, 'days', v_d,
    'by_tier', coalesce(v_by_tier, '[]'::jsonb),
    'by_model', coalesce(v_by_model, '[]'::jsonb),
    'top_users', coalesce(v_top, '[]'::jsonb),
    'total_cost_krw', round(v_cost),
    'total_revenue_krw', round(v_rev),
    'total_margin_krw', round(v_rev - v_cost),
    'total_margin_pct', case when v_rev > 0 then round((1 - v_cost / v_rev) * 100) else null end);
end $$;
