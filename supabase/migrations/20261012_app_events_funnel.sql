-- 2026-10-12 오픈 전 측정 장치 — "첫 방문 → 가입 → 첫 투표 → 다음 날·7일 뒤 재방문"을 기기 단위로 잰다.
-- 이유: 로그인 유저 접속(activity_pings)만 있고, 비로그인 방문자·유입 경로·첫 투표 전환은 하나도 안 잡혔다.
-- 설계:
--   · 클라는 '접속(session_start)'과 '기기↔계정 연결(identify)'만 보낸다(js/track.js, 무작위 기기 ID·개인정보 없음).
--   · 투표·댓글·가입·베팅·DM 은 DB 트리거가 서버에서 기록 — 입력 경로가 5곳 이상이라 클라 훅은 반드시 샌다.
--   · 집계는 관리자 RPC admin_funnel 하나(관제센터 🎯 패널).

create table if not exists public.app_events (
  id bigserial primary key,
  device_id text,
  user_id uuid,
  event text not null,
  props jsonb not null default '{}'::jsonb,
  platform text,
  src text,
  created_at timestamptz not null default now()
);
create index if not exists app_events_created_idx on public.app_events(created_at);
create index if not exists app_events_dev_idx on public.app_events(device_id, created_at);
create index if not exists app_events_user_idx on public.app_events(user_id, created_at);
create index if not exists app_events_event_idx on public.app_events(event, created_at);
alter table public.app_events enable row level security;
revoke all on public.app_events from public, anon, authenticated;
grant all on public.app_events to service_role;

-- 기기 ↔ 계정(로그인 순간 연결). 한 기기에 여러 계정·한 계정에 여러 기기 가능.
create table if not exists public.device_links (
  device_id text not null,
  user_id uuid not null,
  first_seen timestamptz not null default now(),
  primary key (device_id, user_id)
);
alter table public.device_links enable row level security;
revoke all on public.device_links from public, anon, authenticated;
grant all on public.device_links to service_role;

-- 클라 기록 RPC — 이벤트 이름 화이트리스트·크기 상한·기기당 하루 상한(남용 방지). user_id 는 세션에서만.
create or replace function public.track_event(p_device text, p_event text, p_props jsonb default '{}'::jsonb,
                                              p_platform text default null, p_src text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if p_device is null or p_device !~ '^[A-Za-z0-9_-]{8,64}$' then return; end if;
  if p_event not in ('session_start','identify','push_open','share_click','install_prompt') then return; end if;
  if pg_column_size(coalesce(p_props,'{}'::jsonb)) > 2048 then p_props := '{}'::jsonb; end if;
  if (select count(*) from app_events where device_id = p_device and created_at > now() - interval '1 day') >= 300 then return; end if;
  insert into app_events(device_id, user_id, event, props, platform, src)
  values (p_device, v_uid, p_event, coalesce(p_props,'{}'::jsonb), left(p_platform,16), left(p_src,80));
  if v_uid is not null then
    insert into device_links(device_id, user_id) values (p_device, v_uid) on conflict do nothing;
  end if;
end $$;
revoke all on function public.track_event(text,text,jsonb,text,text) from public;
grant execute on function public.track_event(text,text,jsonb,text,text) to anon, authenticated;

-- 서버 쪽 행동 기록 트리거(어느 경로로 들어오든 잡힌다). 실패해도 본 작업은 막지 않는다.
create or replace function public._ae_log() returns trigger language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_props jsonb := '{}'::jsonb;
begin
  begin
    if TG_TABLE_NAME = 'votes' then v_uid := new.user_id; v_props := jsonb_build_object('issue_id', new.issue_id, 'side', new.type);
    elsif TG_TABLE_NAME = 'comments' then v_uid := new.user_id; v_props := jsonb_build_object('issue_id', new.issue_id);
    elsif TG_TABLE_NAME = 'predict_bets' then v_uid := new.user_id; v_props := jsonb_build_object('market_id', new.market_id);
    elsif TG_TABLE_NAME = 'dm_messages' then v_uid := new.sender_id;
    elsif TG_TABLE_NAME = 'users' then v_uid := new.id;
    end if;
    if v_uid is not null then
      insert into app_events(user_id, event, props)
      values (v_uid, case TG_TABLE_NAME when 'votes' then 'vote' when 'comments' then 'comment' when 'predict_bets' then 'bet'
                                        when 'dm_messages' then 'dm' when 'users' then 'signup' end, v_props);
    end if;
  exception when others then null;
  end;
  return new;
end $$;
revoke all on function public._ae_log() from public, anon, authenticated;

drop trigger if exists trg_ae_votes on public.votes;
create trigger trg_ae_votes after insert on public.votes for each row execute function public._ae_log();
drop trigger if exists trg_ae_comments on public.comments;
create trigger trg_ae_comments after insert on public.comments for each row execute function public._ae_log();
drop trigger if exists trg_ae_bets on public.predict_bets;
create trigger trg_ae_bets after insert on public.predict_bets for each row execute function public._ae_log();
drop trigger if exists trg_ae_dm on public.dm_messages;
create trigger trg_ae_dm after insert on public.dm_messages for each row execute function public._ae_log();
drop trigger if exists trg_ae_users on public.users;
create trigger trg_ae_users after insert on public.users for each row execute function public._ae_log();

-- 관리자 집계 — 기간 p_days. 사람 = 기기(로그인했으면 계정으로 묶임).
--   방문 기기·신규 기기·가입·첫 투표 전환·D1/D7·유입 경로·일별 추이·핵심 지표(주간 투표자)
create or replace function public.admin_funnel(p_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_from timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
begin
  if not _is_admin() then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  return (
  with test_users as (
    select u.id from auth.users u where coalesce(u.email,'') ~* '(redteam|qa|test|galvis|bot|example)'
    union select user_id from user_profiles where admin_flag
  ),
  dev_first as (   -- 기기별 첫 방문(전체 기간) · 첫 유입 경로 · 플랫폼
    select device_id, min(created_at) first_at,
           (array_agg(src order by created_at) filter (where src is not null))[1] src,
           (array_agg(platform order by created_at) filter (where platform is not null))[1] platform
    from app_events where event = 'session_start' and device_id is not null group by device_id
  ),
  dev_user as (select device_id, (array_agg(user_id order by first_seen))[1] user_id from device_links group by device_id),
  cohort as (       -- 기간 안에 처음 온 기기
    select f.device_id, f.first_at, f.first_at::date d0, coalesce(f.src,'(직접)') src, f.platform, du.user_id
    from dev_first f left join dev_user du on du.device_id = f.device_id
    where f.first_at >= v_from and (du.user_id is null or du.user_id not in (select id from test_users))
  ),
  dev_days as (select device_id, created_at::date d from app_events where event='session_start' and device_id is not null group by 1,2),
  usr_votes as (select user_id, min(created_at) first_vote from app_events where event='vote' group by 1),
  usr_signup as (select user_id, min(created_at) at from app_events where event='signup' group by 1),
  c as (
    select co.*,
      exists(select 1 from dev_days dd where dd.device_id=co.device_id and dd.d = co.d0 + 1) d1,
      exists(select 1 from dev_days dd where dd.device_id=co.device_id and dd.d between co.d0 + 6 and co.d0 + 8) d7,
      (co.user_id is not null) signed,
      exists(select 1 from usr_votes v where v.user_id = co.user_id) voted
    from cohort co
  )
  select jsonb_build_object('ok', true, 'days', p_days,
    'totals', (select jsonb_build_object(
        'new_devices', count(*), 'signed', count(*) filter (where signed), 'voted', count(*) filter (where voted),
        'd1_eligible', count(*) filter (where d0 < current_date - 1), 'd1', count(*) filter (where d1 and d0 < current_date - 1),
        'd7_eligible', count(*) filter (where d0 < current_date - 8), 'd7', count(*) filter (where d7 and d0 < current_date - 8),
        'voter_d7_eligible', count(*) filter (where voted and d0 < current_date - 8), 'voter_d7', count(*) filter (where voted and d7 and d0 < current_date - 8)
      ) from c),
    'wav', (select count(distinct user_id) from app_events where event='vote' and created_at > now() - interval '7 days'
              and user_id not in (select id from test_users)),
    'by_src', (select coalesce(jsonb_agg(x order by x->>'n' desc), '[]'::jsonb) from (
        select jsonb_build_object('src', src, 'n', count(*), 'signed', count(*) filter (where signed),
               'voted', count(*) filter (where voted), 'd1', count(*) filter (where d1)) x
        from c group by src) s),
    'by_platform', (select coalesce(jsonb_object_agg(coalesce(platform,'?'), n), '{}'::jsonb) from (select platform, count(*) n from c group by 1) p),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object('d', d, 'visitors', visitors, 'new', nw, 'signups', su, 'votes', vt) order by d), '[]'::jsonb) from (
        select g::date d,
          (select count(distinct device_id) from dev_days where dev_days.d = g::date) visitors,
          (select count(*) from cohort where cohort.d0 = g::date) nw,
          (select count(*) from usr_signup s where s.at::date = g::date and s.user_id not in (select id from test_users)) su,
          (select count(*) from app_events e where e.event='vote' and e.created_at::date = g::date and e.user_id not in (select id from test_users)) vt
        from generate_series(v_from::date, current_date, interval '1 day') g) dd)
  ));
end $$;
revoke all on function public.admin_funnel(int) from public, anon;
grant execute on function public.admin_funnel(int) to authenticated;
