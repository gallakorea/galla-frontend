-- 🔗 라이브 난장 ↔ 콘텐츠 파이프라인 — 이슈/예측/광장에서 라이브 열기·입장
-- open_rooms에 링크(link_type/link_id) 추가. 콘텐츠별로 진행중 라이브 1개를 찾아 재입장.
alter table public.open_rooms add column if not exists link_type text;   -- 'issue'|'market'|'plaza'
alter table public.open_rooms add column if not exists link_id text;      -- 콘텐츠 id(bigint/uuid 혼용 → text)

-- 라이브 개설(링크 옵션) — 기존 시그니처 교체(추가 인자)
create or replace function public.live_room_create(p_title text, p_topic text default '',
  p_link_type text default null, p_link_id text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'auth'; end if;
  insert into open_rooms(owner_id, title, topic, kind, is_live, started_at, speaker_limit, link_type, link_id)
    values (me, coalesce(nullif(btrim(p_title),''),'라이브 난장'), coalesce(btrim(p_topic),''), 'live', true, now(), 8,
            nullif(p_link_type,''), nullif(p_link_id,''))
    returning id into v_id;
  insert into open_room_members(room_id, user_id, role, muted, hand_raised)
    values (v_id, me, 'host', false, false)
    on conflict (room_id,user_id) do update set role='host', muted=false;
  return v_id;
end $$;
grant execute on function public.live_room_create(text,text,text,text) to authenticated;

-- 콘텐츠에 걸린 진행중 라이브(가장 최근 1개) — 이슈/예측/광장 배너·버튼용
create or replace function public.live_room_for_link(p_link_type text, p_link_id text)
returns table(id uuid, title text, listeners int)
language sql security definer set search_path=public as $$
  select r.id, r.title,
    (select count(*) from open_room_members m where m.room_id=r.id)::int
  from open_rooms r
  where r.kind='live' and r.is_live=true and r.link_type=p_link_type and r.link_id=p_link_id
  order by r.started_at desc nulls last
  limit 1;
$$;
grant execute on function public.live_room_for_link(text,text) to authenticated;

-- 라이브 목록에 링크 정보 포함(칩 표시용) — 반환 타입 변경이라 DROP 후 재생성
drop function if exists public.list_live_rooms();
create or replace function public.list_live_rooms()
returns table(id uuid, title text, topic text, owner_id uuid, host_nick text, host_avatar text,
              started_at timestamptz, listeners int, speakers int, link_type text, link_id text)
language sql security definer set search_path=public as $$
  select r.id, r.title, r.topic, r.owner_id, u.nickname, u.avatar_url, r.started_at,
    (select count(*) from open_room_members m where m.room_id=r.id)::int as listeners,
    (select count(*) from open_room_members m where m.room_id=r.id and m.role in ('host','speaker'))::int as speakers,
    r.link_type, r.link_id
  from open_rooms r left join users u on u.id=r.owner_id
  where r.kind='live' and r.is_live=true
  order by r.started_at desc nulls last
  limit 50;
$$;
grant execute on function public.list_live_rooms() to authenticated;
