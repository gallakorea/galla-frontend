-- ============================================================
-- 데일리 미션 '친구에게 공유하기' + 공유 기록 테이블
--
-- 배경: 공유(GALLA_share)는 지금까지 순수 클라이언트 동작이라 서버에 아무 기록이
--       남지 않았다. _mission_count 는 액션마다 테이블을 세는 구조라, 기록할 자리가
--       없으면 미션을 붙일 수가 없다. 그래서 share_events 를 먼저 만든다.
--
-- ⚠️ 한계(설계상 불가피): 공유는 '전송 완료'를 검증할 수 없다. 시트에서 버튼만 눌러도
--    카운트된다. 그래서 보상을 데일리 최저치(150 GP, DM 미션과 동급)로 두고, 진짜 성과
--    보상은 기존 초대 전환(+1,000 GP, apply_referral)에 그대로 남긴다.
--    미션은 '습관을 만드는 넛지', 초대 보상은 '성과 보상' 역할 분리.
-- ============================================================

-- ── 1. 공유 기록 ──────────────────────────────────────────────
create table if not exists public.share_events (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null default 'link',   -- match | trend | issue | predict | plaza | ...
  target      text,                           -- 공유한 URL(진단·채널 분석용, 200자 컷)
  created_at  timestamptz not null default now()
);

create index if not exists share_events_user_created_idx
  on public.share_events (user_id, created_at desc);

alter table public.share_events enable row level security;

-- 본인 것만 읽고 쓴다(집계는 SECURITY DEFINER인 _mission_count가 한다)
drop policy if exists share_events_own_select on public.share_events;
create policy share_events_own_select on public.share_events
  for select using (auth.uid() = user_id);

drop policy if exists share_events_own_insert on public.share_events;
create policy share_events_own_insert on public.share_events
  for insert with check (auth.uid() = user_id);

-- ── 2. 기록 RPC ───────────────────────────────────────────────
-- 하루 20건에서 끊는다. 미션은 1건이면 충분하고, 그 위는 테이블 스팸일 뿐이다.
-- 실패해도 공유 자체는 이미 끝난 뒤라 절대 예외를 던지지 않는다(클라가 무시할 수 있게).
create or replace function public.log_share(p_kind text default 'link', p_target text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  n   int;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;

  select count(*) into n
    from share_events
   where user_id = uid
     and created_at >= _kst_day_start();

  if n >= 20 then
    return jsonb_build_object('ok', true, 'capped', true, 'today', n);
  end if;

  insert into share_events (user_id, kind, target)
  values (uid, coalesce(nullif(p_kind, ''), 'link'), left(coalesce(p_target, ''), 200));

  return jsonb_build_object('ok', true, 'today', n + 1);
end $$;

revoke all on function public.log_share(text, text) from public, anon;
grant execute on function public.log_share(text, text) to authenticated;

-- ── 3. 미션 카운트에 share 액션 추가 ──────────────────────────
create or replace function public._mission_count(p_user uuid, p_action text, p_since timestamp without time zone)
returns integer
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare n int;
begin
  case p_action
    when 'vote'         then select count(*) into n from votes           where user_id=p_user  and created_at>=p_since;
    when 'comment'      then select count(*) into n from comments        where user_id=p_user  and created_at>=p_since;
    when 'battle'       then select count(*) into n from comment_actions where user_id=p_user  and created_at>=p_since;
    when 'predict'      then select count(*) into n from predict_bets    where user_id=p_user  and created_at>=p_since;
    when 'plaza'        then select count(*) into n from plaza_posts     where user_id=p_user  and created_at>=p_since;
    when 'dm'           then select count(*) into n from dm_messages     where sender_id=p_user and created_at>=p_since;
    when 'bookmark'     then select count(*) into n from bookmarks       where user_id=p_user  and created_at>=p_since;
    when 'plaza_comment'then select count(*) into n from plaza_comments  where user_id=p_user  and created_at>=p_since;
    when 'share'        then select count(*) into n from share_events    where user_id=p_user  and created_at>=p_since;
    when 'vote_comment' then select (select count(*) from votes    where user_id=p_user and created_at>=p_since)
                                  + (select count(*) from comments where user_id=p_user and created_at>=p_since) into n;
    else n := 0;
  end case;
  return coalesce(n,0);
end $$;

-- ── 4. 일간 미션 정의에 추가 ─────────────────────────────────
-- 일간 총 보상 1,500 → 1,650 GP. 보상 조정은 이 한 곳만 고치면 된다.
create or replace function public._mission_defs(p_scope text)
returns jsonb
language sql
immutable
as $$
  select case p_scope
    when 'daily' then '[
      {"key":"vote","action":"vote","icon":"🚩","title":"진영 투표 5회","goal":5,"reward":200},
      {"key":"comment","action":"comment","icon":"💬","title":"참전 댓글 3개","goal":3,"reward":300},
      {"key":"battle","action":"battle","icon":"⚔️","title":"전투 액션 3회(공격·방어·지원)","goal":3,"reward":300},
      {"key":"predict","action":"predict","icon":"🎯","title":"갈라예측 베팅 1회","goal":1,"reward":300},
      {"key":"plaza","action":"plaza","icon":"📝","title":"광장에 글 1개 쓰기","goal":1,"reward":250},
      {"key":"dm","action":"dm","icon":"✉️","title":"친구와 DM 나누기","goal":1,"reward":150},
      {"key":"share","action":"share","icon":"📣","title":"친구에게 갈라 공유하기","goal":1,"reward":150}
    ]'::jsonb
    when 'weekly' then '[
      {"key":"w_vote","action":"vote","icon":"🚩","title":"주간 진영 투표 25회","goal":25,"reward":600},
      {"key":"w_comment","action":"comment","icon":"💬","title":"주간 참전 댓글 20개","goal":20,"reward":800},
      {"key":"w_battle","action":"battle","icon":"⚔️","title":"주간 전투 액션 20회","goal":20,"reward":800},
      {"key":"w_predict","action":"predict","icon":"🎯","title":"주간 예측 베팅 5회","goal":5,"reward":1000},
      {"key":"w_plaza","action":"plaza","icon":"📝","title":"주간 광장 글 5개","goal":5,"reward":900}
    ]'::jsonb
    when 'special' then '[
      {"key":"special","action":"vote_comment","icon":"🔥","title":"이번 주 핫이슈 임무 — 투표+댓글 5회 참여","goal":5,"reward":80}
    ]'::jsonb
    else '[]'::jsonb
  end;
$$;
