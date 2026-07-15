-- 갈라예측 P3/P4 — 정산 알림·리더보드를 파리뮤추얼(predict_bets/predict:*) 기준으로 재정의

/* 1) 정산 알림: market_positions(CPMM 잔재) → predict_bets 베터에게 */
create or replace function trg_notify_market_resolved()
returns trigger language plpgsql security definer set search_path to public as $$
declare u record; v_win bigint;
begin
  if coalesce(OLD.resolved,false) or not coalesce(NEW.resolved,false) then return NEW; end if;
  v_win := NEW.resolved_outcome_id;
  for u in select user_id, bool_or(outcome_id = v_win) as won
           from predict_bets where market_id = NEW.id and user_id is not null group by user_id
  loop
    perform public._notify_sys(u.user_id, 'market_resolved', null,
      case when u.won
        then '🎉 예측 적중! — "' || left(coalesce(NEW.question,''),30) || '" 상금이 지급됐어요.'
        else '예측이 정산됐어요 — "' || left(coalesce(NEW.question,''),30) || '" 결과를 확인하세요.' end,
      'predict-market.html?id=' || NEW.id);
  end loop;
  return NEW;
exception when others then return NEW;
end $$;

/* 2) 적중왕: predict:bet/win/combo/refund 기준 순수익 + 적중 횟수 */
create or replace view predict_king_leaderboard as
select l.user_id, up.nickname, up.level,
  round(coalesce(sum(l.delta) filter (where l.reason like 'predict:%'),0)::numeric,0) as profit,
  count(*) filter (where l.reason='predict:bet') as trades,
  count(*) filter (where l.reason='predict:win') as wins
from point_ledger l
left join user_profiles up on up.user_id=l.user_id
group by l.user_id, up.nickname, up.level
having count(*) filter (where l.reason='predict:bet') > 0;

/* 3) 예측의 신(창시자): 참여자 수를 predict_bets 기준으로 */
create or replace view predict_god_leaderboard as
select m.created_by as user_id, up.nickname, up.level,
  count(distinct m.id) as markets_created,
  round(coalesce(sum(m.total_pool),0)::numeric,0) as total_volume,
  coalesce((select count(distinct b.user_id) from predict_bets b
            join markets m2 on m2.id=b.market_id where m2.created_by=m.created_by),0) as participants
from markets m
left join user_profiles up on up.user_id=m.created_by
where m.created_by is not null
group by m.created_by, up.nickname, up.level;
