-- 광장 작성자 응원(후원) — 기존 이슈 후원 레일(20% 플랫폼/50% 창작자/30% 기부)을 광장 글로 확장
alter table public.donations add column if not exists plaza_post_id uuid references public.plaza_posts(id);
alter table public.donations alter column issue_id drop not null;
create index if not exists idx_donations_plaza on public.donations(plaza_post_id) where plaza_post_id is not null;

-- 현금(PG) 응원 시작: pending 생성 (이슈판 donate_begin과 동일 정책)
create or replace function public.plaza_donate_begin(p_post_id uuid, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_fee int; v_charity int; v_net int; v_id uuid; v_tier text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from plaza_posts where id = p_post_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_post'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  v_fee := floor(p_amount * 0.2)::int;
  v_charity := floor(p_amount * 0.3)::int;
  v_net := p_amount - v_fee - v_charity;
  v_tier := _donation_tier(p_amount);
  insert into donations(plaza_post_id, creator_id, supporter_id, amount, fee, charity, net, message, is_anonymous, tier, status)
    values (p_post_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'pending')
    returning id into v_id;
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier);
end $$;

-- GC(갈라코인) 응원: 즉시 paid (이슈판 gc_donate와 동일 정책)
create or replace function public.gc_donate_plaza(p_post_id uuid, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int;
  v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select user_id into v_creator from plaza_posts where id = p_post_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_post'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;
  v_fee := floor(p_amount * 0.2)::int;
  v_charity := floor(p_amount * 0.3)::int;
  v_net := p_amount - v_fee - v_charity;
  v_tier := _donation_tier(p_amount);
  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(plaza_post_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_post_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false),
            v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate_plaza', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;

-- 광장 글 응원 목록 (이슈판 issue_donations와 동일 반환 형식)
create or replace function public.plaza_donations(p_post_id uuid, p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare v_rows jsonb; v_total int; v_cnt int;
begin
  select coalesce(sum(amount),0), count(*) into v_total, v_cnt
    from donations where plaza_post_id=p_post_id and status='paid';
  select coalesce(jsonb_agg(x order by amount desc, created_at desc), '[]'::jsonb) into v_rows from (
    select jsonb_build_object(
      'id', d.id, 'amount', d.amount, 'message', d.message, 'tier', d.tier, 'created_at', d.created_at,
      'name', case when d.is_anonymous then '익명의 후원자' else coalesce(u.nickname,'후원자') end,
      'avatar', case when d.is_anonymous then null else u.avatar_url end
    ) x, d.amount, d.created_at
    from donations d left join users u on u.id = d.supporter_id
    where d.plaza_post_id = p_post_id and d.status = 'paid'
    limit p_limit
  ) t;
  return jsonb_build_object('ok',true,'total',v_total,'count',v_cnt,'rows',v_rows);
end $$;

grant execute on function public.plaza_donate_begin(uuid,int,text,boolean) to authenticated;
grant execute on function public.gc_donate_plaza(uuid,int,text,boolean) to authenticated;
grant execute on function public.plaza_donations(uuid,int) to anon, authenticated;
