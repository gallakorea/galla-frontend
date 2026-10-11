-- 2026-10-11 보안 감사(Cloudflare security-audit 스킬 run-1) 라이브 확인 후 수정
-- 원칙: 서비스 전용 함수는 public 까지 회수(anon, authenticated 만 빼면 public 경로로 남는다 — 20260901280000 실측)
--       호출자는 전부 SECURITY DEFINER 함수·크론(postgres)·엣지(service_role) 라 영향 없음(라이브에서 호출자 확인).

-- ── 1) 익명/로그인 유저가 실행 가능하던 서비스 전용 함수 회수 ──────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in (
      -- 남의 갈비스 기억 조회(익명 실행 가능했다)
      'match_friend_memory','reward_friend_memory','touch_friend_memory','friend_memory_maintain',
      -- 영상 이전 큐
      'next_video_migrations','apply_video_migration','fail_video_migration',
      -- 여행 수집 파이프라인 쓰기(익명 쓰기 가능했다)
      'travel_admin1_save','travel_area_photo_save','travel_cert_ingest','travel_channel_full_scanned',
      'travel_geo_refund','travel_geo_take','travel_geocache_get','travel_geocache_put','travel_heritage_ingest',
      'travel_ingest','travel_localize_apply','travel_place_media_set','travel_recalc','travel_retag_requeue',
      'travel_summary_save','travel_trends_save','travel_video_tags_set','travel_videos_mark_harvested',
      -- 기타 파이프라인·크론 전용
      'food_places_sync_min_price','food_videos_fill_region','air_refresh',
      '_content_report_sla_check','_content_report_sla_cron','admin_create_issue_market',
      -- 비밀값·권한 오라클
      'cron_secret_matches','is_admin_uid','is_redteam_uid',
      -- 남의 활동 시각 조회(로그인 유저가 남의 DM 발신 시각까지 셀 수 있었다)
      '_mission_count','_share_verified_count','_tier_lv',
      -- AI 예산·번역 한도(라이브는 이미 막혀 있었음 — public 까지 확실히)
      'ai_spend_add','translate_gate'
    )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- ── 2) 관리자 분석 뷰: 익명이 투표·유령댓글 user_id 를 created_at 조인으로 복원할 수 있었다 ──
revoke all on public._active_events from anon, authenticated, public;
grant select on public._active_events to service_role;

-- ── 3) 예측 시장: 개설자가 정산 칼럼(jackpot_bonus/total_pool/close_at/resolved…)을 직접 PATCH ──
--    클라가 직접 고치는 칼럼은 tags, title_pattern 둘뿐(js/galla-predict.js:682,688)
revoke insert, update, delete on public.markets from anon;
revoke update on public.markets from authenticated;
grant update (tags, title_pattern) on public.markets to authenticated;

-- 남이 이미 건 마켓은 개설자가 지울 수 없다(predict_bets 가 cascade 로 같이 사라졌다)
drop policy if exists markets_delete_own on public.markets;
create policy markets_delete_own on public.markets for delete to authenticated
using (
  ((auth.uid() = created_by) or is_admin())
  and not exists (select 1 from market_trades t where t.market_id = markets.id)
  and not exists (select 1 from predict_bets b where b.market_id = markets.id)
);

-- 유저 마켓 시드는 기본 300 상한(관리자·크론은 자유) — 시드 무제한이면 개설자가 집 돈을 뽑아갔다
create or replace function public.create_market(p_question text, p_description text, p_category text, p_image_url text, p_close_at timestamp with time zone, p_outcomes jsonb default null::jsonb, p_liquidity double precision default 300)
 returns bigint
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_user uuid := auth.uid(); v_id bigint; v_seed double precision := greatest(coalesce(p_liquidity,300),0);
  v_type text := 'binary'; v_n int := 0; oc jsonb;
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if not _is_admin() then v_seed := least(v_seed, 300); end if;
  if p_question is null or length(trim(p_question)) = 0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at <= now() then raise exception 'close_at must be future'; end if;
  if p_outcomes is not null and jsonb_array_length(p_outcomes) >= 2 then v_type := 'multi'; end if;
  -- 이미지 주소는 http(s) 만(따옴표 등으로 속성 탈출해 XSS 를 심던 경로)
  if p_image_url is not null and p_image_url !~ '^https?://[^"''<>[:space:]]+$' then p_image_url := null; end if;

  insert into markets(question,description,category,image_url,created_by,close_at,market_type,
     pool_yes,pool_no,total_pool,is_jackpot,jackpot_bonus,min_stake,max_stake,rake_bps,status)
   values(trim(p_question),p_description,p_category,p_image_url,v_user,p_close_at,v_type,
     v_seed,v_seed, v_seed * (case when v_type='multi' then jsonb_array_length(p_outcomes) else 2 end),
     false,0,10,1000000,0,'open')
   returning id into v_id;

  if v_type='multi' then
    for oc in select * from jsonb_array_elements(p_outcomes) loop
      insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
      values (v_id, left(trim(oc->>'label'),30), v_n, v_seed, v_seed, v_seed, 0);
      v_n := v_n + 1;
    end loop;
  else
    insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
    values (v_id,'예',0,v_seed,v_seed,v_seed,0),(v_id,'아니오',1,v_seed,v_seed,v_seed,0);
  end if;
  return v_id;
end $function$;

-- ── 4) GC 충전 확정: 같은 충전을 동시에 두 번 확정하면 두 번 적립됐다 → 행 잠금 ──
create or replace function public.gc_charge_confirm(p_charge_id uuid, p_pg_provider text default null::text, p_pg_tx text default null::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c gc_charges%rowtype; v_bal int;
begin
  if not ((select auth.role())='service_role' or _is_admin()) then
    return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select * into c from gc_charges where id=p_charge_id for update;   -- 🔒 동시 확정 직렬화
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if c.status='paid' then return jsonb_build_object('ok',true,'already',true); end if;
  insert into gc_balances(user_id) values(c.user_id) on conflict (user_id) do nothing;
  update gc_balances set balance = balance + c.gc, updated_at=now() where user_id=c.user_id returning balance into v_bal;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (c.user_id, c.gc, 'gc:charge', c.id);
  update gc_charges
     set status='paid', paid_at=now(), pg_provider=p_pg_provider, pg_tx_id=p_pg_tx,
         expires_at = now() + interval '5 years'      -- ⏳ 유효기간 5년
   where id=p_charge_id;
  return jsonb_build_object('ok',true,'credited',c.gc,'balance',v_bal);
end $function$;

-- ── 5) 1회성 보너스: 동시 호출로 여러 번 받을 수 있었다 → 잔액 행 잠금 후 확인 ──
create or replace function public.claim_welcome_bonus()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_amt  int  := 500;
  v_bal  double precision;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  insert into point_balances(user_id) values (v_user) on conflict (user_id) do nothing;
  perform 1 from point_balances where user_id = v_user for update;   -- 🔒 동시 수령 직렬화

  if exists (
    select 1 from point_ledger
    where user_id = v_user and reason in ('welcome', 'referral:join', 'tour_bonus')
  ) then
    select balance + paid_balance into v_bal from point_balances where user_id = v_user;
    return jsonb_build_object('ok', true, 'already', true, 'amount', 0, 'balance', round(v_bal));
  end if;

  update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, v_amt, 'welcome');

  select balance + paid_balance into v_bal from point_balances where user_id = v_user;
  return jsonb_build_object('ok', true, 'already', false, 'amount', v_amt, 'balance', round(v_bal));
end $function$;

create or replace function public.claim_tour_bonus()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_amt  int  := 500;
  v_bal  double precision;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;

  insert into point_balances(user_id) values (v_user) on conflict (user_id) do nothing;
  perform 1 from point_balances where user_id = v_user for update;   -- 🔒 동시 수령 직렬화

  if exists (select 1 from point_ledger where user_id = v_user and reason = 'tour_bonus') then
    select balance + paid_balance into v_bal from point_balances where user_id = v_user;
    return jsonb_build_object('ok', true, 'already', true, 'amount', 0, 'balance', round(v_bal));
  end if;

  update point_balances set balance = balance + v_amt, updated_at = now() where user_id = v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, v_amt, 'tour_bonus');

  select balance + paid_balance into v_bal from point_balances where user_id = v_user;
  return jsonb_build_object('ok', true, 'already', false, 'amount', v_amt, 'balance', round(v_bal));
end $function$;

-- ── 6) 출금 신청: 동시 신청으로 정산 가능액보다 많이 신청할 수 있었다 → 유저별 잠금 ──
create or replace function public.request_withdrawal(p_amount integer, p_bank text, p_account text, p_holder text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_uid uuid := auth.uid(); v_avail int; v_ok boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  perform pg_advisory_xact_lock(hashtext('withdraw:' || v_uid::text));   -- 🔒 같은 유저 동시 신청 직렬화
  select coalesce(phone_verified, false) into v_ok from user_profiles where user_id = v_uid;
  if not coalesce(v_ok, false) then return jsonb_build_object('ok',false,'reason','need_phone'); end if;
  -- 최소 20만원(사장님 확정): 소액 정산은 PG 건당 비용이 수수료보다 커 정산마다 적자
  if p_amount is null or p_amount < 200000 then return jsonb_build_object('ok',false,'reason','min_200000','min',200000); end if;
  select (my_creator_earnings()->>'available')::int into v_avail;
  if v_avail < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','available',v_avail); end if;
  if coalesce(btrim(p_bank),'')='' or coalesce(btrim(p_account),'')='' or coalesce(btrim(p_holder),'')='' then
    return jsonb_build_object('ok',false,'reason','need_bank'); end if;
  insert into withdrawals(user_id, bank, account_number, holder, amount, status)
    values (v_uid, p_bank, p_account, p_holder, p_amount, 'pending');
  return jsonb_build_object('ok',true);
end $function$;

-- ── 7) 구독: 영수증 하나를 여러 계정에 적용 + 같은 영수증 재전송으로 sub_gc 무한 리필 ──
create or replace function public.apply_sub_purchase(p_user uuid, p_channel text, p_product text, p_ext_id text, p_expires timestamp with time zone default null::timestamp with time zone, p_auto_renew boolean default true)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_row sub_products; v_src text; v_exp timestamptz; v_res jsonb; v_old subscriptions%rowtype; v_grant boolean;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    return jsonb_build_object('ok',false,'reason','forbidden');
  end if;

  select * into v_row from sub_products
   where channel = p_channel and product_id = p_product and active;
  if v_row is null then
    -- 모르는 상품이면 등급을 짐작하지 않는다. 짐작이 곧 공짜 구독이다.
    return jsonb_build_object('ok',false,'reason','unknown_product','product',p_product);
  end if;

  -- 🔒 한 스토어 구독(ext_id)은 한 계정만. 다른 계정에 이미 묶여 있으면 거절
  if p_ext_id is not null then
    perform pg_advisory_xact_lock(hashtext('sub:' || p_ext_id));
    if exists (select 1 from subscriptions where ext_id = p_ext_id and user_id <> p_user) then
      return jsonb_build_object('ok',false,'reason','ext_in_use');
    end if;
  end if;

  v_src := case p_channel when 'ios' then 'ios_iap' else 'android_iap' end;
  -- 스토어가 만료일을 주면 그걸 쓴다(연장·체험 기간이 상품표와 다를 수 있다).
  v_exp := coalesce(p_expires, now() + make_interval(days => v_row.days));

  select * into v_old from subscriptions where user_id = p_user for update;
  -- 포함 GC 는 '새 결제'일 때만: 첫 구독, 다른 거래, 등급 변경, 또는 만료일이 실제로 늘어난 갱신.
  -- 같은 영수증을 다시 보내면 만료일이 그대로라 다시 채워 주지 않는다.
  v_grant := v_old.user_id is null
          or v_old.ext_id is distinct from p_ext_id
          or v_old.tier is distinct from v_row.tier
          or v_old.expires_at is null
          or v_exp > v_old.expires_at + interval '1 day';

  insert into subscriptions (user_id, tier, expires_at, source, ext_id, auto_renew,
                             state, renews_at, last_event, last_event_at)
  values (p_user, v_row.tier, v_exp, v_src, p_ext_id, coalesce(p_auto_renew,true),
          'active', v_exp, 'purchase', now())
  on conflict (user_id) do update set
    tier = excluded.tier,
    -- 남은 기간이 있으면 이어붙인다(중복결제 손해 방지) — 스토어 만료일이 더 뒤면 그걸 따른다
    expires_at = greatest(excluded.expires_at, subscriptions.expires_at),
    source = excluded.source, ext_id = coalesce(excluded.ext_id, subscriptions.ext_id),
    auto_renew = excluded.auto_renew, state = 'active',
    renews_at = excluded.renews_at, last_event = 'purchase', last_event_at = now(),
    updated_at = now();

  if v_grant then
    perform _gc_sub_grant(p_user, v_row.tier, (select expires_at from subscriptions where user_id = p_user));
  end if;

  select jsonb_build_object('ok',true,'tier',v_row.tier,'source',v_src,'credited',v_grant,
    'expires_at',(select expires_at from subscriptions where user_id = p_user))
    into v_res;
  return v_res;
end $function$;

-- ── 8) 네이버 로그인: 미인증 이메일 계정에 붙여 선점 가입자가 계정을 가져갈 수 있었다 ──
create or replace function public.auth_uid_by_confirmed_email(p_email text)
 returns uuid
 language sql
 security definer
 set search_path to 'public', 'auth'
as $function$
  select id from auth.users
   where lower(email) = lower(p_email) and email_confirmed_at is not null
   limit 1;
$function$;
revoke execute on function public.auth_uid_by_confirmed_email(text) from public, anon, authenticated;
grant execute on function public.auth_uid_by_confirmed_email(text) to service_role;
revoke execute on function public.auth_uid_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_uid_by_email(text) to service_role;
