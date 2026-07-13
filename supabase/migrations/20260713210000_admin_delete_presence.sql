-- 🛠 관리자 고도화 — 회원 삭제 + 실시간 접속 관제(회원/비회원/지역)
-- 접근: 조회/삭제는 _is_admin() 게이트. presence_ping은 anon 포함 누구나(비회원 집계용).

-- ─────────── 회원 삭제 ───────────
-- auth.users 삭제 → 대부분 public 데이터가 on delete cascade로 연쇄 삭제됨.
-- 관리자/본인은 삭제 불가(사고 방지).
create or replace function public.admin_delete_user(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare v_admin boolean;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_user is null then return jsonb_build_object('ok',false,'reason','no_target'); end if;
  if p_user = auth.uid() then return jsonb_build_object('ok',false,'reason','self'); end if;
  select coalesce(admin_flag,false) into v_admin from user_profiles where user_id = p_user;
  if v_admin then return jsonb_build_object('ok',false,'reason','is_admin'); end if;

  perform _admin_log('delete_user', p_user::text, null);
  -- 잔여 프로필 정리(FK cascade 누락분 대비) 후 auth 계정 삭제로 연쇄 정리
  delete from public.user_profiles where user_id = p_user;
  delete from public.users where id = p_user;
  delete from auth.users where id = p_user;
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.admin_delete_user(uuid) to authenticated;

-- ─────────── 실시간 접속 presence ───────────
-- 세션 단위 하트비트. 회원=user_id 有, 비회원=null. tz는 대략적 지역 신호(비회원용).
create table if not exists public.presence (
  session_id text primary key,
  user_id    uuid,
  tz         text,
  last_seen  timestamptz not null default now()
);
alter table public.presence enable row level security;
create index if not exists presence_last_seen_idx on public.presence(last_seen);

-- 하트비트(anon 포함). 세션ID는 클라 생성. 회원이면 auth.uid() 기록.
create or replace function public.presence_ping(p_session text, p_tz text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_session is null or length(p_session) < 6 then return; end if;
  insert into presence(session_id, user_id, tz, last_seen)
    values (p_session, auth.uid(), p_tz, now())
  on conflict (session_id) do update
    set user_id = excluded.user_id, tz = excluded.tz, last_seen = now();
  -- 가끔 오래된 행 청소(2% 확률)
  if random() < 0.02 then
    delete from presence where last_seen < now() - interval '1 day';
  end if;
end $$;
grant execute on function public.presence_ping(text, text) to anon, authenticated;

-- 실시간 접속 관제(최근 2분 = 온라인). 회원 명단/비회원 수/지역 분포.
create or replace function public.admin_presence()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb; v_members jsonb; v_regions jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;

  -- 온라인 회원(닉네임+지역+마지막활동). 세션 여러개면 유저 1명으로 합침.
  select jsonb_agg(m order by last_seen desc) into v_members from (
    select p.user_id,
           coalesce(u.nickname, '익명') as nickname,
           coalesce(nullif(u.region,''), '미상') as region,
           max(p.last_seen) as last_seen
    from presence p
    left join users u on u.id = p.user_id
    where p.user_id is not null and p.last_seen >= now() - interval '2 minutes'
    group by p.user_id, u.nickname, u.region
  ) m;

  -- 지역 분포(온라인 회원 기준)
  select jsonb_agg(jsonb_build_object('region', region, 'c', c) order by c desc) into v_regions from (
    select coalesce(nullif(u.region,''), '미상') as region, count(distinct p.user_id) c
    from presence p left join users u on u.id = p.user_id
    where p.user_id is not null and p.last_seen >= now() - interval '2 minutes'
    group by 1
  ) r;

  select jsonb_build_object('ok',true,
    'members', coalesce(v_members, '[]'::jsonb),
    'member_count', (select count(distinct user_id) from presence where user_id is not null and last_seen >= now() - interval '2 minutes'),
    'guest_count',  (select count(*) from presence where user_id is null and last_seen >= now() - interval '2 minutes'),
    'regions', coalesce(v_regions, '[]'::jsonb)
  ) into v;
  return v;
end $$;
grant execute on function public.admin_presence() to authenticated;
