-- ⏰ 갈비스 시간 감각 — "예전 얘기를 '좀전에'라고 말해 흐름이 이상해짐"(사장님) 수정.
--   ① friend_relationship.session_meta: 세션 경계(45분+ 공백=새 세션) 추적 {started_at, prev_end_at, turns}
--      → 프롬프트가 "히스토리 중 마지막 N개만 지금 것, 그 앞은 어제 대화"를 알게 됨.
--   ② match_friend_memory에 created_at/happened_at 반환 추가 → 기억에 "(3일 전)" 나이 표기 가능.
alter table public.friend_relationship add column if not exists session_meta jsonb;

drop function if exists public.match_friend_memory(uuid, text, integer);
create or replace function public.match_friend_memory(p_user uuid, p_query text, p_k integer default 12)
returns table(id bigint, kind text, mkey text, content text, salience integer, sim double precision, created_at timestamptz, happened_at timestamptz)
language sql stable security definer set search_path = public as $$
  select id, kind, mkey, content, salience,
         1 - (embedding <=> p_query::vector) as sim,
         created_at, happened_at
  from friend_memory
  where user_id = p_user and status = 'active' and embedding is not null
  order by (embedding <=> p_query::vector)
           - least(coalesce(salience,3),5) * 0.02
           - (case when last_ref_at > now() - interval '10 days' then 0.05 else 0 end)
           - greatest(-3, least(3, coalesce(reward_ema,0))) * 0.03
  limit greatest(1, least(p_k, 30));
$$;
