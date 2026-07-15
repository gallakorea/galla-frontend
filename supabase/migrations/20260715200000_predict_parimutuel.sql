-- 갈라예측 파리뮤추얼 전면 재설계 (P1) — 폴리마켓 CPMM 폐지, 토토·경마식 베팅
-- 유저는 한 결과에 GP를 건다(되팔기 없음). 정산 시 승자가 전체 풀을 베팅비율로 분배.
-- 연승 콤보 배수 · 잭팟 보너스 · 하우스 시드(초기 배당 안정 + 부트스트랩 보너스).

/* ---------- 스키마 확장 ---------- */
alter table markets
  add column if not exists total_pool    double precision not null default 0,
  add column if not exists jackpot_bonus double precision not null default 0,
  add column if not exists is_jackpot    boolean          not null default false,
  add column if not exists min_stake     double precision not null default 10,
  add column if not exists max_stake     double precision not null default 1000000,
  add column if not exists rake_bps      int              not null default 0;

alter table market_outcomes
  add column if not exists pool_gp      double precision not null default 0,
  add column if not exists bettor_count int              not null default 0;

create table if not exists predict_bets (
  id          bigserial primary key,
  market_id   bigint not null references markets(id) on delete cascade,
  outcome_id  bigint not null references market_outcomes(id) on delete cascade,
  user_id     uuid   not null,
  stake       double precision not null,
  odds_at_bet double precision,
  settled     boolean not null default false,
  won         boolean,
  payout      double precision not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_predict_bets_market on predict_bets(market_id);
create index if not exists idx_predict_bets_user   on predict_bets(user_id);
alter table predict_bets enable row level security;
drop policy if exists predict_bets_read on predict_bets;
create policy predict_bets_read on predict_bets for select using (true);   -- 라이브 피드·홀더 공개, 쓰기는 RPC만

create table if not exists predict_streaks (
  user_id    uuid primary key,
  current    int not null default 0,
  best       int not null default 0,
  updated_at timestamptz not null default now()
);
alter table predict_streaks enable row level security;
drop policy if exists predict_streaks_read on predict_streaks;
create policy predict_streaks_read on predict_streaks for select using (true);

/* ---------- 연승 콤보 배수 ---------- */
create or replace function _combo_mult(n int) returns double precision
 language sql immutable as $$
  select case when n>=10 then 2.5 when n>=5 then 1.8 when n>=3 then 1.4 when n>=2 then 1.2 else 1.0 end;
$$;

/* ---------- 베팅 ---------- */
create or replace function place_bet(p_market_id bigint, p_outcome_id bigint, p_stake double precision)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); m record; o record; v_bal double precision; v_other int; v_had int; v_odds double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_stake is null or p_stake<=0 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select * into o from market_outcomes where id=p_outcome_id for update;
  if o is null or o.market_id<>p_market_id then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  select * into m from markets where id=p_market_id for update;
  if m.resolved or m.status<>'open' or m.close_at<=now() then return jsonb_build_object('ok',false,'reason','closed'); end if;
  if p_stake < m.min_stake then return jsonb_build_object('ok',false,'reason','below_min','min',m.min_stake); end if;
  if p_stake > m.max_stake then return jsonb_build_object('ok',false,'reason','above_max','max',m.max_stake); end if;
  select count(*) into v_other from predict_bets where market_id=p_market_id and user_id=v_user and outcome_id<>p_outcome_id;
  if v_other>0 then return jsonb_build_object('ok',false,'reason','other_side'); end if;

  insert into point_balances(user_id) values(v_user) on conflict(user_id) do nothing;
  select balance into v_bal from point_balances where user_id=v_user for update;
  if v_bal < p_stake then return jsonb_build_object('ok',false,'reason','insufficient','balance',v_bal); end if;

  select count(*) into v_had from predict_bets where outcome_id=p_outcome_id and user_id=v_user;

  update point_balances set balance=balance-p_stake, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id,delta,reason,market_id) values(v_user,-p_stake,'predict:bet',p_market_id);
  update market_outcomes set pool_gp=pool_gp+p_stake,
         bettor_count=bettor_count + (case when v_had=0 then 1 else 0 end) where id=p_outcome_id;
  update markets set total_pool=total_pool+p_stake, volume=coalesce(volume,0)+p_stake where id=p_market_id;

  v_odds := (m.total_pool + p_stake + coalesce(m.jackpot_bonus,0)) / (o.pool_gp + p_stake);
  insert into predict_bets(market_id,outcome_id,user_id,stake,odds_at_bet)
    values(p_market_id,p_outcome_id,v_user,p_stake,v_odds);
  return jsonb_build_object('ok',true,'balance',v_bal-p_stake,'odds',round(v_odds::numeric,2));
end $$;

/* ---------- 상태 조회(배당·풀·내 베팅) ---------- */
create or replace function predict_state(p_market_id bigint)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); m record; v_out jsonb; v_participants int; v_mybets jsonb;
begin
  select * into m from markets where id=p_market_id;
  if m is null then return jsonb_build_object('ok',false); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
     'id',o.id,'label',o.label,'sort',o.sort_order,'pool',o.pool_gp,'bettors',o.bettor_count,'is_winner',o.is_winner,
     'odds', case when o.pool_gp>0 then round(((m.total_pool + coalesce(m.jackpot_bonus,0))/o.pool_gp)::numeric,2) else null end
   ) order by o.sort_order), '[]'::jsonb) into v_out from market_outcomes o where o.market_id=p_market_id;
  select count(distinct user_id) into v_participants from predict_bets where market_id=p_market_id;
  if v_user is not null then
    select coalesce(jsonb_object_agg(outcome_id, s),'{}'::jsonb) into v_mybets
      from (select outcome_id, sum(stake) s from predict_bets where market_id=p_market_id and user_id=v_user group by outcome_id) t;
  else v_mybets := '{}'::jsonb; end if;
  return jsonb_build_object('ok',true,'total_pool',m.total_pool,'jackpot',m.jackpot_bonus,'is_jackpot',m.is_jackpot,
     'participants',v_participants,'resolved',m.resolved,'resolved_outcome_id',m.resolved_outcome_id,
     'close_at',m.close_at,'status',m.status,'min_stake',m.min_stake,'max_stake',m.max_stake,
     'outcomes',v_out,'my_bets',v_mybets);
end $$;

/* ---------- 정산(승자 분배 + 잭팟 + 연승 콤보) ---------- */
create or replace function predict_resolve(p_market_id bigint, p_outcome_id bigint)
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); m record; v_win_pool double precision; v_distrib double precision; v_rake double precision;
  urec record; v_base double precision; v_streak int; v_mult double precision; v_bonus double precision;
  v_paid int := 0; v_refunded boolean := false;
begin
  select * into m from markets where id=p_market_id for update;
  if m is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if m.resolved then return jsonb_build_object('ok',false,'reason','already'); end if;
  -- 권한: 서비스롤(auth.uid null) · 관리자 · 생성자
  if not ((v_user is null) or _is_admin() or (m.created_by = v_user)) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if not exists(select 1 from market_outcomes where id=p_outcome_id and market_id=p_market_id) then
    return jsonb_build_object('ok',false,'reason','bad_outcome'); end if;

  select pool_gp into v_win_pool from market_outcomes where id=p_outcome_id;
  v_rake := m.total_pool * m.rake_bps / 10000.0;
  v_distrib := m.total_pool - v_rake + coalesce(m.jackpot_bonus,0);

  if coalesce(v_win_pool,0) <= 0 then
    -- 승자 없음(그 결과에 아무도 안 걺) → 전액 환불
    for urec in select user_id, sum(stake) s from predict_bets where market_id=p_market_id and not settled group by user_id loop
      insert into point_balances(user_id) values(urec.user_id) on conflict(user_id) do nothing;
      update point_balances set balance=balance+urec.s, updated_at=now() where user_id=urec.user_id;
      insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id,urec.s,'predict:refund',p_market_id);
    end loop;
    update predict_bets set settled=true, won=false, payout=stake where market_id=p_market_id and not settled;
    v_refunded := true;
  else
    for urec in select user_id, sum(stake) filter (where outcome_id=p_outcome_id) as win_stake
                from predict_bets where market_id=p_market_id and not settled group by user_id loop
      if coalesce(urec.win_stake,0) > 0 then
        v_base := urec.win_stake / v_win_pool * v_distrib;
        insert into predict_streaks(user_id,current,best) values(urec.user_id,1,1)
          on conflict(user_id) do update set current=predict_streaks.current+1,
            best=greatest(predict_streaks.best, predict_streaks.current+1), updated_at=now()
          returning current into v_streak;
        v_mult := _combo_mult(v_streak);
        v_bonus := v_base*(v_mult-1);
        insert into point_balances(user_id) values(urec.user_id) on conflict(user_id) do nothing;
        update point_balances set balance=balance+v_base+v_bonus, updated_at=now() where user_id=urec.user_id;
        insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id, v_base, 'predict:win', p_market_id);
        if v_bonus>0 then insert into point_ledger(user_id,delta,reason,market_id) values(urec.user_id, v_bonus, 'predict:combo', p_market_id); end if;
        v_paid := v_paid + 1;
      else
        update predict_streaks set current=0, updated_at=now() where user_id=urec.user_id;
      end if;
    end loop;
    update predict_bets set settled=true, won=(outcome_id=p_outcome_id),
      payout = case when outcome_id=p_outcome_id then stake / v_win_pool * v_distrib else 0 end
      where market_id=p_market_id and not settled;
  end if;

  update market_outcomes set is_winner=(id=p_outcome_id) where market_id=p_market_id;
  update markets set resolved=true, resolved_at=now(), status='resolved', resolved_outcome_id=p_outcome_id where id=p_market_id;
  return jsonb_build_object('ok',true,'paid_users',v_paid,'distributed',v_distrib,'refunded',v_refunded,'jackpot',m.jackpot_bonus);
end $$;

/* ---------- 봇 생성(파리뮤추얼 2결과 + 하우스 시드 + 잭팟 플래그) ---------- */
create or replace function admin_create_market(
  p_question text, p_description text, p_category text, p_close_at timestamptz,
  p_creator uuid default '96bf8931-113c-40cf-93ad-ebaec2d06267'::uuid,
  p_liquidity double precision default 300,
  p_is_jackpot boolean default false, p_jackpot double precision default 0)
returns bigint language plpgsql security definer set search_path to public as $$
declare v_id bigint; v_seed double precision := greatest(coalesce(p_liquidity,300),0);
begin
  if p_question is null or length(trim(p_question))=0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at<=now() then raise exception 'close_at must be future'; end if;
  insert into markets(question,description,category,image_url,created_by,close_at,market_type,
     pool_yes,pool_no,total_pool,is_jackpot,jackpot_bonus,min_stake,max_stake,rake_bps,status)
   values(trim(p_question),p_description,p_category,null,p_creator,p_close_at,'binary',
     v_seed,v_seed,v_seed*2,p_is_jackpot,coalesce(p_jackpot,0),10,1000000,0,'open')
   returning id into v_id;
  insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
   values (v_id,'예',0,v_seed,v_seed,v_seed,0),
          (v_id,'아니오',1,v_seed,v_seed,v_seed,0);
  return v_id;
end $$;

/* ---------- 잭팟 주입 ---------- */
create or replace function admin_seed_jackpot(p_market_id bigint, p_amount double precision)
returns jsonb language plpgsql security definer set search_path to public as $$
begin
  if not ((auth.uid() is null) or _is_admin()) then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update markets set jackpot_bonus=coalesce(jackpot_bonus,0)+greatest(coalesce(p_amount,0),0), is_jackpot=true where id=p_market_id;
  return jsonb_build_object('ok',true);
end $$;

/* ---------- wipe 확장(신규 테이블 포함) ---------- */
create or replace function admin_wipe_markets()
returns integer language plpgsql security definer set search_path to public as $$
declare n int;
begin
  select count(*) into n from markets;
  delete from market_comment_likes;
  delete from market_comments;
  delete from market_reactions;
  delete from market_bookmarks;
  delete from predict_bets;
  delete from market_trades;
  delete from market_positions;
  delete from market_outcomes;
  delete from markets;
  return n;
end $$;

/* ---------- 권한 ---------- */
revoke all on function place_bet(bigint,bigint,double precision) from public, anon;
grant execute on function place_bet(bigint,bigint,double precision) to authenticated;
grant execute on function predict_state(bigint) to anon, authenticated;
revoke all on function predict_resolve(bigint,bigint) from public, anon;
grant execute on function predict_resolve(bigint,bigint) to authenticated;
grant execute on function _combo_mult(int) to anon, authenticated;
