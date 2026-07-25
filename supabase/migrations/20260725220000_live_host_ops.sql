-- 👑 방장 권한 위임 + 🚫 쫓아내기(재입장 차단) — 육성 난장 호스트 운영 도구
-- 강퇴된 사용자는 재입장 못 하도록 밴 목록 유지.
create table if not exists public.open_room_bans (
  room_id   uuid not null references public.open_rooms(id) on delete cascade,
  user_id   uuid not null references public.users(id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
alter table public.open_room_bans enable row level security;
-- 직접 접근 불필요(모든 조작은 security definer RPC 경유) — 정책 없음 = 클라 접근 차단

-- 방장 넘기기: 대상=host(언뮤트), 나=speaker, 방 소유자 갱신(reaper/권한 기준)
create or replace function public.live_transfer_host(p_room uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid;
begin
  if me is null then raise exception 'auth'; end if;
  select owner_id into v_owner from open_rooms where id=p_room and kind='live';
  if v_owner is null then return jsonb_build_object('ok',false,'reason','no_room'); end if;
  if v_owner <> me then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_target = me then return jsonb_build_object('ok',false,'reason','self'); end if;
  if not exists (select 1 from open_room_members where room_id=p_room and user_id=p_target) then
    return jsonb_build_object('ok',false,'reason','not_member'); end if;
  update open_room_members set role='host', muted=false, hand_raised=false where room_id=p_room and user_id=p_target;
  update open_room_members set role='speaker', muted=false where room_id=p_room and user_id=me;
  update open_rooms set owner_id=p_target where id=p_room;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.live_transfer_host(uuid,uuid) to authenticated;

-- 쫓아내기: 멤버 삭제 + 밴 등록(재입장 차단). 호스트만, 자신은 불가.
create or replace function public.live_kick(p_room uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid;
begin
  if me is null then raise exception 'auth'; end if;
  select owner_id into v_owner from open_rooms where id=p_room and kind='live';
  if v_owner is null then return jsonb_build_object('ok',false,'reason','no_room'); end if;
  if v_owner <> me then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_target = me then return jsonb_build_object('ok',false,'reason','self'); end if;
  delete from open_room_members where room_id=p_room and user_id=p_target;
  insert into open_room_bans(room_id, user_id) values (p_room, p_target) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.live_kick(uuid,uuid) to authenticated;

-- 입장 시 밴 확인 추가(기존 live_join 교체)
create or replace function public.live_join(p_room uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_live boolean;
begin
  if me is null then raise exception 'auth'; end if;
  if exists (select 1 from open_room_bans where room_id=p_room and user_id=me) then
    return jsonb_build_object('ok',false,'reason','banned'); end if;
  select is_live into v_live from open_rooms where id=p_room and kind='live';
  if v_live is null then return jsonb_build_object('ok',false,'reason','notfound'); end if;
  if not v_live then return jsonb_build_object('ok',false,'reason','ended'); end if;
  insert into open_room_members(room_id, user_id, role, muted)
    values (p_room, me, 'listener', true)
    on conflict (room_id,user_id) do nothing;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.live_join(uuid) to authenticated;
