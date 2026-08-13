-- =========================================================
-- 관제센터: 턴 계측 조회
--
-- ai_turn_stats 는 key/n 짝의 납작한 카운터다. 화면에서 쓰려면
-- '배수'와 '가드 헛방률'로 접어서 내려줘야 한다.
--
-- 보는 목적:
--   ① 턴당 LLM 콜 배수 — 고급 모델로 바꿀 때 원가에 그대로 곱해진다
--   ② 가드별 발동/헛방 — 헛방이 많은 가드가 곧 줄일 후보다
--   ③ 스트림 vs JSON 비율 — 수다(1콜)와 도구 턴(2콜+)의 구성
-- =========================================================

create or replace function public.admin_turn_stats(p_days integer default 7)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_from date := ((now() at time zone 'Asia/Seoul')::date - greatest(0, coalesce(p_days,7) - 1));
  v_json bigint; v_stream bigint; v_steps bigint; v_llm bigint;
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;

  select coalesce(sum(n) filter (where key = 'path:json'), 0),
         coalesce(sum(n) filter (where key = 'path:stream'), 0)
    into v_json, v_stream from ai_turn_stats where day >= v_from;

  -- steps:N / llm:N 은 값이 키에 박혀 있다 → 가중합
  select coalesce(sum(split_part(key, ':', 2)::int * n), 0) into v_steps
    from ai_turn_stats where day >= v_from and key like 'steps:%';
  select coalesce(sum(split_part(key, ':', 2)::int * n), 0) into v_llm
    from ai_turn_stats where day >= v_from and key like 'llm:%';

  return jsonb_build_object(
    'ok', true,
    'days', p_days,
    'turns_json',   v_json,
    'turns_stream', v_stream,
    'turns_total',  v_json + v_stream,
    -- 배수: 스트림은 1콜 고정이므로 전체 평균에 함께 넣어야 실제 비용 배수가 된다
    'llm_calls',    v_llm + v_stream,
    'per_turn',     case when (v_json + v_stream) > 0
                         then round(((v_llm + v_stream)::numeric) / (v_json + v_stream), 2) end,
    'per_turn_json',case when v_json > 0 then round(v_llm::numeric / v_json, 2) end,
    'steps_total',  v_steps,

    'steps', coalesce((select jsonb_agg(jsonb_build_object('n', split_part(key,':',2)::int, 'turns', n)
                                        order by split_part(key,':',2)::int)
                         from ai_turn_stats where day >= v_from and key like 'steps:%'), '[]'::jsonb),

    'brains', coalesce((select jsonb_agg(jsonb_build_object('brain', split_part(key,':',2), 'turns', n)
                                         order by n desc)
                          from ai_turn_stats where day >= v_from and key like 'brain:%'), '[]'::jsonb),

    -- 가드: 발동수 + hit/miss(헛방). fake_create 만 hit/miss 를 잰다.
    'guards', coalesce((
      select jsonb_agg(x order by (x->>'fired')::int desc) from (
        select jsonb_build_object(
                 'guard', g.key,
                 'fired', g.n,
                 'hit',   coalesce((select n from ai_turn_stats h
                                     where h.day >= v_from and h.key = g.key || ':hit'), null),
                 'miss',  coalesce((select n from ai_turn_stats m
                                     where m.day >= v_from and m.key = g.key || ':miss'), null))  as x
          from (select key, sum(n) n from ai_turn_stats
                 where day >= v_from and key like 'guard:%'
                   and key not like '%:hit' and key not like '%:miss'
                 group by key) g
      ) t), '[]'::jsonb),

    -- fake_create 가 무엇에 트리거됐나 (past=진짜 거짓말 / future=하겠다는 말 / state=상태 백스톱)
    'fc_by', coalesce((select jsonb_agg(jsonb_build_object('by', split_part(key,':',2), 'n', n) order by n desc)
                         from ai_turn_stats where day >= v_from and key like 'fc_by:%'), '[]'::jsonb),

    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'turns', d.turns, 'llm', d.llm) order by d.day)
        from (select day,
                     coalesce(sum(n) filter (where key in ('path:json','path:stream')), 0) turns,
                     coalesce(sum(split_part(key,':',2)::int * n) filter (where key like 'llm:%'), 0)
                     + coalesce(sum(n) filter (where key = 'path:stream'), 0) llm
                from ai_turn_stats where day >= v_from group by day) d), '[]'::jsonb)
  );
end $$;

grant execute on function public.admin_turn_stats(integer) to authenticated;
