-- 갈라예측 후속 4종: ①유저 생성 파리뮤추얼화 ②미션 '예측 1회' ③이슈 연계 ④시즌제

/* ---------- ① 유저 예측 만들기: 파리뮤추얼 생성으로 재정의 ----------
   CPMM 풀 대신 pool_gp 하우스 시드(결과당 300). 이진(예/아니오) + 다중 지원. */
create or replace function create_market(
  p_question text, p_description text, p_category text, p_image_url text,
  p_close_at timestamptz, p_outcomes jsonb default null, p_liquidity double precision default 300)
returns bigint language plpgsql security definer set search_path to public as $$
declare v_user uuid := auth.uid(); v_id bigint; v_seed double precision := greatest(coalesce(p_liquidity,300),0);
  v_type text := 'binary'; v_n int := 0; oc jsonb;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if p_question is null or length(trim(p_question)) = 0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at <= now() then raise exception 'close_at must be future'; end if;
  if p_outcomes is not null and jsonb_array_length(p_outcomes) >= 2 then v_type := 'multi'; end if;

  insert into markets(question,description,category,image_url,created_by,close_at,market_type,
     pool_yes,pool_no,total_pool,is_jackpot,jackpot_bonus,min_stake,max_stake,rake_bps,status)
   values(trim(p_question),p_description,p_category,p_image_url,v_user,p_close_at,v_type,
     v_seed,v_seed, v_seed * (case when v_type='multi' then jsonb_array_length(p_outcomes) else 2 end),
     false,0,10,1000000,0,'open')
   returning id into v_id;

  if v_type='multi' then
    for oc in select * from jsonb_array_elements(p_outcomes) loop
      insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
      values (v_id, left(trim(oc->>'label'),30), v_n, v_seed, v_seed, v_seed, 0);
      v_n := v_n + 1;
    end loop;
  else
    insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
    values (v_id,'예',0,v_seed,v_seed,v_seed,0),(v_id,'아니오',1,v_seed,v_seed,v_seed,0);
  end if;
  return v_id;
end $$;

/* ---------- ② 데일리 미션: 예측 1회 (+300) ---------- */
create or replace function public.daily_mission_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_start timestamp := _kst_day_start();
  v_today date := _kst_today();
  v_votes int; v_comments int; v_battle int; v_bets int;
  v_res jsonb;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select count(*) into v_votes    from votes           where user_id = v_user and created_at >= v_start;
  select count(*) into v_comments from comments        where user_id = v_user and created_at >= v_start;
  select count(*) into v_battle   from comment_actions where user_id = v_user and created_at >= v_start;
  select count(*) into v_bets     from predict_bets    where user_id = v_user and created_at >= v_start;
  v_res := jsonb_build_array(
    jsonb_build_object('key','vote','icon','🗳️','title','찬반 투표 5회','goal',5,'reward',200,
      'progress', least(v_votes,5), 'raw', v_votes,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='vote' and claim_date=v_today)),
    jsonb_build_object('key','comment','icon','💬','title','참전 댓글 3개','goal',3,'reward',300,
      'progress', least(v_comments,3), 'raw', v_comments,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='comment' and claim_date=v_today)),
    jsonb_build_object('key','battle','icon','⚔️','title','전투 액션 3회(공격·방어·지원)','goal',3,'reward',300,
      'progress', least(v_battle,3), 'raw', v_battle,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='battle' and claim_date=v_today)),
    jsonb_build_object('key','predict','icon','🎯','title','갈라예측 베팅 1회','goal',1,'reward',300,
      'progress', least(v_bets,1), 'raw', v_bets,
      'claimed', exists(select 1 from mission_claims where user_id=v_user and mission_key='predict' and claim_date=v_today))
  );
  return jsonb_build_object('ok', true, 'missions', v_res, 'today', v_today);
end $$;

create or replace function public.claim_mission(p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_start timestamp := _kst_day_start();
  v_today date := _kst_today();
  v_goal int; v_reward int; v_cnt int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if    p_key = 'vote'    then v_goal := 5; v_reward := 200;
        select count(*) into v_cnt from votes where user_id=v_user and created_at >= v_start;
  elsif p_key = 'comment' then v_goal := 3; v_reward := 300;
        select count(*) into v_cnt from comments where user_id=v_user and created_at >= v_start;
  elsif p_key = 'battle'  then v_goal := 3; v_reward := 300;
        select count(*) into v_cnt from comment_actions where user_id=v_user and created_at >= v_start;
  elsif p_key = 'predict' then v_goal := 1; v_reward := 300;
        select count(*) into v_cnt from predict_bets where user_id=v_user and created_at >= v_start;
  else  return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;
  if v_cnt < v_goal then return jsonb_build_object('ok', false, 'reason', 'incomplete'); end if;
  insert into point_balances (user_id) values (v_user) on conflict (user_id) do nothing;
  begin
    insert into mission_claims (user_id, mission_key, claim_date, reward)
    values (v_user, p_key, v_today, v_reward);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already');
  end;
  update point_balances set balance = balance + v_reward, updated_at = now()
    where user_id = v_user returning balance into v_bal;
  insert into point_ledger (user_id, delta, reason) values (v_user, v_reward, 'mission:'||p_key);
  return jsonb_build_object('ok', true, 'reward', v_reward, 'balance', v_bal);
end $$;

/* ---------- ③ 이슈 연계: 마켓 ↔ 이슈 상호 링크 ---------- */
alter table markets add column if not exists issue_id bigint references issues(id) on delete set null;
create index if not exists idx_markets_issue on markets(issue_id) where issue_id is not null;

-- 봇: 핫이슈(진영 대결)에서 승패 예측 마켓 자동 생성 (이미 연계 마켓 있으면 skip)
create or replace function admin_create_issue_market()
returns jsonb language plpgsql security definer set search_path to public as $$
declare v_issue record; v_id bigint; v_q text; v_close timestamptz;
begin
  select i.* into v_issue from issues i
   where not exists (select 1 from markets m where m.issue_id = i.id and not m.resolved)
     and coalesce(i.pro_count,0)+coalesce(i.con_count,0) >= 2   -- 어느 정도 붙은 이슈만
   order by i.hot_score desc nulls last, i.created_at desc limit 1;
  if v_issue is null then return jsonb_build_object('ok',false,'reason','no_issue'); end if;
  v_q := left('🔥 이슈 승패: "' || v_issue.title || '" — ' || coalesce(v_issue.faction_a,'찬성') || ' 진영이 이길까?', 120);
  v_close := now() + interval '3 days';
  v_id := admin_create_market(v_q,
    '갈라 이슈의 진영 대결 결과를 예측합니다. 마감 시점 투표 수가 많은 진영이 승리로 정산됩니다.',
    '정치·사회', v_close);
  update markets set issue_id = v_issue.id where id = v_id;
  return jsonb_build_object('ok',true,'market_id',v_id,'issue_id',v_issue.id,'question',v_q);
end $$;
revoke all on function admin_create_issue_market() from public, anon, authenticated;

/* ---------- ④ 시즌제 ---------- */
create table if not exists predict_seasons (
  id bigserial primary key,
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  active boolean not null default true
);
alter table predict_seasons enable row level security;
drop policy if exists predict_seasons_read on predict_seasons;
create policy predict_seasons_read on predict_seasons for select using (true);

-- 시즌 1: 이번 달 (없을 때만)
insert into predict_seasons(name, starts_at, ends_at)
select '시즌 1', date_trunc('month', now()), date_trunc('month', now()) + interval '1 month'
where not exists (select 1 from predict_seasons where active);

-- 시즌 적중왕 (활성 시즌 기간의 predict:* 원장)
create or replace view predict_king_season as
select l.user_id, up.nickname, up.level, s.name as season,
  round(coalesce(sum(l.delta) filter (where l.reason like 'predict:%'),0)::numeric,0) as profit,
  count(*) filter (where l.reason='predict:bet') as trades,
  count(*) filter (where l.reason='predict:win') as wins
from point_ledger l
join predict_seasons s on s.active and l.created_at >= s.starts_at and l.created_at < s.ends_at
left join user_profiles up on up.user_id=l.user_id
where l.reason like 'predict:%'
group by l.user_id, up.nickname, up.level, s.name
having count(*) filter (where l.reason='predict:bet') > 0;

-- 크론: 매일 06:25 KST 핫이슈 승패 마켓 1개 (DB 함수 직접 호출)
-- select cron.schedule('predict_issue_market_job','25 21 * * *', $$select admin_create_issue_market();$$);
