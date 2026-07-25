-- 📌 라이브 자료 프리젠테이션 — 호스트가 이슈/예측/뉴스/광장을 검색해 무대에 띄운다.
-- 방장은 방송 중 나갈 수 없으므로(나가면 방 파괴), 콘텐츠를 방 안으로 '끌어와' 제시한다.
-- 늦게 입장한 청중도 현재 띄운 자료를 보도록 방(open_rooms)에 상태로 저장.
alter table public.open_rooms add column if not exists present_type  text;  -- 'issue'|'market'|'news'|'plaza'
alter table public.open_rooms add column if not exists present_id    text;
alter table public.open_rooms add column if not exists present_title text;

-- 호스트 전용: 자료 설정/해제(type null이면 해제)
create or replace function public.live_set_present(p_room uuid, p_type text, p_id text, p_title text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare me uuid := auth.uid(); v_owner uuid;
begin
  if me is null then raise exception 'auth'; end if;
  select owner_id into v_owner from open_rooms where id=p_room and kind='live';
  if v_owner is null then return jsonb_build_object('ok',false,'reason','no_room'); end if;
  if v_owner <> me then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update open_rooms
     set present_type  = nullif(btrim(coalesce(p_type,'')),''),
         present_id    = nullif(btrim(coalesce(p_id,'')),''),
         present_title = nullif(left(btrim(coalesce(p_title,'')),120),'')
   where id=p_room;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.live_set_present(uuid,text,text,text) to authenticated;

-- 현재 방에 띄운 자료 조회(입장 시 late-join 동기화). RLS로 라이브 방은 읽기 공개.
create or replace function public.live_get_present(p_room uuid)
returns table(present_type text, present_id text, present_title text)
language sql security definer set search_path=public as $$
  select present_type, present_id, present_title from open_rooms where id=p_room and kind='live';
$$;
grant execute on function public.live_get_present(uuid) to authenticated;
