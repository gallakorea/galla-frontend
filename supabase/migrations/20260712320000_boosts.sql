-- 🚀 부스트 — GP 소비로 콘텐츠 노출 강화(소비 + 콘텐츠 활성화 동시)
--   pin: 내 이슈 24h 피드 상단 고정(2000GP) / highlight: 내 댓글 24h 하이라이트(800GP)

create table if not exists public.content_boosts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  target_type text not null,           -- 'issue' | 'comment'
  target_id bigint not null,
  kind text not null,                  -- 'pin' | 'highlight'
  until timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.content_boosts enable row level security;
drop policy if exists content_boosts_read on public.content_boosts;
create policy content_boosts_read on public.content_boosts for select using (true); -- 피드/댓글이 활성 부스트 조회
create index if not exists content_boosts_active_idx on public.content_boosts(kind, until desc);

create or replace function public.buy_boost(p_type text, p_id bigint, p_kind text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cost int; v_owner uuid; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_kind = 'pin' and p_type = 'issue' then
    v_cost := 2000; select user_id into v_owner from issues where id = p_id;
  elsif p_kind = 'highlight' and p_type = 'comment' then
    v_cost := 800; select user_id into v_owner from comments where id = p_id;
  else return jsonb_build_object('ok',false,'reason','bad_kind'); end if;
  if v_owner is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if v_owner <> v_user then return jsonb_build_object('ok',false,'reason','not_owner'); end if;

  insert into point_balances(user_id) values (v_user) on conflict do nothing;
  select balance into v_bal from point_balances where user_id=v_user for update;
  if coalesce(v_bal,0) < v_cost then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  update point_balances set balance = balance - v_cost, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_cost, 'boost:'||p_kind);
  insert into content_boosts(user_id, target_type, target_id, kind, until)
    values (v_user, p_type, p_id, p_kind, now() + interval '24 hours');
  return jsonb_build_object('ok',true,'until', (now() + interval '24 hours'));
end $$;
grant execute on function public.buy_boost(text,bigint,text) to authenticated;
