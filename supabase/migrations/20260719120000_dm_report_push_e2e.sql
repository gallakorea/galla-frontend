-- ═══════════════════════════════════════════════════════════════
-- DM 3종: ① 신고(reports) ② Web Push 구독 ③ E2E 비밀대화 키
-- ═══════════════════════════════════════════════════════════════

-- ── ① 신고 — 메시지·방·유저 공용. 접수되면 관리자에게 알림(버그 신고와 같은 문법) ──
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter uuid not null references public.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('dm_message','open_message','open_room','user')),
  target_id uuid not null,
  reason text not null check (reason in ('spam','abuse','sexual','scam','etc')),
  detail text not null default '' check (char_length(detail) <= 500),
  status text not null default 'open' check (status in ('open','done','dismissed')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated
  with check (reporter = auth.uid());
-- 열람은 관리자만 (본인 신고 내역 조회는 아직 화면이 없다 — 필요해지면 or reporter=auth.uid())
drop policy if exists reports_admin_read on public.reports;
create policy reports_admin_read on public.reports for select to authenticated
  using (exists (select 1 from public.user_profiles p
                  where p.user_id = auth.uid() and coalesce(p.admin_flag, false)));
drop policy if exists reports_admin_upd on public.reports;
create policy reports_admin_upd on public.reports for update to authenticated
  using (exists (select 1 from public.user_profiles p
                  where p.user_id = auth.uid() and coalesce(p.admin_flag, false)));
grant select, update (status) on public.reports to authenticated;
grant insert (reporter, target_kind, target_id, reason, detail) on public.reports to authenticated;

create or replace function public._trg_report_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into notifications(user_id, from_user, type, message, link)
    select p.user_id, new.reporter, 'report'::text,
           '🚨 신고 접수 — ' || new.target_kind || ' / ' || new.reason,
           'admin.html'
    from user_profiles p
    where coalesce(p.admin_flag, false)
      and p.user_id is distinct from new.reporter;
  exception when others then
    null;   -- 알림 실패가 신고 접수를 되돌리지 않게
  end;
  return new;
end $$;
drop trigger if exists trg_report_notify_admin on public.reports;
create trigger trg_report_notify_admin after insert on public.reports
  for each row execute function public._trg_report_notify_admin();

-- ── ② Web Push 구독 — 기기(endpoint)당 한 행, 본인 것만 ──
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_subs_user on public.push_subscriptions(user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subs_own on public.push_subscriptions;
create policy push_subs_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ── ③ E2E 공개키 게시 — 개인키는 기기를 떠나지 않는다(서버는 공개키만) ──
create table if not exists public.user_e2e_keys (
  user_id uuid primary key references public.users(id) on delete cascade,
  pub jsonb not null,          -- ECDH P-256 공개키(JWK)
  updated_at timestamptz not null default now()
);
alter table public.user_e2e_keys enable row level security;
-- 공개키는 이름 그대로 공개 — 누구든 읽어야 상대에게 암호화할 수 있다
drop policy if exists e2e_keys_read on public.user_e2e_keys;
create policy e2e_keys_read on public.user_e2e_keys for select to authenticated using (true);
drop policy if exists e2e_keys_own on public.user_e2e_keys;
create policy e2e_keys_own on public.user_e2e_keys for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists e2e_keys_own_upd on public.user_e2e_keys;
create policy e2e_keys_own_upd on public.user_e2e_keys for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.user_e2e_keys to authenticated;

-- 비밀 메시지는 인박스 미리보기에도 본문(암호문)을 흘리지 않는다
create or replace function public.dm_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_preview text;
begin
  v_preview := case new.kind
    when 'image' then '📷 사진'
    when 'gif'   then '🎬 GIF'
    when 'share' then '🔗 ' || coalesce(new.meta->>'title', '콘텐츠 공유')
    when 'e2e'   then '🔒 비밀 메시지'
    else new.body end;
  update dm_threads
     set last_message = left(v_preview, 120), last_sender = new.sender_id, last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;
