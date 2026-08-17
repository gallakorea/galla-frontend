-- ============================================================
-- 공유 미션 어뷰징 차단 — "눌렀다"가 아니라 "실제로 닿았다"만 인정
--
-- 기존(20260817100000): share_events row 개수 = 미션 진행 → 시트 버튼만 눌러도 150 GP.
-- 사장님 지시("단순 공유로 포인트 주지 말고, 여러 방면으로 고도화").
--
-- 인정 조건 2가지(합산):
--   ① 외부 공유 링크를 **다른 기기가 실제로 열었을 때** (토큰 + 기기지문 중복제거)
--   ② 갈라 친구에게 보낸 공유 카드를 **상대가 읽었을 때** (dm_messages.kind='share' + read_at)
--
-- ⚠️ 부계정 farming은 어떤 방식으로도 완전히 못 막는다. 목표는 '한 번 탭으로 공짜 GP'를
--    없애고, 굳이 하려면 150 GP보다 품이 더 들게 만드는 것.
-- ============================================================

-- ── 1. 공유 링크에 토큰 부여 ─────────────────────────────────
alter table public.share_events add column if not exists token text;
create unique index if not exists share_events_token_idx
  on public.share_events (token) where token is not null;

-- ── 2. 클릭 기록 ─────────────────────────────────────────────
-- fp_hash = 엣지에서 만든 (솔트+IP+UA) 해시. 원본 IP는 저장하지 않는다.
create table if not exists public.share_clicks (
  id             bigserial primary key,
  share_event_id bigint not null references public.share_events(id) on delete cascade,
  fp_hash        text   not null,
  created_at     timestamptz not null default now(),
  unique (share_event_id, fp_hash)          -- 같은 기기가 같은 링크를 여러 번 눌러도 1회
);
create index if not exists share_clicks_created_idx on public.share_clicks (created_at desc);

-- 정책을 하나도 만들지 않는다 = 클라이언트 직접 접근 전면 차단.
-- 읽기·쓰기는 아래 SECURITY DEFINER 함수만 통한다.
alter table public.share_clicks enable row level security;

-- ── 3. log_share — 토큰을 발급해 돌려준다 ────────────────────
create or replace function public.log_share(p_kind text default 'link', p_target text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid := auth.uid();
  n   int;
  tok text;
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

  -- pgcrypto 의존 없이 충분히 넓은 토큰(12 hex). 충돌 시 유니크 인덱스가 잡고 재시도.
  for i in 1..5 loop
    tok := substr(md5(random()::text || clock_timestamp()::text || uid::text), 1, 12);
    begin
      insert into share_events (user_id, kind, target, token)
      values (uid, coalesce(nullif(p_kind, ''), 'link'), left(coalesce(p_target, ''), 200), tok);
      return jsonb_build_object('ok', true, 'token', tok, 'today', n + 1);
    exception when unique_violation then
      tok := null;   -- 다음 루프에서 재발급
    end;
  end loop;

  return jsonb_build_object('ok', false, 'error', 'token');
end $$;

revoke all on function public.log_share(text, text) from public, anon;
grant execute on function public.log_share(text, text) to authenticated;

-- ── 4. 클릭 기록 RPC — 비로그인 방문자도 불러야 하므로 anon 허용 ──
create or replace function public.record_share_click(p_token text, p_fp text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare ev record;
begin
  if p_token is null or p_fp is null or length(p_fp) < 16 then
    return jsonb_build_object('ok', false, 'reason', 'bad');
  end if;

  select id, user_id, created_at into ev from share_events where token = p_token;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'token');
  end if;

  -- 자기 클릭 방지 ① : 공유 직후 20초 안의 클릭은 본인이 눌러본 것으로 본다
  if now() - ev.created_at < interval '20 seconds' then
    return jsonb_build_object('ok', false, 'reason', 'toofast');
  end if;

  -- 자기 클릭 방지 ② : 같은 기기가 오늘 이 유저의 링크를 이미 열었으면 더 안 쳐준다
  --                  (친구 한 명이 내 링크 5개를 눌러도 1회)
  if exists (
    select 1 from share_clicks c
      join share_events e on e.id = c.share_event_id
     where e.user_id = ev.user_id
       and c.fp_hash = p_fp
       and c.created_at >= _kst_day_start()
  ) then
    return jsonb_build_object('ok', true, 'dup', true);
  end if;

  insert into share_clicks (share_event_id, fp_hash)
  values (ev.id, p_fp)
  on conflict do nothing;

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.record_share_click(text, text) from public;
grant execute on function public.record_share_click(text, text) to anon, authenticated;

-- ── 5. 검증된 도달 수 ────────────────────────────────────────
create or replace function public._share_verified_count(p_user uuid, p_since timestamp without time zone)
returns integer
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare c_click int; c_dm int;
begin
  -- ① 외부 링크를 실제로 연 기기 수(기기 중복 제거)
  select count(distinct c.fp_hash) into c_click
    from share_clicks c
    join share_events e on e.id = c.share_event_id
   where e.user_id = p_user
     and c.created_at >= p_since;

  -- ② 갈라 친구가 내 공유 카드를 읽은 수(상대 스레드별 1회, 자기 자신 스레드 제외)
  select count(distinct t.id) into c_dm
    from dm_messages m
    join dm_threads t on t.id = m.thread_id
   where m.sender_id = p_user
     and m.kind = 'share'
     and m.read_at is not null
     and m.created_at >= p_since
     and t.user_lo <> t.user_hi;

  return coalesce(c_click, 0) + coalesce(c_dm, 0);
end $$;

-- ── 6. 미션 카운트 — share 는 이제 '검증된 도달'만 센다 ──────
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
    -- ⚠️ share_events(=공유 버튼 누름) 개수가 아니다. 실제로 닿은 것만 센다.
    when 'share'        then n := _share_verified_count(p_user, p_since);
    when 'vote_comment' then select (select count(*) from votes    where user_id=p_user and created_at>=p_since)
                                  + (select count(*) from comments where user_id=p_user and created_at>=p_since) into n;
    else n := 0;
  end case;
  return coalesce(n,0);
end $$;

-- ── 7. 미션 문구 — 즉시 달성이 아니라는 걸 제목에서 알린다 ───
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
      {"key":"share","action":"share","icon":"📣","title":"내가 보낸 갈라 링크를 친구가 열기","goal":1,"reward":150}
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
