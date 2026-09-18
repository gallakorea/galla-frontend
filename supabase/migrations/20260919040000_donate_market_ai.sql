-- 🎁 AI 예측도 후원 가능(26.9.19 사장님 결정 「2」) — 받는 사람 = 예측을 만든 계정(AI 예측은 운영 계정 「갈라」)
create or replace function public.gc_donate_market(p_market_id bigint, p_amount integer, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int;
  v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select created_by into v_creator from markets where id = p_market_id;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_target'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;
  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then
    return jsonb_build_object('ok',false,'balance',coalesce(v_bal,0),
      'sub', _gc_sub_live(v_uid),
      'reason', case when _gc_sub_live(v_uid) > 0 then 'sub_not_for_donation' else 'insufficient' end);
  end if;
  v_fee := floor(p_amount * 0.2)::int;
  v_charity := floor(p_amount * 0.05)::int;
  v_net := p_amount - v_fee - v_charity;
  v_tier := _donation_tier(p_amount);
  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(market_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_market_id, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false),
            v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate_market', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'fee',v_fee,'charity',v_charity,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;

create or replace function public.tip_begin(p_channel text, p_product_id text, p_issue_id bigint default null, p_post_id bigint default null,
  p_plaza_post_id uuid default null, p_creator_id uuid default null, p_message text default null, p_anonymous boolean default false,
  p_market_id bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_p tip_products; v_creator uuid; v_id uuid; v_ai boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if p_channel not in ('ios','android') then return jsonb_build_object('ok',false,'reason','bad_channel'); end if;

  select * into v_p from tip_products where channel = p_channel and product_id = p_product_id and active;
  if v_p is null then return jsonb_build_object('ok',false,'reason','unknown_product'); end if;

  -- 받는 사람 — 대상에서 유도한다(클라가 보낸 creator_id 를 그대로 믿지 않는다)
  v_creator := p_creator_id;
  if p_issue_id is not null then select user_id into v_creator from issues where id = p_issue_id; end if;
  if p_post_id is not null then select user_id into v_creator from posts where id = p_post_id; end if;
  if p_plaza_post_id is not null then select user_id into v_creator from plaza_posts where id = p_plaza_post_id; end if;
  if p_market_id is not null then
    select created_by into v_creator from markets where id = p_market_id;
  end if;
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_target'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  update donations set status = 'expired'
   where supporter_id = v_uid and status = 'pending' and created_at < now() - interval '30 minutes';

  insert into donations (issue_id, post_id, plaza_post_id, market_id, creator_id, supporter_id,
                         amount, fee, net, charity, message, is_anonymous, status, method, pg_provider)
  values (p_issue_id, p_post_id, p_plaza_post_id, p_market_id, v_creator, v_uid,
          v_p.krw, 0, 0, 0, nullif(btrim(coalesce(p_message,'')),''), coalesce(p_anonymous,false),
          'pending', p_channel || '_iap', p_channel)
  returning id into v_id;

  return jsonb_build_object('ok',true,'tip_id',v_id,'krw',v_p.krw,'product_id',v_p.product_id);
end $$;
revoke all on function public.tip_begin(text,text,bigint,bigint,uuid,uuid,text,boolean,bigint) from public, anon;
grant execute on function public.tip_begin(text,text,bigint,bigint,uuid,uuid,text,boolean,bigint) to authenticated;
