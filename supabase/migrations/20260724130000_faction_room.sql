-- ═══════════════════════════════════════════════════════════════
-- 진영 난장 — 댓글배틀(같은 편) → 난장 파이프라인
--
-- 의도(사장님): 같은 진영끼리는 댓글 위 진영채팅을 넘어 '난장 판'으로 키워준다.
--   반대 진영과 한 방에 몰아넣는 유도는 금지 — 그건 개싸움만 된다.
--   → 이슈×진영마다 전용 난장(kind='faction'). 아군만 입장 가능(투표=진영 서버검증).
--
-- 보안 설계(기존 RLS 그대로 재사용, 추가 정책 0개):
--   · open_rooms_read = (kind='open' or is_room_member) → faction 방은 멤버만 열람(목록 유출X)
--   · 공개 난장 목록 쿼리는 .eq('kind','open') → faction 방은 애초에 안 뜸
--   · open_members_join = (self and kind='open') or is_room_member → faction 방은 self-join 불가
--       ⇒ 입장 유일 경로 = 아래 issue_faction_room RPC(SECURITY DEFINER, 투표 검증). 적군 원천봉쇄.
-- ═══════════════════════════════════════════════════════════════

alter table public.open_rooms add column if not exists issue_id bigint references public.issues(id) on delete cascade;
alter table public.open_rooms add column if not exists faction text check (faction in ('pro','con'));

-- kind 화이트리스트에 'faction' 추가
alter table public.open_rooms drop constraint if exists open_rooms_kind_chk;
alter table public.open_rooms add constraint open_rooms_kind_chk check (kind in ('open','group','faction'));

-- 이슈×진영당 방 하나(find-or-create 원자성)
create unique index if not exists uq_faction_room on public.open_rooms(issue_id, faction)
  where kind = 'faction';

-- ── 진영 난장 입장(없으면 생성) — 아군만. 반환: room_id ──
create or replace function public.issue_faction_room(p_issue bigint)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_side text;
  rid uuid;
  iss record;
  flabel text;
  rtitle text;
begin
  if me is null then raise exception 'auth required'; end if;

  -- 내 진영 = 이 이슈에 대한 내 투표. 없으면 참전 불가(적군·미투표 차단).
  select type into my_side from public.votes where issue_id = p_issue and user_id = me;
  if my_side is null or my_side not in ('pro','con') then
    raise exception 'no_vote';   -- 프론트에서 "먼저 투표" 안내
  end if;

  -- 기존 방 있으면 그걸로
  select id into rid from public.open_rooms
    where issue_id = p_issue and faction = my_side and kind = 'faction' limit 1;

  if rid is null then
    select id, title, faction_a, faction_b into iss from public.issues where id = p_issue;
    if iss.id is null then raise exception 'no_issue'; end if;
    flabel := case when my_side = 'pro' then coalesce(nullif(btrim(iss.faction_a), ''), '찬성')
                   else coalesce(nullif(btrim(iss.faction_b), ''), '반대') end;
    -- 제목 30자 제약 — 이슈 제목 축약 + 진영 라벨
    rtitle := left('🔥 ' || left(coalesce(iss.title, '이슈'), 14) || ' · ' || left(flabel, 6) || ' 난장', 30);
    insert into public.open_rooms(owner_id, title, topic, kind, issue_id, faction)
      values (me, rtitle, '같은 편끼리 작전 짜는 난장', 'faction', p_issue, my_side)
      on conflict (issue_id, faction) where kind = 'faction'
      do update set title = open_rooms.title      -- 경합 시 기존 행 반환용 no-op
      returning id into rid;
  end if;

  -- 멤버 등록(멱등) — 트리거가 member_count 갱신
  insert into public.open_room_members(room_id, user_id) values (rid, me)
    on conflict (room_id, user_id) do nothing;

  return rid;
end $$;
grant execute on function public.issue_faction_room(bigint) to authenticated;

-- 프론트 진입 노출용: 이 이슈의 내 진영 난장이 이미 있나 + 인원(있으면 '난장 N명 참전 중' 배지)
create or replace function public.issue_faction_room_peek(p_issue bigint)
returns table(room_id uuid, member_count int, my_side text)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); side text;
begin
  if me is null then return; end if;
  select type into side from public.votes where issue_id = p_issue and user_id = me;
  if side is null then return; end if;
  return query
    select r.id, r.member_count, side
    from public.open_rooms r
    where r.issue_id = p_issue and r.faction = side and r.kind = 'faction'
    limit 1;
end $$;
grant execute on function public.issue_faction_room_peek(bigint) to authenticated;
