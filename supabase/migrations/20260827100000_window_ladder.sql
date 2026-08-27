-- =========================================================
-- 클로드식으로 — 5시간 창이 사다리다 (사장님 결정 2026-08-27)
--
-- "얘기하다 어느 정도 지나면 기다려야 하고, 계속하고 싶으면 상위로 결제"
--
-- 지금 상태의 문제
--   ① 월 포함량(monthly_turns)을 값의 레버로 만들어 놨는데 **아무도 그걸로 막지 않는다.**
--      실제로 막는 건 ai_gate 의 5시간 창뿐이다. 화면엔 월 한도가 보이는데 실제 경험은
--      5시간 창이라 — 보이는 것과 겪는 것이 다르다. 제일 나쁜 종류의 불일치다.
--   ② 그 5시간 창이 유료 단 전부 200으로 똑같다. 돈을 더 내도 **막히는 시점이 같다.**
--      사다리가 없으니 올릴 이유도 없다.
--
-- 그래서
--   · 5시간 창을 등급 레버로 되돌린다: 25 → 60 → 120 → 400
--   · monthly_turns 는 뺀다(안 막는 숫자를 보여주지 않는다). 조작은 월 한도가 맞다 —
--     대화보다 23배 비싸서 순간이 아니라 총량으로 관리해야 한다.
--
-- ⚠️ 조작(galla-friend:tool)의 5시간 창은 남긴다 — 그건 폭주 방어다.
-- =========================================================

update app_settings set v = (
  select jsonb_object_agg(t.k,
    case t.k
      when 'guest' then t.val
      else (t.val - 'monthly_turns')
             || jsonb_build_object('windows',
                  (t.val -> 'windows') || jsonb_build_object('galla-friend',
                    jsonb_build_object('n',
                      case t.k
                        when 'free'                then 25
                        when 'companion_sometimes' then 60
                        when 'companion_daily'     then 120
                        when 'companion_plus'      then 120
                        when 'companion_always'    then 400
                        else 25 end,
                      'hours', 5)))
    end)
  from jsonb_each(v) t(k, val)
) where k = 'ai_tiers';

-- 월 대화량은 이제 화면에도 쓰지 않는다. 조작은 그대로 월 한도.
create or replace function public.companion_usage(p_uid uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_tier text; v_gc int; v_label text; v_tlim int; v_tused int; v_win jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', true, 'tier', 'guest'); end if;
  if p_uid is not null and p_uid <> auth.uid() and not _is_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  v_tier := public.tier_of(v_uid);
  select (v -> v_tier ->> 'label'), (v -> v_tier ->> 'tool_turns')::int,
         (v -> v_tier -> 'windows' -> 'galla-friend')
    into v_label, v_tlim, v_win from app_settings where k = 'ai_tiers';

  select coalesce(sum(calls) filter (where fn = 'galla-friend:tool'), 0)::int
    into v_tused
    from ai_month_usage
   where subject = 'u:' || v_uid::text
     and month = date_trunc('month', (now() at time zone 'Asia/Seoul'))::date;

  select gc into v_gc from gc_prices where item = 'chat_turn' and active;

  return jsonb_build_object(
    'ok', true, 'tier', v_tier, 'label', coalesce(v_label, v_tier),
    -- 대화는 '5시간에 몇 번' 이 진실이다. 안 막는 월 숫자는 더 이상 보내지 않는다.
    'window_turns', coalesce((v_win ->> 'n')::int, 0),
    'window_hours', coalesce((v_win ->> 'hours')::numeric, 5),
    'tool_included', coalesce(v_tlim, 0), 'tool_used', v_tused,
    'tool_remaining', greatest(coalesce(v_tlim, 0) - v_tused, 0),
    'gc_per_turn', v_gc,
    'resets_on', (date_trunc('month', (now() at time zone 'Asia/Seoul')) + interval '1 month')::date
  );
end $$;
grant execute on function public.companion_usage(uuid) to authenticated;

do $$
declare r record; prev int := -1;
begin
  -- 사다리가 실제로 올라가는지 — 같은 값이 둘이면 돈 낼 이유가 없다
  for r in
    select t.k as tier, (a.v -> t.k -> 'windows' -> 'galla-friend' ->> 'n')::int as n
      from app_settings a
      cross join (select unnest(array['free','companion_sometimes','companion_daily','companion_always']) k) t
     where a.k = 'ai_tiers'
     order by array_position(array['free','companion_sometimes','companion_daily','companion_always'], t.k)
  loop
    if r.n is null then raise exception '% 에 5시간 창이 없다', r.tier; end if;
    if r.n <= prev then raise exception '사다리가 안 올라간다 — % 가 % (앞 단 %)', r.tier, r.n, prev; end if;
    prev := r.n;
  end loop;
  if exists (select 1 from app_settings where k='ai_tiers' and (v -> 'companion_daily') ? 'monthly_turns') then
    raise exception '안 막는 월 한도가 아직 남아 있다 — 보이는 것과 겪는 것이 달라진다';
  end if;
end $$;
