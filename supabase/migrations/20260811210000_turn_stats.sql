-- =========================================================
-- 턴 계측 — 가드 재시도 배수를 '추측 말고 측정'하기 위한 카운터
--
-- 갈비스 한 턴은 내부적으로 여러 번 LLM을 부른다:
--   스트림 경로(수다) = 1콜
--   JSON 경로(도구 필요) = 메인 루프 최대 4스텝 + 가드 6종이 각 1~2콜
-- 실측: 유저 3턴 → 내부 7콜(턴당 2.3). 유료회원에 고급 모델을 붙이면
-- 이 배수가 그대로 원가에 곱해진다.
--
-- 어느 가드가 실제로 터지는지 모르면 엉뚱한 걸 줄이게 된다. 그래서 먼저 센다.
-- 키만 세는 아주 가벼운 카운터다(개인정보·본문 없음).
-- =========================================================

create table if not exists public.ai_turn_stats (
  day  date   not null default (now() at time zone 'Asia/Seoul')::date,
  key  text   not null,
  n    bigint not null default 0,
  primary key (day, key)
);
alter table public.ai_turn_stats enable row level security;
drop policy if exists ai_turn_stats_admin on public.ai_turn_stats;
create policy ai_turn_stats_admin on public.ai_turn_stats for select using (_is_admin());

comment on table public.ai_turn_stats is
  '턴 단위 계측 카운터. key 예: path:stream / path:json / brain:agent / steps:2 / guard:fake_create. 가드 재시도 배수를 측정해 줄일 근거를 만든다.';

create or replace function public.ai_turn_stat_add(p_keys text[])
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_day date := (now() at time zone 'Asia/Seoul')::date; k text;
begin
  if p_keys is null then return; end if;
  foreach k in array p_keys loop
    k := left(btrim(k), 60);
    if k = '' then continue; end if;
    insert into ai_turn_stats(day, key, n) values (v_day, k, 1)
    on conflict (day, key) do update set n = ai_turn_stats.n + 1;
  end loop;
end $$;
revoke execute on function public.ai_turn_stat_add(text[]) from anon, authenticated, public;
grant  execute on function public.ai_turn_stat_add(text[]) to service_role;
