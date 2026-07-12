-- 🛠 관제 P4 — 정산/출금 · AS 티켓 · 직접 업로드 · 공지 · 감사로그

-- ===== 정산/출금 =====
create or replace function public.admin_withdrawals(p_status text default 'all')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'nickname',u.nickname,'bank',w.bank,
    'account',w.account_number,'holder',w.holder,'amount',w.amount,'status',w.status,'created_at',w.created_at)
    order by w.created_at desc), '[]'::jsonb) into v
  from withdrawals w left join users u on u.id=w.user_id
  where (p_status='all' or w.status=p_status);
  return jsonb_build_object('ok',true,'rows',v,
    'pending',(select count(*) from withdrawals where status='pending'));
end $$;

create or replace function public.admin_process_withdrawal(p_id bigint, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  if p_status not in ('approved','done','rejected') then return jsonb_build_object('ok',false,'reason','bad_status'); end if;
  update withdrawals set status=p_status where id=p_id;
  perform _admin_log('withdrawal_'||p_status, p_id::text, null);
  return jsonb_build_object('ok',true);
end $$;

-- ===== AS 고객지원 티켓 =====
create table if not exists public.support_tickets (
  id bigint generated always as identity primary key,
  user_id uuid, subject text not null, body text not null,
  status text not null default 'open' check (status in ('open','answered','closed')),
  reply text, replied_by uuid, replied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists tickets_self on public.support_tickets;
create policy tickets_self on public.support_tickets for select using (auth.uid()=user_id or _is_admin());
drop policy if exists tickets_insert on public.support_tickets;
create policy tickets_insert on public.support_tickets for insert to authenticated with check (auth.uid()=user_id);

create or replace function public.create_support_ticket(p_subject text, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  insert into support_tickets(user_id, subject, body) values (auth.uid(), left(p_subject,120), left(p_body,2000)) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

create or replace function public.admin_tickets(p_status text default 'all')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'nickname',u.nickname,'subject',t.subject,
    'body',t.body,'status',t.status,'reply',t.reply,'created_at',t.created_at) order by t.created_at desc), '[]'::jsonb) into v
  from support_tickets t left join users u on u.id=t.user_id
  where (p_status='all' or t.status=p_status);
  return jsonb_build_object('ok',true,'rows',v,'open',(select count(*) from support_tickets where status='open'));
end $$;

create or replace function public.admin_reply_ticket(p_id bigint, p_reply text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  update support_tickets set reply=p_reply, status='answered', replied_by=auth.uid(), replied_at=now()
    where id=p_id returning user_id into v_uid;
  if v_uid is not null then
    insert into notifications(user_id, type, message, link) values (v_uid, 'support', '문의에 답변이 등록됐어요 🎧', 'support.html');
  end if;
  perform _admin_log('ticket_reply', p_id::text, null);
  return jsonb_build_object('ok',true);
end $$;

-- ===== 직접 업로드(관리자 이슈 발행) =====
create or replace function public.admin_publish_issue(p_title text, p_desc text, p_category text default '사회')
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  insert into issues(user_id, title, description, category)
    values (auth.uid(), left(p_title,140), p_desc, p_category) returning id into v_id;
  perform _admin_log('publish_issue', v_id::text, null);
  return jsonb_build_object('ok',true,'id',v_id);
end $$;

-- ===== 전체 공지 발송 =====
create or replace function public.admin_broadcast(p_message text, p_link text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  insert into notifications(user_id, type, message, link)
    select user_id, 'notice', left(p_message,200), coalesce(p_link,'index.html') from user_profiles;
  get diagnostics v_n = row_count;
  perform _admin_log('broadcast', null, jsonb_build_object('n',v_n));
  return jsonb_build_object('ok',true,'sent',v_n);
end $$;

-- ===== 감사로그 조회 =====
create or replace function public.admin_audit_list(p_limit int default 80)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('actor',u.nickname,'action',a.action,'target',a.target,
    'meta',a.meta,'created_at',a.created_at) order by a.created_at desc), '[]'::jsonb) into v
  from admin_audit a left join users u on u.id=a.actor limit p_limit;
  return jsonb_build_object('ok',true,'rows',v);
end $$;

grant execute on function public.admin_withdrawals(text)              to authenticated;
grant execute on function public.admin_process_withdrawal(bigint,text) to authenticated;
grant execute on function public.create_support_ticket(text,text)     to authenticated;
grant execute on function public.admin_tickets(text)                  to authenticated;
grant execute on function public.admin_reply_ticket(bigint,text)      to authenticated;
grant execute on function public.admin_publish_issue(text,text,text)  to authenticated;
grant execute on function public.admin_broadcast(text,text)           to authenticated;
grant execute on function public.admin_audit_list(int)                to authenticated;
