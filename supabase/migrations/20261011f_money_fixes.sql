-- 26.10.11 돈·상태기계 보안 수정 (감사 후속). 전부 '라이브 정의'를 바탕으로 썼다(레포 사본은 드리프트).
-- 적용: 운영 DB 에 이 파일 그대로 실행함.

begin;

-- ─────────────────────────────────────────────────────────────
-- 1) HIGH — 환불 경합: gc-refund 엣지가 포트원 취소를 부르는 동안 유저가 신청을 취소하면
--    현금 환불 + GC 복구가 둘 다 일어났다. → PG 잠금(pg_lock_at) 을 잡은 건은 취소·반려 불가.
-- ─────────────────────────────────────────────────────────────
alter table public.gc_refunds add column if not exists pg_lock_at timestamptz;

create or replace function public.gc_refund_claim_pg(p_refund_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  update gc_refunds set pg_lock_at = now()
   where id = p_refund_id and status = 'requested' and pg_lock_at is null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $function$;

create or replace function public.gc_refund_release_pg(p_refund_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  update gc_refunds set pg_lock_at = null
   where id = p_refund_id and status = 'requested' and pg_lock_at is not null;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', n = 1);
end $function$;

revoke all on function public.gc_refund_claim_pg(uuid)   from public, anon, authenticated;
revoke all on function public.gc_refund_release_pg(uuid) from public, anon, authenticated;
grant execute on function public.gc_refund_claim_pg(uuid)   to service_role;
grant execute on function public.gc_refund_release_pg(uuid) to service_role;

CREATE OR REPLACE FUNCTION public.gc_refund_cancel(p_refund_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r gc_refunds%rowtype;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  select * into r from gc_refunds
   where id = p_refund_id and user_id = auth.uid() and status = 'requested' for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_cancelable'); end if;
  -- 26.10.11: PG 취소가 진행 중(잠금)이면 취소 불가 — 현금+GC 이중 수령 경합 차단
  if r.pg_lock_at is not null then
    return jsonb_build_object('ok',false,'reason','pg_in_progress'); end if;

  update gc_balances set held = held - r.gc, balance = balance + r.gc, updated_at = now()
   where user_id = r.user_id;
  insert into gc_ledger(user_id, delta, reason, ref_id)
    values (r.user_id, r.gc, 'gc:refund_unhold', r.charge_id);
  update gc_refunds set status='canceled', processed_at=now() where id = r.id;
  return jsonb_build_object('ok',true);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_gc_refund_decide(p_refund_id uuid, p_action text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r gc_refunds%rowtype; v_held int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_action not in ('approve','reject','done') then
    return jsonb_build_object('ok',false,'reason','bad_action'); end if;

  select * into r from gc_refunds where id = p_refund_id for update;
  if r.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;

  if p_action = 'reject' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    -- 26.10.11: 자동 PG 취소가 진행 중이면 반려 불가(현금 나가고 GC 복구되는 경합)
    if r.pg_lock_at is not null then return jsonb_build_object('ok',false,'reason','pg_in_progress'); end if;
    update gc_balances set held = held - r.gc, balance = balance + r.gc, updated_at = now()
     where user_id = r.user_id;
    insert into gc_ledger(user_id, delta, reason, ref_id)
      values (r.user_id, r.gc, 'gc:refund_unhold', r.charge_id);
    update gc_refunds set status='rejected', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    return jsonb_build_object('ok',true,'status','rejected');
  end if;

  if p_action = 'approve' then
    if r.status <> 'requested' then return jsonb_build_object('ok',false,'reason','not_pending'); end if;
    -- 26.10.11: 자동 PG 취소가 진행 중이면 수동 승인도 막는다(콘솔 이중 환급 방지)
    if r.pg_lock_at is not null then return jsonb_build_object('ok',false,'reason','pg_in_progress'); end if;
    -- 잠긴 GC를 소멸시킨다. 신청 시점에 이미 balance 에서 빠졌으므로 잔액 부족이 있을 수 없다.
    select held into v_held from gc_balances where user_id = r.user_id for update;
    if coalesce(v_held,0) < r.gc then
      return jsonb_build_object('ok',false,'reason','hold_missing','held',coalesce(v_held,0)); end if;
    update gc_balances set held = held - r.gc, updated_at = now() where user_id = r.user_id;
    update gc_refunds set status='approved', admin_note=p_note,
           processed_by=auth.uid(), processed_at=now() where id=r.id;
    update gc_charges set status='refunded' where id = r.charge_id and status='paid';
    return jsonb_build_object('ok',true,'status','approved',
      'todo','PG 콘솔에서 ₩'||r.krw||' 환급 후 done 처리');
  end if;

  if r.status <> 'approved' then return jsonb_build_object('ok',false,'reason','not_approved'); end if;
  update gc_refunds set status='done', admin_note=coalesce(p_note, r.admin_note),
         processed_by=auth.uid(), processed_at=now() where id=r.id;
  return jsonb_build_object('ok',true,'status','done');
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 2) HIGH — 환불액 상한이 '잔액'뿐이라 인앱(IAP)으로 산 GC 를 웹 결제 환불로 현금화할 수 있었다.
--    → 이 결제 이후 실제로 쓴 GC(유료 잔액에서 나간 것)를 빼고, 그래도 잔액 이하로.
--    제외 사유: 충전·인앱·환불 잠금/해제·환불·회수·구독 지급, 그리고 구독 포함분(#sub)에서 나간 지출.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gc_refund_request(p_charge_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  c gc_charges%rowtype;
  v_bal int; v_gc int; v_cnt30 int; v_sum30 int; v_id uuid; v_spent int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if exists (select 1 from gc_payment_blocks where user_id = v_user) then
    return jsonb_build_object('ok',false,'reason','blocked'); end if;

  select * into c from gc_charges where id = p_charge_id and user_id = v_user;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status <> 'paid' then return jsonb_build_object('ok',false,'reason','not_paid'); end if;

  -- 인앱결제는 우리가 돈을 쥔 적이 없다 → 스토어에서만 환불된다
  if c.channel <> 'web' then
    return jsonb_build_object('ok',false,'reason','store_purchase','channel',c.channel); end if;

  if exists (select 1 from gc_refunds where charge_id = c.id and status in ('requested','approved')) then
    return jsonb_build_object('ok',false,'reason','already_requested'); end if;
  if exists (select 1 from gc_refunds where charge_id = c.id and status = 'done') then
    return jsonb_build_object('ok',false,'reason','already_refunded'); end if;

  select count(*), coalesce(sum(krw),0) into v_cnt30, v_sum30
    from gc_refunds
   where user_id = v_user and status in ('requested','approved','done')
     and created_at > now() - interval '30 days';
  if v_cnt30 >= 5      then return jsonb_build_object('ok',false,'reason','too_many_refunds','count',v_cnt30); end if;
  if v_sum30 >= 500000 then return jsonb_build_object('ok',false,'reason','refund_limit','sum',v_sum30); end if;

  insert into gc_balances(user_id) values (v_user) on conflict (user_id) do nothing;
  select balance into v_bal from gc_balances where user_id = v_user for update;
  v_bal := coalesce(v_bal,0);

  -- 26.10.11: 이 결제 이후 유료 잔액에서 실제로 쓴 GC
  select coalesce(-sum(delta),0) into v_spent
    from gc_ledger
   where user_id = v_user and delta < 0
     and created_at >= coalesce(c.paid_at, c.created_at)
     and reason not in ('gc:charge','gc:iap','gc:refund_hold','gc:refund_unhold','gc:refund')
     and reason not like 'gc:clawback:%'
     and reason not like 'gc:sub_credit:%'
     and reason not like '%#sub';
  v_gc  := least(c.gc - v_spent, v_bal);   -- held 는 이미 balance 밖이라 따로 뺄 필요가 없다
  if v_gc <= 0 then
    return jsonb_build_object('ok',false,'reason','nothing_refundable','balance',v_bal,'spent',v_spent); end if;

  -- 여기서 진짜로 잠근다 — 이 순간부터 어떤 차감기로도 쓸 수 없다
  update gc_balances set balance = balance - v_gc, held = held + v_gc, updated_at = now()
   where user_id = v_user;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_user, -v_gc, 'gc:refund_hold', c.id);

  insert into gc_refunds(user_id, charge_id, gc, krw, reason)
  values (v_user, c.id, v_gc, v_gc, nullif(btrim(coalesce(p_reason,'')),''))
  returning id into v_id;

  return jsonb_build_object('ok',true,'id',v_id,'gc',v_gc,'krw',v_gc,
    'partial', v_gc < c.gc, 'within_7d', c.paid_at > now() - interval '7 days');
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 5) MED — 일기토 관중 투표 조작(급조 계정) / 기권 담합 응원 GP
--    · 관중 판정은 대결 생성 1일 이전에 가입한 계정 표만, 3표 이상 + 표차일 때만. 아니면 AI 심판.
--    · 기권(forfeit)·도주(flee) 로 끝난 대결의 응원은 전액 환불.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.duel_resolve(p_duel bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d duels%rowtype; v_c int; v_o int; v_tot int; v_res text; v_win uuid; v_pot int;
begin
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status = 'finished' then return jsonb_build_object('ok',true,'status','finished','result',d.result); end if;
  if d.status = 'judging' then return jsonb_build_object('ok',true,'status','judging','needs_ai',true); end if;

  -- live 종료 → voting 개시(90s)
  if d.status = 'live' then
    if d.live_ends_at is null or now() < d.live_ends_at then
      return jsonb_build_object('ok',false,'reason','live','ends_at',d.live_ends_at);
    end if;
    update duels set status='voting', voting_ends_at = now() + interval '90 seconds' where id=p_duel;
    perform _duel_notify(d.challenger, null, 'duel_voting', '변론 종료 — 관중 투표 90초! 🗳️', p_duel);
    perform _duel_notify(d.opponent, null, 'duel_voting', '변론 종료 — 관중 투표 90초! 🗳️', p_duel);
    return jsonb_build_object('ok',true,'status','voting');
  end if;

  if d.status <> 'voting' then return jsonb_build_object('ok',false,'reason','not_voting'); end if;
  if d.voting_ends_at is null or now() < d.voting_ends_at then
    return jsonb_build_object('ok',false,'reason','too_early','ends_at',d.voting_ends_at);
  end if;

  -- 26.10.11: 대결 생성 1일 전보다 먼저 가입한 계정의 표만 센다(급조 계정 몰표 차단)
  select count(*) filter (where v.choice='challenger'), count(*) filter (where v.choice='opponent')
    into v_c, v_o
    from duel_votes v join users u on u.id = v.voter
   where v.duel_id = p_duel
     and u.created_at < ((d.created_at - interval '1 day') at time zone 'UTC');
  v_tot := v_c + v_o;

  -- 관중이 결판(유효 3표 이상 + 표차) → 관중 판정
  if v_tot >= 3 and v_c <> v_o then
    if v_c > v_o then v_res:='challenger'; v_win:=d.challenger; else v_res:='opponent'; v_win:=d.opponent; end if;
    perform _duel_finalize(p_duel, v_res, v_win, 'audience', null);
    return jsonb_build_object('ok',true,'status','finished','result',v_res,'judge','audience');
  end if;

  -- 유효표 부족 또는 동표 → AI 심판 대기
  update duels set status='judging' where id=p_duel;
  return jsonb_build_object('ok',true,'status','judging','needs_ai',true);
end $function$;

CREATE OR REPLACE FUNCTION public._duel_pay_cheers(p_duel bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare d duels%rowtype; v_win text; v_lose_pool int; v_win_weight numeric; r record; v_share int;
begin
  select * into d from duels where id=p_duel for update;
  if d.cheer_paid then return; end if;
  update duels set cheer_paid = true where id = p_duel;

  -- 무승부/무효 + 26.10.11: 기권(forfeit)·도주(flee) → 전액 환불(담합 기권으로 응원 GP 빼먹기 차단)
  if d.winner is null or d.result in ('forfeit','flee') or d.judge = 'forfeit' then
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund'); end loop;
    return;
  end if;

  v_win := case when d.winner = d.challenger then 'challenger' else 'opponent' end;
  select coalesce(sum(amount),0) into v_lose_pool from duel_cheer_bets where duel_id=p_duel and team <> v_win;
  select coalesce(sum(amount*boost),0) into v_win_weight from duel_cheer_bets where duel_id=p_duel and team = v_win;

  if v_win_weight <= 0 then   -- 이긴 편에 응원 없으면 진 편도 환불
    for r in select user_id, sum(amount) a from duel_cheer_bets where duel_id=p_duel group by user_id loop
      perform _duel_pay(r.user_id, r.a::int, 'duel_cheer_refund'); end loop;
    return;
  end if;

  -- 이긴 편: 원금 + 진 편 풀 × (내 가중지분 / 전체 가중지분)
  for r in select user_id, sum(amount) a, sum(amount*boost) w from duel_cheer_bets
            where duel_id=p_duel and team=v_win group by user_id loop
    v_share := r.a::int + floor(v_lose_pool::numeric * r.w / v_win_weight)::int;
    perform _duel_pay(r.user_id, v_share, 'duel_cheer_win');
    begin
      insert into notifications(user_id, from_user, type, message, link)
      values (r.user_id, null, 'duel_cheer_win', '🔥 응원한 편이 이겼어요! +'||v_share||' GP', 'duel.html?id='||p_duel);
    exception when others then null; end;
  end loop;
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 6) LOW — 예측 이슈연계 정산은 votes.created_at <= close_at 로 센다 → created_at 을 서버가 강제
--    (컬럼 INSERT 권한이 anon/authenticated 에 열려 있어 과거 시각을 써 넣을 수 있었다)
-- ─────────────────────────────────────────────────────────────
create or replace function public._votes_force_created_at()
 returns trigger language plpgsql set search_path to 'public'
as $function$
begin
  new.created_at := (now() at time zone 'UTC');
  return new;
end $function$;

drop trigger if exists trg_votes_force_created_at on public.votes;
create trigger trg_votes_force_created_at before insert on public.votes
  for each row execute function public._votes_force_created_at();

-- ─────────────────────────────────────────────────────────────
-- 7) LOW — 구독 환불·만료 시 포함 GC(sub_gc)도 즉시 만료
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_sub_event(p_ext_id text, p_event text, p_expires timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_uid uuid; v_state text; v_exp timestamptz;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;
  select user_id, expires_at into v_uid, v_exp from subscriptions where ext_id = p_ext_id;
  if v_uid is null then return jsonb_build_object('ok',false,'reason','no_sub'); end if;

  v_state := case p_event
    when 'renew'    then 'active'
    when 'cancel'   then 'canceled'   -- 해지 '예약'. 만료일까진 그대로 쓴다
    when 'grace'    then 'grace'
    when 'expire'   then 'expired'
    when 'refund'   then 'refunded'
    when 'resubscribe' then 'active'
    else null end;
  if v_state is null then return jsonb_build_object('ok',false,'reason','unknown_event','event',p_event); end if;

  update subscriptions set
    state = v_state,
    -- 환불·만료는 즉시 끊는다. 그 외엔 스토어가 준 만료일로 민다.
    expires_at = case when v_state in ('refunded','expired') then least(expires_at, now())
                      else coalesce(p_expires, expires_at) end,
    renews_at = case when v_state = 'active' then coalesce(p_expires, renews_at) else null end,
    auto_renew = (v_state = 'active'),
    last_event = p_event, last_event_at = now(), updated_at = now()
  where user_id = v_uid;

  -- 26.10.11: 환불·만료면 구독 포함 GC 도 지금 끊는다(_gc_spend 가 다음 사용 때 0 으로 청소)
  if v_state in ('refunded','expired') then
    update gc_balances set sub_gc_expires = least(coalesce(sub_gc_expires, now()), now()), updated_at = now()
     where user_id = v_uid;
  end if;

  return jsonb_build_object('ok',true,'state',v_state,'user',v_uid);
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 8) LOW — revoke_gc_topup: 같은 거래 환불 통보 동시 2건이면 이중 회수 → 행 잠금
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_gc_topup(p_store text, p_txid text, p_reason text DEFAULT 'store_refund'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c record; v_bal int; v_take int; v_short int;
begin
  if not ((select auth.role()) = 'service_role' or _is_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  if coalesce(btrim(p_txid), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_txid');
  end if;

  select id, user_id, gc, status into v_c
    from gc_charges
   where pg_provider = lower(p_store) and pg_tx_id = btrim(p_txid)
   limit 1
   for update;

  -- 모르는 거래에 대한 환불 통보도 온다(다른 앱·테스트·이미 지운 계정).
  -- 그건 오류가 아니라 '해당 없음'이다 — 200으로 돌려보내야 스토어가 재시도를 멈춘다.
  if not found then return jsonb_build_object('ok', true, 'unknown', true); end if;
  if v_c.status = 'refunded' then
    return jsonb_build_object('ok', true, 'dup', true, 'charge_id', v_c.id);
  end if;

  -- ① 있는 만큼만 회수 (음수 금지)
  select coalesce(balance, 0) into v_bal from gc_balances where user_id = v_c.user_id;
  v_take  := least(v_c.gc, greatest(coalesce(v_bal, 0), 0));
  v_short := v_c.gc - v_take;

  if v_take > 0 then
    update gc_balances set balance = balance - v_take, updated_at = now()
     where user_id = v_c.user_id;
    insert into gc_ledger(user_id, delta, reason, ref_id)
    values (v_c.user_id, -v_take, 'gc:refund', v_c.id);
  end if;

  update gc_charges
     set status = 'refunded', refunded_at = now(),
         refund_reason = left(coalesce(p_reason, 'store_refund'), 200),
         recovered_gc = v_take
   where id = v_c.id;

  -- ② 다 못 뺐으면 그 계정의 재결제를 막는다. 푸는 건 관리자 판단.
  if v_short > 0 then
    insert into gc_payment_blocks(user_id, reason)
    values (v_c.user_id, 'refund_shortfall:' || v_short || 'GC (' || lower(p_store) || ')')
    on conflict (user_id) do nothing;
  end if;

  return jsonb_build_object('ok', true, 'charge_id', v_c.id, 'user_id', v_c.user_id,
    'billed_gc', v_c.gc, 'recovered', v_take, 'shortfall', v_short, 'blocked', (v_short > 0));
end $function$;

-- ─────────────────────────────────────────────────────────────
-- 9) NOTE — tip_confirm 멱등이 '조회 후 갱신'이라 같은 거래 동시 2건이면 FOR UPDATE 재평가로
--    다른 pending 후원(같은 금액)을 또 확정할 수 있다 → 결제완료 거래 ID 유니크로 막는다.
--    (적용 시점 donations 0행 — 기존 데이터 충돌 없음)
-- ─────────────────────────────────────────────────────────────
create unique index if not exists donations_paid_tx_uniq
  on public.donations (pg_tx_id) where status = 'paid' and pg_tx_id is not null;

commit;
