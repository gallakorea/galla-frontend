-- 🧠🏆 갈비스 메모리 고도화 — 행동 기반 + 보상 연동 (2026-08-07)
--   문제: salience(기억 중요도)가 ①추출 LLM 추측 ②회상 횟수로만 움직임 → "그 기억을 꺼냈더니
--         대화가 실제로 잘 풀렸나?"(실사용 행동)는 전혀 반영 안 됨. 어제 보상신호(sft reward)는
--         sft_samples에만 쌓이고 메모리로 안 돌아옴.
--   해결: 턴 N에 주입한 기억집합을 friend_relationship.last_mem_ids에 기록 → 턴 N+1 유저 반응(행동)으로
--         각 기억의 reward_ema(효과성 지수) 갱신 → 랭킹/크론이 이를 반영(잘 먹히면 승격, 죽쑤면 강등).
--   원칙: salience=사실의 중요도, reward_ema=꺼냈을 때의 효과성. 랭킹이 둘을 블렌딩. 추가 LLM 호출 0.

-- 1) 기억별 효과성 지수(EMA) + 사용횟수
alter table public.friend_memory add column if not exists reward_ema real default 0;      -- 행동 보상 EMA(-5..+5)
alter table public.friend_memory add column if not exists use_count int default 0;        -- 주입(사용)된 턴 수 = 신뢰도 분모
alter table public.friend_memory add column if not exists last_reward_at timestamptz;     -- 마지막 보상 시각(효과성 신선도)

-- 2) 직전 턴에 어떤 기억을 주입했는지(크레딧 배분 대상). 다음 턴 유저 반응으로 이 집합을 신용/문책.
alter table public.friend_relationship add column if not exists last_mem_ids bigint[] default '{}';

-- 3) 보상 반영 RPC — 엣지가 유저 반응(±)으로 주입했던 기억들의 EMA 갱신(백그라운드 호출).
--    EMA = 0.8*이전 + 0.2*이번보상. 관성 있게 움직이고 튀는 반응 하나에 과반응 안 함.
create or replace function public.reward_friend_memory(p_user uuid, p_ids bigint[], p_reward numeric)
returns void language sql security definer set search_path = public as $$
  update friend_memory
  set reward_ema = greatest(-5, least(5, coalesce(reward_ema,0) * 0.8 + p_reward * 0.2)),
      use_count = coalesce(use_count,0) + 1,
      last_reward_at = now()
  where user_id = p_user and id = any(p_ids) and status = 'active';
$$;
revoke all on function public.reward_friend_memory(uuid, bigint[], numeric) from anon, authenticated;

-- 4) 하이브리드 검색에 효과성(reward_ema) 항 추가 — 잘 먹히는 기억은 위로, 죽쑤는 건 아래로.
--    salience 항(0.02)과 비슷한 크기(0.03*±3=±0.09)라 '중요도'와 '효과성'이 대등하게 블렌딩.
create or replace function public.match_friend_memory(p_user uuid, p_query text, p_k integer default 12)
returns table(id bigint, kind text, mkey text, content text, salience integer, sim double precision)
language sql stable security definer set search_path = public as $$
  select id, kind, mkey, content, salience,
         1 - (embedding <=> p_query::vector) as sim
  from friend_memory
  where user_id = p_user and status = 'active' and embedding is not null
  order by (embedding <=> p_query::vector)
           - least(coalesce(salience,3),5) * 0.02
           - (case when last_ref_at > now() - interval '10 days' then 0.05 else 0 end)
           - greatest(-3, least(3, coalesce(reward_ema,0))) * 0.03   -- 🏆 효과성 반영
  limit greatest(1, least(p_k, 30));
$$;

-- 5) 자동정리 크론에 보상 연동 3종 추가 — (a)지속 성과=승격 (b)지속 저조=강등 (c)효과성 시간감쇠.
create or replace function public.friend_memory_maintain()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 1) 감쇠: 30일 이상 안 떠오른 기억 중요도↓
  update friend_memory set salience = greatest(1, salience - 1)
  where status='active' and salience > 1
    and coalesce(last_ref_at, created_at) < now() - interval '30 days';
  -- 2) 보관: 낮은 중요도+오래됨 → 검색 제외(삭제 아님, 코어성은 보존)
  update friend_memory set status='archived'
  where status='active' and salience <= 1
    and coalesce(last_ref_at, created_at) < now() - interval '75 days'
    and kind not in ('profile','stance','person','disliked');
  -- 3) 의미 통합: 유저 내 근접중복(cos>0.90) → 낮은 salience 쪽 superseded
  with pairs as (
    select a.id ka_id, b.id kb_id, a.salience ka_s, b.salience kb_s
    from friend_memory a
    join friend_memory b
      on a.user_id=b.user_id and a.id<b.id
     and a.status='active' and b.status='active'
     and a.embedding is not null and b.embedding is not null
     and (1 - (a.embedding <=> b.embedding)) > 0.90
  )
  update friend_memory m set status='superseded'
  where m.id in (select case when ka_s >= kb_s then kb_id else ka_id end from pairs);
  -- 🏆 4) 보상 연동 — 충분히 써봤고(use_count>=3) 꾸준히 잘 먹히면 승격, 계속 죽쑤면 강등.
  update friend_memory set salience = least(5, salience + 1)
  where status='active' and salience < 5 and use_count >= 3 and reward_ema >= 2;
  update friend_memory set salience = greatest(1, salience - 1)
  where status='active' and salience > 1 and use_count >= 3 and reward_ema <= -2
    and kind not in ('profile','stance','person');   -- 핵심 정체성은 효과성으로 강등 안 함(중요도≠인기)
  -- 🏆 5) 효과성 신선도 — 30일 반응 없으면 EMA 절반으로(옛 성과가 영원히 밀어올리지 않게)
  update friend_memory set reward_ema = reward_ema * 0.5
  where status='active' and reward_ema <> 0
    and coalesce(last_reward_at, created_at) < now() - interval '30 days';
end $$;
