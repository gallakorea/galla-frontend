-- 🕵️ 제보하기 — 사진·영상·링크 첨부 제보 + GP 보상(일일 캡) + 관리자 채택 보너스
create table if not exists public.tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  body text,
  category text,
  media jsonb not null default '[]'::jsonb,   -- [{url, kind:'image'|'video'}]
  links jsonb not null default '[]'::jsonb,    -- ["https://...", ...]
  status text not null default 'pending' check (status in ('pending','reviewing','approved','rejected')),
  reward_gp int not null default 0,
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create index if not exists idx_tips_user on public.tips(user_id, created_at desc);
create index if not exists idx_tips_status on public.tips(status, created_at desc);
alter table public.tips enable row level security;
drop policy if exists tips_own on public.tips;
create policy tips_own on public.tips for select using (user_id = auth.uid() or _is_admin());

-- 보상 상수
create or replace function public._tip_submit_reward() returns int language sql immutable as $$ select 100 $$;
create or replace function public._tip_daily_cap() returns int language sql immutable as $$ select 3 $$;

-- 제보 제출 (+GP, 하루 3회까지 보상)
create or replace function public.submit_tip(
  p_title text, p_body text default null, p_category text default null,
  p_media jsonb default '[]'::jsonb, p_links jsonb default '[]'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_today int; v_reward int := 0; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_title),'')='' then return jsonb_build_object('ok',false,'reason','no_title'); end if;
  select count(*) into v_today from tips where user_id=v_uid and created_at::date = now()::date;
  if v_today < _tip_daily_cap() then v_reward := _tip_submit_reward(); end if;
  insert into tips(user_id,title,body,category,media,links,reward_gp)
    values (v_uid, left(p_title,200), p_body, p_category,
            coalesce(p_media,'[]'::jsonb), coalesce(p_links,'[]'::jsonb), v_reward)
    returning id into v_id;
  if v_reward > 0 then
    insert into point_balances(user_id) values(v_uid) on conflict (user_id) do nothing;
    update point_balances set balance = balance + v_reward where user_id=v_uid;
    insert into point_ledger(user_id, delta, reason) values (v_uid, v_reward, 'tip:submit');
  end if;
  return jsonb_build_object('ok',true,'tip_id',v_id,'reward',v_reward,
    'capped', v_today >= _tip_daily_cap());
end $$;

-- 관리자: 제보 목록
create or replace function public.admin_tips(p_status text default 'all', p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'title',t.title,'body',t.body,'category',t.category,'media',t.media,'links',t.links,
    'status',t.status,'reward_gp',t.reward_gp,'admin_note',t.admin_note,'created_at',t.created_at,
    'nickname',u.nickname) order by t.created_at desc), '[]'::jsonb) into v
  from tips t left join users u on u.id=t.user_id
  where (p_status='all' or t.status=p_status) limit p_limit;
  return jsonb_build_object('ok',true,'rows',v,
    'pending',(select count(*) from tips where status='pending'));
end $$;

-- 관리자: 채택/반려 (+채택 보너스 GP)
create or replace function public.admin_review_tip(
  p_id uuid, p_action text, p_note text default null, p_bonus int default 2000)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t tips%rowtype; v_bonus int;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into t from tips where id=p_id;
  if t.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if p_action='approve' then
    v_bonus := greatest(0, coalesce(p_bonus,2000));
    update tips set status='approved', admin_note=p_note, reviewed_at=now(),
      reward_gp = reward_gp + v_bonus where id=p_id;
    if v_bonus > 0 then
      insert into point_balances(user_id) values(t.user_id) on conflict (user_id) do nothing;
      update point_balances set balance = balance + v_bonus where user_id=t.user_id;
      insert into point_ledger(user_id, delta, reason) values (t.user_id, v_bonus, 'tip:approved');
    end if;
    perform _admin_log('tip_approve', p_id::text, jsonb_build_object('bonus',v_bonus));
  elsif p_action='reject' then
    update tips set status='rejected', admin_note=p_note, reviewed_at=now() where id=p_id;
    perform _admin_log('tip_reject', p_id::text, null);
  else return jsonb_build_object('ok',false,'reason','bad_action'); end if;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.submit_tip(text,text,text,jsonb,jsonb) to authenticated;
grant execute on function public.admin_tips(text,int) to authenticated;
grant execute on function public.admin_review_tip(uuid,text,text,int) to authenticated;
