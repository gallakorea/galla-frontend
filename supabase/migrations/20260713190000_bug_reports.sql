-- 🐞 버그 신고
create table if not exists public.bug_reports (
  id           bigint generated always as identity primary key,
  user_id      uuid references auth.users(id) on delete set null,
  message      text not null,
  page_url     text,
  user_agent   text,
  viewport     text,
  app_version  text,
  status       text not null default 'new',    -- new | reviewing | resolved | wontfix
  admin_note   text,
  created_at   timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_bug_reports_status on public.bug_reports(status, created_at desc);

alter table public.bug_reports enable row level security;
-- 관리자만 직접 조회(제출은 RPC로). 클라 직접 insert는 막고 RPC 경유.
drop policy if exists bug_reports_admin_read on public.bug_reports;
create policy bug_reports_admin_read on public.bug_reports
  for select using (public._is_admin());

-- 제출: 익명·로그인 모두 가능(버그가 로그인 전에도 날 수 있음). user_id는 세션에서 자동.
create or replace function public.submit_bug(
  p_message text, p_page_url text default null, p_user_agent text default null,
  p_viewport text default null, p_app_version text default null
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  if p_message is null or length(btrim(p_message)) < 4 then
    raise exception '내용을 입력해주세요.';
  end if;
  insert into public.bug_reports(user_id, message, page_url, user_agent, viewport, app_version)
  values (auth.uid(), left(p_message, 4000), left(p_page_url, 500), left(p_user_agent, 500),
          left(p_viewport, 60), left(p_app_version, 40))
  returning id into v_id;
  return v_id;
end $$;

-- 관리자 목록
create or replace function public.admin_bug_reports(p_status text default null, p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select b.id, b.message, b.page_url, b.user_agent, b.viewport, b.app_version,
           b.status, b.admin_note, b.created_at, b.processed_at,
           b.user_id, u.nickname as reporter
    from public.bug_reports b
    left join public.users u on u.id = b.user_id
    where p_status is null or b.status = p_status
    order by b.created_at desc
    limit greatest(1, least(p_limit, 300))
  ) t;
  return jsonb_build_object('ok', true, 'rows', v,
    'counts', (select jsonb_object_agg(status, c) from (select status, count(*) c from public.bug_reports group by status) s));
end $$;

-- 관리자 상태 변경
create or replace function public.admin_resolve_bug(p_id bigint, p_status text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('new','reviewing','resolved','wontfix') then raise exception 'bad status'; end if;
  update public.bug_reports
    set status = p_status,
        admin_note = coalesce(p_note, admin_note),
        processed_at = case when p_status in ('resolved','wontfix') then now() else processed_at end
    where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.submit_bug(text,text,text,text,text) to anon, authenticated;
grant execute on function public.admin_bug_reports(text,int) to authenticated;
grant execute on function public.admin_resolve_bug(bigint,text,text) to authenticated;
