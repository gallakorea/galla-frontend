-- 💰 크리에이터 수익 배분 확정(2026-07-25 사장님 확정) — 영구 고정 요율
--   플랫폼 20% · 자선 5% · 크리에이터 75% (GC 총액 기준, 결제수수료는 충전 시점에서 이미 차감)
--   ⚠️ '영구 고정'을 공표하는 정책이므로 추후 인상 금지(런칭 후 인상은 신뢰 붕괴 — 트위치·패트리온 전례).
--   변경 전: fee 20% / charity 30% / net 50%  →  자선을 5%로 낮추고 그 차액을 전부 크리에이터에게.
-- 최소 출금: 20만원(사장님 확정) — 소액 정산은 PG 건당 비용이 수수료보다 커서 정산마다 적자.

-- ── 이슈 후원 ──────────────────────────────────────────────────────────────
create or replace function public.gc_donate(p_issue_id bigint, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int; v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from issues where id = p_issue_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;

  v_fee := floor(p_amount * 0.20)::int;      -- 플랫폼 20%(영구 고정)
  v_charity := floor(p_amount * 0.05)::int;  -- 자선 5%(플랫폼이 집행)
  v_net := p_amount - v_fee - v_charity;     -- 크리에이터 75%
  begin v_tier := _donation_tier(p_amount); exception when others then v_tier := 'gc'; end;

  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(issue_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_issue_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;
grant execute on function public.gc_donate(bigint,int,text,boolean) to authenticated;

-- ── 육성 난장(라이브) 쏘기 ─────────────────────────────────────────────────
create or replace function public.gc_donate_live(p_room uuid, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int; v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select owner_id into v_creator from open_rooms where id=p_room and kind='live';
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_room'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;

  v_fee := floor(p_amount * 0.20)::int;
  v_charity := floor(p_amount * 0.05)::int;
  v_net := p_amount - v_fee - v_charity;
  begin v_tier := _donation_tier(p_amount); exception when others then v_tier := 'live'; end;

  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(live_room_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_room, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate_live', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;
grant execute on function public.gc_donate_live(uuid,int,text,boolean) to authenticated;

-- ── 최소 출금 10만원 ───────────────────────────────────────────────────────
create or replace function public.request_withdrawal(p_amount integer, p_bank text, p_account text, p_holder text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_avail int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  -- 최소 20만원(사장님 확정): 소액 정산은 PG 건당 비용이 수수료보다 커 정산마다 적자
  if p_amount is null or p_amount < 200000 then return jsonb_build_object('ok',false,'reason','min_200000','min',200000); end if;
  select (my_creator_earnings()->>'available')::int into v_avail;
  if v_avail < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','available',v_avail); end if;
  if coalesce(btrim(p_bank),'')='' or coalesce(btrim(p_account),'')='' or coalesce(btrim(p_holder),'')='' then
    return jsonb_build_object('ok',false,'reason','need_bank'); end if;
  insert into withdrawals(user_id, bank, account_number, holder, amount, status)
    values (v_uid, p_bank, p_account, p_holder, p_amount, 'pending');
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.request_withdrawal(integer,text,text,text) to authenticated;
