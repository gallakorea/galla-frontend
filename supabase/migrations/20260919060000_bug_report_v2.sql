-- 🐞 버그 신고 v2(26.9.19 사장님: 「사용자가 더 빠르고 편하게 버그 리포트」)
--   유형(한 번 누르기)·스크린샷(스크린샷 찍으면 자동 첨부)·직전 화면 흔적(meta) · 확인되면 500 GP 보상
alter table public.bug_reports add column if not exists category text;
alter table public.bug_reports add column if not exists shot text;          -- data:image/jpeg;base64 (≤ 900KB)
alter table public.bug_reports add column if not exists meta jsonb;         -- 직전 화면 흔적·최근 오류·기기
alter table public.bug_reports add column if not exists rewarded_at timestamptz;

drop function if exists public.submit_bug(text, text, text, text, text);
create or replace function public.submit_bug(p_message text, p_page_url text default null, p_user_agent text default null,
  p_viewport text default null, p_app_version text default null, p_category text default null, p_shot text default null, p_meta jsonb default null)
returns bigint language plpgsql security definer set search_path to 'public' as $$
declare v_id bigint; v_uid uuid := auth.uid(); v_msg text := btrim(coalesce(p_message, ''));
begin
  -- 글이 없어도 유형이나 스크린샷이 있으면 받는다(한 번 누르고 보내기)
  if length(v_msg) < 2 and p_category is null and p_shot is null then raise exception '내용을 입력해주세요.'; end if;
  if p_shot is not null and (length(p_shot) > 900000 or p_shot !~ '^data:image/(jpeg|png|webp);base64,') then p_shot := null; end if;
  -- 도배 방지: 한 사람 1시간 10건, 비로그인 전체 1시간 60건
  if v_uid is not null then
    if (select count(*) from bug_reports where user_id = v_uid and created_at > now() - interval '1 hour') >= 10 then raise exception '잠시 후 다시 보내주세요.'; end if;
  elsif (select count(*) from bug_reports where user_id is null and created_at > now() - interval '1 hour') >= 60 then
    raise exception '잠시 후 다시 보내주세요.';
  end if;
  insert into public.bug_reports(user_id, message, page_url, user_agent, viewport, app_version, category, shot, meta)
  values (v_uid, left(coalesce(nullif(v_msg, ''), '(' || coalesce(p_category, '스크린샷') || ')'), 4000), left(p_page_url, 500), left(p_user_agent, 500),
          left(p_viewport, 60), left(p_app_version, 40), left(p_category, 40), p_shot,
          case when p_meta is not null and length(p_meta::text) < 20000 then p_meta end)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_bug(text,text,text,text,text,text,text,jsonb) to anon, authenticated;

-- 관리자 목록: 스크린샷 본문은 빼고(무거움) 있음 표시만 · 스크린샷은 따로
create or replace function public.admin_bug_reports(p_status text default null, p_limit integer default 100)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v jsonb;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v from (
    select b.id, b.message, b.page_url, b.user_agent, b.viewport, b.app_version,
           b.status, b.admin_note, b.created_at, b.processed_at, b.category, b.meta,
           (b.shot is not null) as has_shot, b.rewarded_at,
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

create or replace function public.admin_bug_shot(p_id bigint)
returns text language plpgsql security definer set search_path to 'public' as $$
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  return (select shot from public.bug_reports where id = p_id);
end $$;
revoke all on function public.admin_bug_shot(bigint) from public, anon;
grant execute on function public.admin_bug_shot(bigint) to authenticated;

-- 해결(resolved) 처리 = 확인된 버그 → 제보자에게 500 GP 한 번 + 알림
create or replace function public.admin_resolve_bug(p_id bigint, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_rew timestamptz; v_amt int := 500; v_paid boolean := false;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  if p_status not in ('new','reviewing','resolved','wontfix') then raise exception 'bad status'; end if;
  update public.bug_reports
    set status = p_status, admin_note = coalesce(p_note, admin_note),
        processed_at = case when p_status in ('resolved','wontfix') then now() else processed_at end
    where id = p_id returning user_id, rewarded_at into v_uid, v_rew;
  if p_status = 'resolved' and v_uid is not null and v_rew is null then
    insert into point_balances(user_id) values (v_uid) on conflict (user_id) do nothing;
    update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_uid;
    insert into point_ledger(user_id, delta, reason) values (v_uid, v_amt, 'bug_reward');
    update public.bug_reports set rewarded_at = now() where id = p_id;
    perform public._notify_sys(v_uid, 'bug_reward', null,
      '🐞 제보해 주신 버그를 고쳤어요! 고마움의 표시로 ' || v_amt || ' GP를 드렸어요.', 'gp-history.html');
    v_paid := true;
  end if;
  return jsonb_build_object('ok', true, 'rewarded', v_paid);
end $$;
