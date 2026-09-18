-- 🎁 예측 후원 + tip_begin 만료 버그(26.9.19)
-- ① 사람이 연 예측(markets.created_by, ai_generated=false)의 예언자에게 후원 — 이슈·숏판·광장과 같은 배분(20/5/75)
-- ② tip_begin 이 오래된 pending 을 'expired' 로 바꾸는데 status 체크가 'expired' 를 몰라
--    30분 넘은 대기 건이 있는 사람은 앱 후원 시작 자체가 오류였다 → 허용 값에 추가.

alter table public.donations drop constraint if exists donations_status_check;
alter table public.donations add constraint donations_status_check
  check (status = any (array['pending','paid','failed','refunded','canceled','expired']));

alter table public.donations add column if not exists market_id bigint references public.markets(id) on delete set null;
create index if not exists donations_market_id_idx on public.donations(market_id) where market_id is not null;

create or replace function public.gc_donate_market(p_market_id bigint, p_amount integer, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_ai boolean; v_bal int;
  v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_amount is null or p_amount < 500 or p_amount > 1000000 then
    return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select created_by, coalesce(ai_generated,false) into v_creator, v_ai from markets where id = p_market_id;
  if v_creator is null or v_ai then return jsonb_build_object('ok',false,'reason','no_target'); end if;
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
revoke all on function public.gc_donate_market(bigint,integer,text,boolean) from public, anon;
grant execute on function public.gc_donate_market(bigint,integer,text,boolean) to authenticated;

-- tip_begin: 예측 대상 추가(p_market_id). 인자 목록이 바뀌므로 옛 것을 지우고 다시 만든다.
drop function if exists public.tip_begin(text, text, bigint, bigint, uuid, uuid, text, boolean);
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
    select created_by, coalesce(ai_generated,false) into v_creator, v_ai from markets where id = p_market_id;
    if v_ai then v_creator := null; end if;
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
