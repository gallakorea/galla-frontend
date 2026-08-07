-- 🛡 AI 유저별 일일 쿼터 — 글로벌 캡(ai_budget_take)만 있어 한 명이 전체 예산을 태우면
--    모든 유저의 갈비스가 죽는 구조였다(2026-08-08 QA7). 유저별 상한을 두어 남용을 격리한다.

create table if not exists public.ai_user_usage (
  day date not null,
  fn text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  calls int not null default 0,
  primary key (day, fn, user_id)
);
alter table public.ai_user_usage enable row level security;
revoke all on public.ai_user_usage from public, anon, authenticated;

-- 기본 상한: 일반 대화는 넉넉히(정상 유저는 하루 수십 턴), 생성형은 타이트하게.
insert into app_settings (k, v, updated_at)
values ('ai_user_daily_caps', jsonb_build_object(
  '_default', 100,
  'galla-friend', 300,
  'galla-stt', 200,
  'galla-tts', 300,
  'generate-thumbnail', 30,
  'generate-video', 5,
  'generate-sticker', 30
), now())
on conflict (k) do update set v = excluded.v, updated_at = now();

create or replace function public.ai_user_take(p_fn text, p_uid uuid, p_n int default 1)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_caps jsonb; v_limit int; v_used int;
begin
  if p_fn is null or p_fn = '' or p_uid is null then
    return jsonb_build_object('ok', true);   -- 식별 불가 시 통과(글로벌 캡이 최후 방어)
  end if;
  p_n := greatest(coalesce(p_n, 1), 1);

  select v into v_caps from app_settings where k = 'ai_user_daily_caps';
  v_limit := coalesce((v_caps ->> p_fn)::int, (v_caps ->> '_default')::int, 100);
  if v_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'disabled');
  end if;

  insert into ai_user_usage (day, fn, user_id, calls) values (v_day, p_fn, p_uid, 0)
  on conflict (day, fn, user_id) do nothing;

  -- 행 잠금 — 동시 연타에도 천장을 넘지 않게
  select calls into v_used from ai_user_usage
   where day = v_day and fn = p_fn and user_id = p_uid for update;

  if v_used + p_n > v_limit then
    return jsonb_build_object('ok', false, 'reason', 'user_cap', 'limit', v_limit, 'used', v_used);
  end if;

  update ai_user_usage set calls = calls + p_n
   where day = v_day and fn = p_fn and user_id = p_uid;

  return jsonb_build_object('ok', true, 'used', v_used + p_n, 'limit', v_limit);
end $$;

revoke all on function public.ai_user_take(text, uuid, int) from public, anon, authenticated;

-- 30일 지난 사용량 정리(테이블 비대 방지)
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'ai_user_usage_purge';
exception when others then null;
end $$;
select cron.schedule('ai_user_usage_purge', '20 18 * * *',
  $$delete from ai_user_usage where day < (current_date - 30)$$);
