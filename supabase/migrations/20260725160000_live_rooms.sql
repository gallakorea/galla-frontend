-- 🎙 라이브 난장 (클럽하우스식 라이브 음성) — open_rooms 재사용, kind='live'
-- 무대(스피커) + 청중(리스너) 역할, 손들기→호스트 승격, 실시간 음성은 Cloudflare Calls SFU(엣지),
-- 역할/프레즌스 동기화는 Supabase Realtime. 후원은 GC(gc_donate) — 게임 GP와 분리.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) 방 종류에 'live' 추가 + 라이브 전용 컬럼
alter table public.open_rooms drop constraint if exists open_rooms_kind_chk;
alter table public.open_rooms add constraint open_rooms_kind_chk check (kind in ('open','group','live'));
alter table public.open_rooms add column if not exists is_live boolean not null default false;
alter table public.open_rooms add column if not exists started_at timestamptz;
alter table public.open_rooms add column if not exists ended_at timestamptz;
alter table public.open_rooms add column if not exists speaker_limit int not null default 8;

-- 2) 멤버 역할/손들기/뮤트
alter table public.open_room_members add column if not exists role text not null default 'listener';
do $$ begin
  alter table public.open_room_members add constraint orm_role_chk check (role in ('host','speaker','listener'));
exception when duplicate_object then null; end $$;
alter table public.open_room_members add column if not exists hand_raised boolean not null default false;
alter table public.open_room_members add column if not exists muted boolean not null default true;

-- 3) RLS — 라이브도 목록/입장 공개(open과 동일)
drop policy if exists open_rooms_read on public.open_rooms;
create policy open_rooms_read on public.open_rooms for select to authenticated
  using (kind in ('open','live')
    or exists (select 1 from public.open_room_members m
                where m.room_id = open_rooms.id and m.user_id = auth.uid()));

drop policy if exists open_members_join on public.open_room_members;
create policy open_members_join on public.open_room_members for insert to authenticated
  with check (user_id = auth.uid()
    and (exists (select 1 from public.open_rooms r where r.id = room_id and r.kind in ('open','live'))
      or exists (select 1 from public.open_room_members m
                  where m.room_id = open_room_members.room_id and m.user_id = auth.uid())));

-- ── RPC ──────────────────────────────────────────────────────────────────────

-- 라이브 방 개설: 개설자=host(스피커·언뮤트), is_live=true
create or replace function public.live_room_create(p_title text, p_topic text default '')
returns uuid language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_id uuid;
begin
  if me is null then raise exception 'auth'; end if;
  insert into open_rooms(owner_id, title, topic, kind, is_live, started_at, speaker_limit)
    values (me, coalesce(nullif(btrim(p_title),''),'라이브 난장'), coalesce(btrim(p_topic),''), 'live', true, now(), 8)
    returning id into v_id;
  insert into open_room_members(room_id, user_id, role, muted, hand_raised)
    values (v_id, me, 'host', false, false)
    on conflict (room_id,user_id) do update set role='host', muted=false;
  return v_id;
end $$;

-- 입장: 청중(listener)으로. 이미 있으면 유지.
create or replace function public.live_join(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_live boolean;
begin
  if me is null then raise exception 'auth'; end if;
  select is_live into v_live from open_rooms where id=p_room and kind='live';
  if v_live is null then return jsonb_build_object('ok',false,'reason','notfound'); end if;
  if not v_live then return jsonb_build_object('ok',false,'reason','ended'); end if;
  insert into open_room_members(room_id, user_id, role, muted)
    values (p_room, me, 'listener', true)
    on conflict (room_id,user_id) do nothing;
  return jsonb_build_object('ok',true);
end $$;

-- 손들기 토글(청중만 의미)
create or replace function public.live_raise_hand(p_room uuid, p_on boolean)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'auth'; end if;
  update open_room_members set hand_raised = coalesce(p_on,false)
    where room_id=p_room and user_id=me;
end $$;

-- 역할 변경(호스트만): 청중↔스피커 승격/강등. 스피커 한도 체크.
create or replace function public.live_set_role(p_room uuid, p_target uuid, p_role text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid; v_lim int; v_cnt int;
begin
  if me is null then raise exception 'auth'; end if;
  if p_role not in ('speaker','listener') then return jsonb_build_object('ok',false,'reason','badrole'); end if;
  select owner_id, speaker_limit into v_owner, v_lim from open_rooms where id=p_room and kind='live';
  if v_owner is null then return jsonb_build_object('ok',false,'reason','notfound'); end if;
  if v_owner <> me then return jsonb_build_object('ok',false,'reason','forbidden'); end if;  -- 호스트만
  if p_role='speaker' then
    select count(*) into v_cnt from open_room_members where room_id=p_room and role in ('host','speaker');
    if v_cnt >= v_lim then return jsonb_build_object('ok',false,'reason','full'); end if;
  end if;
  update open_room_members
     set role = p_role,
         hand_raised = false,
         muted = case when p_role='speaker' then false else true end
   where room_id=p_room and user_id=p_target and role <> 'host';
  return jsonb_build_object('ok',true);
end $$;

-- 뮤트 설정: 본인은 자기 것, 호스트는 남의 것도.
create or replace function public.live_set_mute(p_room uuid, p_target uuid, p_muted boolean)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid;
begin
  if me is null then raise exception 'auth'; end if;
  select owner_id into v_owner from open_rooms where id=p_room;
  if me <> p_target and me <> v_owner then return; end if;   -- 남을 뮤트하려면 호스트
  update open_room_members set muted = coalesce(p_muted,true)
    where room_id=p_room and user_id=p_target;
end $$;

-- 퇴장: 멤버 삭제. 호스트가 나가면 방 종료.
create or replace function public.live_leave(p_room uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid;
begin
  if me is null then raise exception 'auth'; end if;
  select owner_id into v_owner from open_rooms where id=p_room;
  delete from open_room_members where room_id=p_room and user_id=me;
  if v_owner = me then
    update open_rooms set is_live=false, ended_at=now() where id=p_room;
  end if;
end $$;

-- 호스트 방 종료
create or replace function public.live_end(p_room uuid)
returns void language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid();
begin
  update open_rooms set is_live=false, ended_at=now()
    where id=p_room and owner_id=me and kind='live';
end $$;

-- 진행중 라이브 목록(난장 상단 LIVE 섹션): 청중수·스피커수·호스트 닉
create or replace function public.list_live_rooms()
returns table(id uuid, title text, topic text, owner_id uuid, host_nick text, host_avatar text,
              started_at timestamptz, listeners int, speakers int)
language sql security definer set search_path=public as $$
  select r.id, r.title, r.topic, r.owner_id, u.nickname, u.avatar_url, r.started_at,
    (select count(*) from open_room_members m where m.room_id=r.id)::int as listeners,
    (select count(*) from open_room_members m where m.room_id=r.id and m.role in ('host','speaker'))::int as speakers
  from open_rooms r left join users u on u.id=r.owner_id
  where r.kind='live' and r.is_live=true
  order by r.started_at desc nulls last
  limit 50;
$$;

-- 방 상태(무대 렌더): 멤버 역할·손들기·뮤트·프로필
create or replace function public.live_room_state(p_room uuid)
returns table(user_id uuid, nickname text, avatar_url text, role text, hand_raised boolean, muted boolean, joined_at timestamptz)
language sql security definer set search_path=public as $$
  select m.user_id, u.nickname, u.avatar_url, m.role, m.hand_raised, m.muted, m.joined_at
  from open_room_members m left join users u on u.id=m.user_id
  where m.room_id = p_room
  order by (case m.role when 'host' then 0 when 'speaker' then 1 else 2 end), m.joined_at;
$$;

grant execute on function public.live_room_create(text,text) to authenticated;
grant execute on function public.live_join(uuid) to authenticated;
grant execute on function public.live_raise_hand(uuid,boolean) to authenticated;
grant execute on function public.live_set_role(uuid,uuid,text) to authenticated;
grant execute on function public.live_set_mute(uuid,uuid,boolean) to authenticated;
grant execute on function public.live_leave(uuid) to authenticated;
grant execute on function public.live_end(uuid) to authenticated;
grant execute on function public.list_live_rooms() to authenticated;
grant execute on function public.live_room_state(uuid) to authenticated;
