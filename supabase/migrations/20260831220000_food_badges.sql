-- 맛집 업적 (2026-08-31)
--
-- ⚠️ 배지에 GP 를 기본으로 걸지 않는다(reward_gp 기본 0).
--    도장·판정·찜은 전부 **자기신고**라 버튼만 누르면 올라간다. 화폐를 붙이면 그대로
--    파밍이 된다(공유 미션에서 얻은 교훈: 자기신고 = 보상 최저치, 또는 0).
--    보상은 '내 프로필에 박히는 명예'다. 정책을 코드가 아니라 데이터에 뒀으니
--    나중에 켜고 싶으면 배포 없이 reward_gp 만 올리면 된다.

create table if not exists public.food_badge_defs (
  code       text primary key,
  name       text not null,
  hint       text not null,
  icon       text not null,
  metric     text not null check (metric in ('visit','save','submit','judge','comment','channel_clear')),
  target     int  not null check (target > 0),
  reward_gp  int  not null default 0,
  sort       int  not null default 0
);

create table if not exists public.food_badge_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  code       text not null references public.food_badge_defs(code) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.food_badge_defs   enable row level security;
alter table public.food_badge_claims enable row level security;

insert into public.food_badge_defs (code, name, hint, icon, metric, target, sort) values
  ('first_stamp', '첫 도장',     '맛집 한 곳에 다녀오기',        '👟', 'visit',   1,  10),
  ('walker',      '동네 탐험가', '열 곳 도장 찍기',              '🗺',  'visit',   10, 20),
  ('pilgrim',     '미식 순례자', '쉰 곳 도장 찍기',              '🏅', 'visit',   50, 30),
  ('wisher',      '찜쟁이',      '가고 싶은 곳 다섯 곳 찜하기',  '⭐', 'save',    5,  40),
  ('pioneer',     '개척자',      '아무도 모르는 집 하나 제보하기','🧭', 'submit',  1,  50),
  ('recorder',    '기록가',      '다섯 곳 제보하기',             '✍️', 'submit',  5,  60),
  -- 여기부터가 갈라 고유 — 저쪽엔 없는 축이다. 갈라는 구경이 아니라 싸움이 본체다.
  ('first_call',  '첫 판정',     '맛있다 · 맛없다 한 번 던지기', '⚖️', 'judge',   1,  70),
  ('judge',       '판정관',      '스무 곳 판정하기',             '⚔️', 'judge',   20, 80),
  ('debater',     '논객',        '열 곳에 한마디 남기기',        '🗣',  'comment', 10, 90),
  ('conqueror',   '방송 정복',   '한 방송에 나온 집을 전부 가기','👑', 'channel_clear', 1, 100)
on conflict (code) do nothing;

/* 내 진행도 — 한 번의 호출로 화면 전체를 그린다.
   channel_clear 는 '어떤 채널이든 전부 방문한 게 하나라도 있나'로 본다.
   진행도는 가장 많이 정복한 채널 기준(가장 가까운 목표를 보여줘야 동기가 생긴다). */
create or replace function public.food_badges()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  m as (
    select
      (select count(*) from food_visits   where user_id = (select u from me)) visit,
      (select count(*) from food_saves    where user_id = (select u from me)) save,
      (select count(*) from food_places   where submitted_by = (select u from me)) submit,
      (select count(*) from food_votes    where user_id = (select u from me)) judge,
      (select count(distinct place_id) from food_comments
        where user_id = (select u from me) and status='live') comment,
      -- 채널별 (내 방문 / 전체) 중 최대 달성률. 1.0 이면 한 방송을 정복한 것이다.
      coalesce((select max(case when t.total > 0 then t.mine::numeric / t.total else 0 end)
                  from (select fs.channel,
                               count(distinct p.id) total,
                               count(distinct p.id) filter (where exists (
                                 select 1 from food_visits v
                                  where v.place_id = p.id and v.user_id = (select u from me))) mine
                          from food_place_sources fs
                          join food_places p on p.id = fs.place_id and p.status='live'
                         group by fs.channel) t), 0) clear_ratio
  )
  select jsonb_build_object('ok', true,
    'total', (select count(*) from food_badge_defs),
    'got',   (select count(*) from food_badge_defs d, m
               where case d.metric
                       when 'visit' then m.visit when 'save' then m.save
                       when 'submit' then m.submit when 'judge' then m.judge
                       when 'comment' then m.comment
                       else floor(m.clear_ratio)::bigint end >= d.target),
    'badges', coalesce((select jsonb_agg(jsonb_build_object(
        'code', d.code, 'name', d.name, 'hint', d.hint, 'icon', d.icon,
        'target', d.target, 'reward_gp', d.reward_gp,
        'have', least(cur.n, d.target),
        'done', cur.n >= d.target,
        'claimed', exists (select 1 from food_badge_claims c
                            where c.code = d.code and c.user_id = (select u from me))
      ) order by d.sort)
      from food_badge_defs d, m,
      lateral (select case d.metric
                        when 'visit' then m.visit when 'save' then m.save
                        when 'submit' then m.submit when 'judge' then m.judge
                        when 'comment' then m.comment
                        else floor(m.clear_ratio)::bigint end n) cur), '[]'::jsonb));
$fn$;
grant execute on function public.food_badges() to anon, authenticated;

/* 수령 — reward_gp 가 0 이면 배지만 기록하고 GP 는 건드리지 않는다. */
create or replace function public.food_badge_claim(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_def record; v_have bigint; v_bal double precision;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  select * into v_def from food_badge_defs where code = p_code;
  if not found then return jsonb_build_object('ok',false,'reason','no_badge'); end if;
  if exists (select 1 from food_badge_claims where user_id=v_uid and code=p_code) then
    return jsonb_build_object('ok',true,'already',true); end if;

  select case v_def.metric
    when 'visit'   then (select count(*) from food_visits where user_id=v_uid)
    when 'save'    then (select count(*) from food_saves  where user_id=v_uid)
    when 'submit'  then (select count(*) from food_places where submitted_by=v_uid)
    when 'judge'   then (select count(*) from food_votes  where user_id=v_uid)
    when 'comment' then (select count(distinct place_id) from food_comments
                          where user_id=v_uid and status='live')
    else coalesce((select floor(max(case when t.total>0 then t.mine::numeric/t.total else 0 end))
                     from (select fs.channel, count(distinct p.id) total,
                                  count(distinct p.id) filter (where exists (
                                    select 1 from food_visits v
                                     where v.place_id=p.id and v.user_id=v_uid)) mine
                             from food_place_sources fs
                             join food_places p on p.id=fs.place_id and p.status='live'
                            group by fs.channel) t), 0)::bigint
  end into v_have;

  if v_have < v_def.target then
    return jsonb_build_object('ok',false,'reason','not_yet','have',v_have,'target',v_def.target); end if;

  insert into food_badge_claims(user_id, code) values (v_uid, p_code);

  if v_def.reward_gp > 0 then
    insert into point_balances(user_id) values (v_uid) on conflict (user_id) do nothing;
    update point_balances set balance = balance + v_def.reward_gp, updated_at = now()
     where user_id = v_uid;
    insert into point_ledger(user_id, delta, reason)
    values (v_uid, v_def.reward_gp, 'food_badge_' || p_code);
    select balance + paid_balance into v_bal from point_balances where user_id = v_uid;
  end if;

  return jsonb_build_object('ok',true,'already',false,'name',v_def.name,
                            'amount', v_def.reward_gp, 'balance', round(coalesce(v_bal,0)));
end $fn$;
grant execute on function public.food_badge_claim(text) to authenticated;

select jsonb_array_length(food_badges()->'badges') as badges;
