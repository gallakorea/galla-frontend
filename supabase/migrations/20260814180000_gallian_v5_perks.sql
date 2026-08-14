-- =========================================================
-- 갈라리안 v5 (3/3) — 등급 혜택을 '진짜로' 구현
--
-- 등급 페이지엔 이렇게 적혀 있었다:
--   참견러 GP +5% · 판잡이 GP +18% · 대장군 GP +45% · 알고리즘 최우선
-- 코드에는 0줄이었다. 등급이 하는 일은 칭호 해금 하나뿐이었다.
-- 써놓고 안 주는 건 안 써놓는 것보다 나쁘다.
--
-- ⚠️ '상단 노출·알고리즘 최우선'은 구현하지 않는다 —
--    hot_score 를 계산하는 코드가 아예 없고 메인 피드는 created_at 순이다.
--    (읽는 곳만 있고 쓰는 곳이 없다) 정렬 엔진을 새로 만드는 건 별개 작업이라
--    여기 끼워 넣지 않고, 화면 문구에서 그 약속을 뺀다.
--
-- 실제로 주는 것:
--   ① GP 획득 보너스 (0/5/10/18/28/45%) — 화면에 약속된 수치 그대로
--   ② 전투 일일 상한 상향 (400 → 최대 580)
--   ③ 등급 전용 아이템 (등급이 있어야 살 수 있는 물건)
-- =========================================================

/* 등급별 보너스율 — 단일 출처. 화면 문구도 이 값을 읽어 그린다. */
create or replace function public.tier_perks()
returns table(tier_lv int, gp_bonus_pct int, battle_cap int)
language sql immutable as $$
  values (0::int, 0::int, 400::int), (10, 5, 420), (20, 10, 440),
         (30, 18, 470), (40, 28, 510), (50, 45, 580);
$$;

create or replace function public._tier_lv(p_user uuid)
returns int language sql stable security definer set search_path to 'public' as $$
  select coalesce((select tier_lv from gallian_cache where user_id = p_user), 0);
$$;

-- ---------------------------------------------------------
-- ① GP 획득 보너스 — 원장 트리거 한 곳에서 얹는다
--
-- 왜 트리거인가: GP 를 주는 함수가 28개고 대부분 point_ledger 에 직접 쓴다.
-- 28곳을 고치면 앞으로 새로 생기는 지급 경로가 또 누락된다. 원장은 한 곳이다.
--
-- ⚠️ 허용목록 방식이다(차단목록 아님). 충전·환불·구제·추천인·관리자 지급처럼
--    '활동으로 번 게 아닌' GP 에 보너스가 붙으면 안 된다. 새 지급 사유가
--    생기면 여기 추가해야 보너스가 붙는다 — 빠뜨려도 손해가 안 나는 방향이다.
-- ⚠️ 무한재귀 방지: 보너스 행의 사유는 'tier_bonus:' 로 시작해 허용목록에 안 걸린다.
-- ---------------------------------------------------------
create or replace function public._tier_gp_bonus()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_pct int; v_bonus int;
begin
  if new.delta is null or new.delta <= 0 or new.user_id is null then return null; end if;
  if new.reason !~ '^(daily|mission:|battle:|issue_win|duel|predict:(win|combo)|tip:|gacha)' then
    return null;
  end if;

  select gp_bonus_pct into v_pct from tier_perks() where tier_lv = _tier_lv(new.user_id);
  if coalesce(v_pct,0) = 0 then return null; end if;

  v_bonus := floor(new.delta * v_pct / 100.0);
  if v_bonus <= 0 then return null; end if;

  update point_balances set balance = balance + v_bonus, updated_at = now()
   where user_id = new.user_id;
  insert into point_ledger (user_id, delta, reason)
  values (new.user_id, v_bonus, 'tier_bonus:' || new.reason);
  return null;
end $$;

drop trigger if exists trg_tier_gp_bonus on public.point_ledger;
create trigger trg_tier_gp_bonus after insert on public.point_ledger
  for each row execute function public._tier_gp_bonus();

-- ---------------------------------------------------------
-- ② 전투 일일 상한 — 등급이 오르면 하루에 벌 수 있는 양이 늘어난다
--    (기존 _battle_award 의 상수 400 을 등급표에서 읽게 바꾼다)
-- ---------------------------------------------------------
create or replace function public._battle_award(p_user uuid, p_issue bigint, p_comment bigint, p_kind text, p_base integer)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_daily_cap int;
  v_today numeric;
  v_grant int;
  v_day_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
begin
  if p_user is null then return 0; end if;

  -- 등급 혜택: 상한이 400 → 최대 580 까지 열린다
  select battle_cap into v_daily_cap from tier_perks() where tier_lv = _tier_lv(p_user);
  v_daily_cap := coalesce(v_daily_cap, 400);

  select coalesce(sum(delta),0) into v_today
    from point_ledger
   where user_id = p_user and delta > 0
     and reason like 'battle:%'
     and created_at >= v_day_start;

  v_grant := greatest(0, least(p_base, v_daily_cap - v_today::int));

  insert into battle_merits(user_id, comment_id, issue_id, kind, gp_awarded)
  values (p_user, p_comment, p_issue, p_kind, v_grant);

  if v_grant > 0 then
    insert into point_balances(user_id, balance) values (p_user, v_grant)
      on conflict (user_id) do update set balance = point_balances.balance + v_grant,
                                          updated_at = now();
    insert into point_ledger(user_id, delta, reason) values (p_user, v_grant, 'battle:'||p_kind);
  end if;

  return v_grant;
end $$;

-- ---------------------------------------------------------
-- ③ 등급 전용 아이템 — 돈으로 못 사는 것을 만든다
--
-- 등급 자체를 팔면 등급이 죽는다. 등급이 '자격'이 되어야 아이템이 팔린다.
-- ---------------------------------------------------------
create table if not exists public.item_tier_gate (
  item_key    text primary key,
  min_tier_lv int  not null,
  note        text
);
alter table public.item_tier_gate enable row level security;
drop policy if exists item_tier_gate_read on public.item_tier_gate;
create policy item_tier_gate_read on public.item_tier_gate for select using (true);
grant select on public.item_tier_gate to anon, authenticated;

create or replace function public.buy_item(p_key text, p_qty integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_price int; v_cost int; v_bal double precision;
        v_qty int; v_cur text; v_need int; v_tier int;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_qty < 1 or p_qty > 50 then return jsonb_build_object('ok', false, 'reason', 'bad_qty'); end if;
  v_price := _item_price(p_key);
  if v_price is null then return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;

  /* 🔒 등급 게이트 — 시즌 등급이 모자라면 돈이 있어도 못 산다 */
  select min_tier_lv into v_need from item_tier_gate where item_key = p_key;
  if v_need is not null then
    v_tier := _tier_lv(v_user);
    if v_tier < v_need then
      return jsonb_build_object('ok', false, 'reason', 'tier_locked',
        'need_tier', (select name from season_tiers() where tier_lv = v_need),
        'my_tier',   (select name from season_tiers() where tier_lv = v_tier));
    end if;
  end if;

  v_cost := v_price * p_qty;
  v_cur  := _item_currency(p_key);

  if v_cur = 'GC' then
    v_bal := _gc_spend(v_user, v_cost, 'shop:'||p_key||'x'||p_qty);
    if v_bal is null then
      return jsonb_build_object('ok', false, 'reason', 'insufficient', 'currency', 'GC',
        'balance', coalesce((select balance from gc_balances where user_id=v_user),0), 'cost', v_cost); end if;
  else
    v_bal := _gp_spend(v_user, v_cost);
    if v_bal is null then
      return jsonb_build_object('ok', false, 'reason', 'insufficient', 'currency', 'GP',
        'balance', (select balance from point_balances where user_id=v_user), 'cost', v_cost); end if;
    insert into point_ledger (user_id, delta, reason) values (v_user, -v_cost, 'shop:'||p_key||'x'||p_qty);
  end if;

  insert into user_items (user_id, item_key, qty) values (v_user, p_key, p_qty)
    on conflict (user_id, item_key) do update set qty = user_items.qty + excluded.qty, updated_at = now()
    returning qty into v_qty;
  return jsonb_build_object('ok', true, 'currency', v_cur, 'balance', v_bal, 'qty', v_qty);
end $$;

grant execute on function public.tier_perks() to anon, authenticated;
comment on function public._tier_gp_bonus() is
  '등급 GP 보너스 — 원장 트리거. 허용목록(활동으로 번 GP)에만 붙는다. 새 지급 사유는 여기 추가해야 보너스가 간다.';
