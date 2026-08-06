-- 🆘 위기 안전망 — 갈비스가 자살·자해 신호를 감지하면 케어 톤 전환 + 상담전화 안내 + 관제 계측.
--   "외로움 시대의 친구" 포지셔닝의 의무. 감지는 엣지 코드(모델 판단 배제), 여기는 로그+관제 RPC.
create table if not exists public.crisis_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  severity int not null default 2,         -- 2=명시적 고위험(현재는 이 티어만 개입)
  term text,                               -- 매칭된 신호(어떤 패턴에 걸렸나 — 정제/튜닝용)
  excerpt text,                            -- 발화 일부(맥락, 120자)
  handled boolean not null default false,  -- 관리자가 확인/후속했는지
  created_at timestamptz not null default now()
);
create index if not exists crisis_events_created_idx on public.crisis_events(created_at desc);
alter table public.crisis_events enable row level security;   -- 정책 없음 = anon/authenticated 접근 0(service_role·관리자 RPC만)

-- 엣지(service_role)가 감지 시 호출. 짧은 excerpt만 저장(PII 최소).
create or replace function public.log_crisis(p_user uuid, p_severity int, p_term text, p_excerpt text)
returns void language sql security definer set search_path = public as $$
  insert into crisis_events(user_id, severity, term, excerpt)
  values (p_user, coalesce(p_severity,2), left(coalesce(p_term,''),40), left(coalesce(p_excerpt,''),120));
$$;
revoke all on function public.log_crisis(uuid, int, text, text) from public, anon, authenticated;

-- 관제센터용 — 최근 위기 이벤트 요약(관리자만, 발화 excerpt 포함되므로 _is_admin 게이트 엄격).
create or replace function public.admin_crisis_stats(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('error','forbidden'); end if;
  select jsonb_build_object(
    'total', (select count(*) from crisis_events where created_at > now() - (p_days||' days')::interval),
    'unhandled', (select count(*) from crisis_events where not handled),
    'users', (select count(distinct user_id) from crisis_events where created_at > now() - (p_days||' days')::interval),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'at', to_char(created_at,'MM-DD HH24:MI'), 'term', term, 'excerpt', excerpt, 'handled', handled) order by created_at desc), '[]'::jsonb)
      from (select * from crisis_events order by created_at desc limit 30) t)
  ) into v;
  return v;
end $$;
revoke all on function public.admin_crisis_stats(int) from public, anon;
grant execute on function public.admin_crisis_stats(int) to authenticated;

-- 관리자가 처리 완료 표시.
create or replace function public.admin_crisis_handle(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then raise exception 'forbidden'; end if;
  update crisis_events set handled = true where id = p_id;
end $$;
revoke all on function public.admin_crisis_handle(bigint) from public, anon;
grant execute on function public.admin_crisis_handle(bigint) to authenticated;
