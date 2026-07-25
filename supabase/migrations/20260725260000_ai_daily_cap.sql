-- AI 일일 상한 — 플랫폼 전체 AI 호출 예산을 하루 단위로 강제한다.
-- 왜: 크론(뉴스·예측·광장 생성)과 유저 트리거(일기토 심판·스티커)가 겹치면
--     API 비용이 예고 없이 튄다. generate-sticker의 유저별 상한과 별개로,
--     "플랫폼 전체가 하루에 쓸 수 있는 AI 호출 수" 천장을 하나 둔다.
-- 한도는 app_settings.ai_daily_caps(jsonb)로 코드 배포 없이 조정.

create table if not exists ai_budget_usage (
  day    date not null default (now() at time zone 'Asia/Seoul')::date,
  fn     text not null,
  calls  int  not null default 0,
  primary key (day, fn)
);

alter table ai_budget_usage enable row level security;
-- 서비스 롤(엣지 함수)만 씀. 관리자 조회는 admin RPC로.
revoke all on ai_budget_usage from anon, authenticated;

insert into app_settings (k, v)
values ('ai_daily_caps', jsonb_build_object(
  'generate-galla-news',      40,
  'generate-predict-markets', 15,
  'generate-community-plaza', 25,
  'duel-ai-judge',           300,
  'generate-sticker',        400,
  'predict-auto-resolve',    150,
  '_default',                100
))
on conflict (k) do nothing;

-- 예산에서 p_n건을 당긴다. 한도를 넘으면 ok=false이며 카운터는 올리지 않는다.
create or replace function ai_budget_take(p_fn text, p_n int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day   date := (now() at time zone 'Asia/Seoul')::date;
  v_caps  jsonb;
  v_limit int;
  v_used  int;
begin
  if p_fn is null or p_fn = '' then
    return jsonb_build_object('ok', false, 'reason', 'no_fn');
  end if;
  p_n := greatest(coalesce(p_n, 1), 1);

  select v into v_caps from app_settings where k = 'ai_daily_caps';
  v_limit := coalesce(
    (v_caps ->> p_fn)::int,
    (v_caps ->> '_default')::int,
    100
  );

  -- 0 이하면 해당 기능 잠금
  if v_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'disabled', 'limit', v_limit);
  end if;

  insert into ai_budget_usage (day, fn, calls) values (v_day, p_fn, 0)
  on conflict (day, fn) do nothing;

  -- 행 잠금으로 동시 호출에도 천장을 넘지 않게
  select calls into v_used from ai_budget_usage
   where day = v_day and fn = p_fn for update;

  if v_used + p_n > v_limit then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap',
                              'used', v_used, 'limit', v_limit);
  end if;

  update ai_budget_usage set calls = calls + p_n
   where day = v_day and fn = p_fn
   returning calls into v_used;

  return jsonb_build_object('ok', true, 'used', v_used, 'limit', v_limit,
                            'remaining', v_limit - v_used);
end $$;

revoke all on function ai_budget_take(text, int) from anon, authenticated;

-- 관제센터용: 오늘/최근 소비 현황
create or replace function admin_ai_budget(p_days int default 7)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_caps jsonb; v_rows jsonb;
begin
  if not exists (select 1 from users where id = auth.uid() and coalesce(admin_flag, false)) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;
  select v into v_caps from app_settings where k = 'ai_daily_caps';
  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'fn', fn, 'calls', calls)
                            order by day desc, calls desc), '[]'::jsonb)
    into v_rows
    from ai_budget_usage
   where day >= (now() at time zone 'Asia/Seoul')::date - greatest(coalesce(p_days,7),1);
  return jsonb_build_object('ok', true, 'caps', v_caps, 'usage', v_rows);
end $$;

grant execute on function admin_ai_budget(int) to authenticated;
