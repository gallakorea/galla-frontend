-- 💰 AI 창작 과금 GP → GC 전환 (사장님 확정 2026-08-07)
--   썸네일·영상 등 AI 창작 대행 비용을 갈라코인(GC)으로 차감 — "크리에이터가 번 GC로 창작 도구를 쓴다" 순환.
--   가격은 기존 app_settings.ai_creation(price_thumbnail 등) 그대로(단위만 GC로 해석). 원장 = gc_ledger.
create or replace function public.ai_creation_charge(p_kind text, p_n integer default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cfg jsonb; v_price int; v_bal int;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select v into v_cfg from app_settings where k='ai_creation';
  v_price := coalesce((v_cfg->>('price_'||p_kind))::int,0) * greatest(1,coalesce(p_n,1));
  if v_price <= 0 then return jsonb_build_object('ok',true,'charged',0); end if;
  -- GC 차감(행 잠금으로 동시성 안전)
  update gc_balances set balance = balance - v_price, updated_at = now()
    where user_id = v_user and balance >= v_price
    returning balance into v_bal;
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance',(select coalesce(balance,0) from gc_balances where user_id=v_user));
  end if;
  insert into gc_ledger(user_id,delta,reason) values (v_user,-v_price,'ai_creation:'||p_kind);
  return jsonb_build_object('ok',true,'charged',v_price,'currency','GC','balance',v_bal);
end $$;

create or replace function public.ai_creation_refund(p_user uuid, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  -- ⚠️ GC=실화폐: update만(차감된 유저는 행이 반드시 있음) — upsert로 '무에서 GC 생성'되는 경로 봉쇄.
  update gc_balances set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  if found then
    insert into gc_ledger(user_id,delta,reason) values (p_user,p_amount,'ai_creation:refund');
  end if;
end $$;

-- 관제 창작 계측 — 지출을 gc_ledger(신규 GC) + point_ledger(과거 GP분) 합산으로. 필드명은 admin.js 호환 유지.
create or replace function public.admin_creation_stats(p_days integer default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(p_days, 90)));
  v jsonb;
begin
  if not public._is_admin() then raise exception 'forbidden'; end if;
  select jsonb_build_object(
    'window_days', greatest(1, least(p_days,90)),
    'currency', 'GC',
    'thumbnails', (select count(*) from my_thumbnails where kind='thumbnail' and created_at>=v_since),
    'videos',     (select count(*) from my_thumbnails where kind='video'     and created_at>=v_since),
    'creators',   (select count(distinct user_id) from my_thumbnails where created_at>=v_since),
    'gp_spent_thumbnail', (select coalesce(-sum(delta),0) from gc_ledger where reason='ai_creation:thumbnail' and delta<0 and created_at>=v_since)
                        + (select coalesce(-sum(delta),0) from point_ledger where reason='ai_creation:thumbnail' and delta<0 and created_at>=v_since),
    'gp_spent_video',     (select coalesce(-sum(delta),0) from gc_ledger where reason='ai_creation:video' and delta<0 and created_at>=v_since)
                        + (select coalesce(-sum(delta),0) from point_ledger where reason='ai_creation:video' and delta<0 and created_at>=v_since),
    'gp_refunded',        (select coalesce(sum(delta),0) from gc_ledger where reason like 'ai_creation:refund%' and created_at>=v_since)
                        + (select coalesce(sum(delta),0) from point_ledger where reason like 'ai_creation:refund%' and created_at>=v_since),
    'paying_users',       (select count(distinct user_id) from (
                            select user_id from gc_ledger where reason like 'ai_creation:%' and delta<0 and created_at>=v_since
                            union select user_id from point_ledger where reason like 'ai_creation:%' and delta<0 and created_at>=v_since) u),
    'published_posts',    (select count(*) from posts where coalesce(is_published,true) and created_at>=v_since),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('d', dd, 'gen', gg) order by dd),'[]'::jsonb) from (
        select to_char(date_trunc('day', created_at),'MM-DD') dd,
               count(*) filter (where kind in ('thumbnail','video')) gg
        from my_thumbnails where created_at>=v_since
        group by 1
      ) x
    )
  ) into v;
  return v;
end $$;

-- 🔒 보안(발견 즉시 봉쇄): ai_creation_refund가 anon/authenticated에서 직접 호출 가능했음(p_user 임의 지정 = GC 무한 발행 구멍).
--    엣지(service_role)만 호출 — 전부 회수. charge는 auth.uid() 기반 자기차감이라 authenticated 유지.
revoke all on function public.ai_creation_refund(uuid, integer) from public, anon, authenticated;
revoke all on function public.ai_creation_charge(text, integer) from public, anon;
grant execute on function public.ai_creation_charge(text, integer) to authenticated;
