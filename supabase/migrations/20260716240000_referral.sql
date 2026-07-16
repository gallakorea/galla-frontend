-- =========================================================
-- 친구 초대(추천인) 루프 (2026-07-16) — 성장 엔진
-- 링크: https://galla.im/?ref=<code> → 클라가 localStorage 보관 →
-- 첫 로그인 세션에서 apply_referral(code) 1회 적용.
-- 보상(무료 GP): 초대한 사람 +1000 / 가입한 사람 +500.
-- 남용방지: 신규(가입 7일 내)만, 1회, 자기초대 불가, 초대자 하루 10건 보상 캡.
-- =========================================================

alter table public.user_profiles
  add column if not exists ref_code text unique,
  add column if not exists referred_by uuid;

-- 내 초대 코드 조회(없으면 생성) — 6자리 대문자+숫자, 충돌 시 재시도
create or replace function public.my_ref_code()
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_code text; i int := 0;
begin
  if v_uid is null then return null; end if;
  select ref_code into v_code from user_profiles where user_id = v_uid;
  if v_code is not null then return v_code; end if;
  loop
    i := i + 1;
    -- 혼동 문자(0/O/1/I/L) 제거한 코드 (md5 → 안전문자 치환, pgcrypto 불요)
    v_code := upper(substr(translate(md5(random()::text || clock_timestamp()::text),'01il5soab','WXYZQKMNP'),1,6));
    begin
      update user_profiles set ref_code = v_code where user_id = v_uid and ref_code is null;
      if found then return v_code; end if;
      select ref_code into v_code from user_profiles where user_id = v_uid;  -- 동시성: 남이 먼저 채움
      return v_code;
    exception when unique_violation then
      if i > 8 then raise; end if;  -- 재시도
    end;
  end loop;
end $$;

-- 추천 적용 — 신규 유저의 첫 세션에서 1회 호출
create or replace function public.apply_referral(p_code text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_inviter uuid;
  v_created timestamptz;
  v_already uuid;
  v_today int;
  c_invitee_gp constant int := 500;
  c_inviter_gp constant int := 1000;
  c_daily_cap constant int := 10;  -- 초대자 하루 보상 건수 캡
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_code),'')='' then return jsonb_build_object('ok',false,'reason','no_code'); end if;

  select referred_by into v_already from user_profiles where user_id = v_uid;
  if v_already is not null then return jsonb_build_object('ok',false,'reason','already'); end if;

  select user_id into v_inviter from user_profiles where ref_code = upper(btrim(p_code));
  if v_inviter is null then return jsonb_build_object('ok',false,'reason','bad_code'); end if;
  if v_inviter = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  select created_at into v_created from auth.users where id = v_uid;
  if v_created is null or v_created < now() - interval '7 days' then
    return jsonb_build_object('ok',false,'reason','not_new');  -- 신규 가입자만
  end if;

  update user_profiles set referred_by = v_inviter where user_id = v_uid and referred_by is null;
  if not found then return jsonb_build_object('ok',false,'reason','already'); end if;

  -- 가입자 보상 +500
  insert into point_balances(user_id, balance) values (v_uid, c_invitee_gp)
    on conflict (user_id) do update set balance = point_balances.balance + c_invitee_gp, updated_at = now();
  insert into point_ledger(user_id, delta, reason) values (v_uid, c_invitee_gp, 'referral:join');

  -- 초대자 보상 +1000 (하루 캡)
  select count(*) into v_today from point_ledger
   where user_id = v_inviter and reason = 'referral:invite'
     and created_at >= (date_trunc('day', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul');
  if v_today < c_daily_cap then
    insert into point_balances(user_id, balance) values (v_inviter, c_inviter_gp)
      on conflict (user_id) do update set balance = point_balances.balance + c_inviter_gp, updated_at = now();
    insert into point_ledger(user_id, delta, reason) values (v_inviter, c_inviter_gp, 'referral:invite');
    -- 초대자에게 알림 (실패해도 추천 적용은 유지)
    begin
      insert into notifications(user_id, type, message, link)
      values (v_inviter, 'referral', '🎉 친구가 내 초대로 갈라에 가입했어요! +'||c_inviter_gp||' GP', 'quest.html');
    exception when others then null; end;
  end if;

  return jsonb_build_object('ok',true,'invitee_gp',c_invitee_gp);
end $$;

revoke all on function public.my_ref_code() from public, anon;
revoke all on function public.apply_referral(text) from public, anon;
grant execute on function public.my_ref_code() to authenticated;
grant execute on function public.apply_referral(text) to authenticated;

-- 초대 실적 조회(초대한 수·받은 GP)
create or replace function public.my_referral_stats()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'invited', (select count(*) from user_profiles where referred_by = auth.uid()),
    'gp', (select coalesce(sum(delta),0) from point_ledger where user_id = auth.uid() and reason = 'referral:invite')
  );
$$;
revoke all on function public.my_referral_stats() from public, anon;
grant execute on function public.my_referral_stats() to authenticated;
