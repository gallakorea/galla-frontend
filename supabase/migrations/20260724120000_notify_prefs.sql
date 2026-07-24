-- 🔔 알림 수신 설정 — 서버가 존중하는 카테고리별 수신거부 + 방해금지(DND)
-- 목적: 클라 로컬(sound/vibrate/스레드 음소거)은 그대로 두되, "푸시를 아예 안 받는다"는
--       기기가 꺼져 있어도 지켜져야 하므로 서버에 저장한다. send-push가 발송 직전 필터.
-- 카테고리: dm(1:1) · call(육성/면상톡) · room(난장/단체) · activity(좋아요·댓글 등 활동)
-- DND: 사용자 로컬 시각 창(from~to)에는 푸시 억제. tz_off = UTC 대비 분(KST=540).

create table if not exists public.notify_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  dm         boolean not null default true,
  call       boolean not null default true,
  room       boolean not null default true,
  activity   boolean not null default true,
  dnd_on     boolean not null default false,
  dnd_from   text    not null default '23:00',
  dnd_to     text    not null default '07:00',
  tz_off     int     not null default 540,       -- 분(KST +09:00 = 540)
  updated_at timestamptz not null default now()
);

alter table public.notify_prefs enable row level security;
drop policy if exists notify_prefs_own on public.notify_prefs;
create policy notify_prefs_own on public.notify_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.notify_prefs to authenticated;

-- 내 설정 조회(없으면 기본값 반환)
create or replace function public.get_my_notify_prefs()
returns public.notify_prefs
language sql security definer set search_path = public as $$
  select coalesce(
    (select p from public.notify_prefs p where p.user_id = auth.uid()),
    row(auth.uid(), true, true, true, true, false, '23:00', '07:00', 540, now())::public.notify_prefs
  );
$$;
grant execute on function public.get_my_notify_prefs() to authenticated;

-- 내 설정 저장(upsert)
create or replace function public.set_my_notify_prefs(
  p_dm boolean, p_call boolean, p_room boolean, p_activity boolean,
  p_dnd_on boolean, p_dnd_from text, p_dnd_to text, p_tz_off int
) returns public.notify_prefs
language plpgsql security definer set search_path = public as $$
declare u uuid := auth.uid(); r public.notify_prefs;
begin
  if u is null then raise exception 'auth required'; end if;
  insert into public.notify_prefs as np
    (user_id, dm, call, room, activity, dnd_on, dnd_from, dnd_to, tz_off, updated_at)
  values (u, coalesce(p_dm,true), coalesce(p_call,true), coalesce(p_room,true),
          coalesce(p_activity,true), coalesce(p_dnd_on,false),
          coalesce(p_dnd_from,'23:00'), coalesce(p_dnd_to,'07:00'),
          coalesce(p_tz_off,540), now())
  on conflict (user_id) do update set
    dm=excluded.dm, call=excluded.call, room=excluded.room, activity=excluded.activity,
    dnd_on=excluded.dnd_on, dnd_from=excluded.dnd_from, dnd_to=excluded.dnd_to,
    tz_off=excluded.tz_off, updated_at=now()
  returning np.* into r;
  return r;
end $$;
grant execute on function public.set_my_notify_prefs(boolean,boolean,boolean,boolean,boolean,text,text,int) to authenticated;

-- 발송 필터용: 지금 이 유저에게 category 푸시를 보내도 되나? (DND 창·카테고리 off 반영)
-- service_role(엣지함수)이 호출. 설정 없으면 전부 허용(기본 수신).
create or replace function public.push_allowed(p_user uuid, p_cat text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  p public.notify_prefs;
  cat_on boolean := true;
  loc time; fromt time; tot time; in_dnd boolean := false;
begin
  select * into p from public.notify_prefs where user_id = p_user;
  if not found then return true; end if;               -- 설정 없음 = 전부 수신
  cat_on := case p_cat
    when 'dm' then p.dm when 'call' then p.call
    when 'room' then p.room when 'activity' then p.activity else true end;
  if not cat_on then return false; end if;
  if p.dnd_on then
    loc  := ((now() at time zone 'utc') + make_interval(mins => p.tz_off))::time;
    begin fromt := p.dnd_from::time; tot := p.dnd_to::time; exception when others then return true; end;
    if fromt <= tot then in_dnd := (loc >= fromt and loc < tot);      -- 같은 날 창
    else                 in_dnd := (loc >= fromt or  loc < tot);      -- 자정 넘김
    end if;
    if in_dnd then return false; end if;
  end if;
  return true;
end $$;
grant execute on function public.push_allowed(uuid, text) to service_role, authenticated;
