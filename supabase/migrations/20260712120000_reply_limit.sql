-- 배틀 댓글 제한 정비
--  ① 침투 3/일 트리거가 침투권(infiltrate_pass) 사용분을 반영하도록 수정(버그)
--  ② 대댓글 하루 40회 제한 + 대댓글 연장권(reply_pass, +15/회) 트리거
--  ③ reply_status() 조회 RPC + use_reply_pass() + 상점 가격 추가
-- 원칙: 최상위 아군 '참전' 댓글은 무제한(핵심 참여), 침투·대댓글만 제한/과금.

-- ── ① 침투 트리거: 침투권 반영 ──
create or replace function public.check_infiltration()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_vote text; v_used int; v_extra int;
  c_limit constant int := 3;
begin
  if new.parent_id is not null then return new; end if;
  select type into v_vote from votes
    where issue_id = new.issue_id and user_id = new.user_id limit 1;
  if v_vote is null or v_vote not in ('pro','con') then return new; end if;
  if new.faction = v_vote then return new; end if;

  select count(*) into v_used
    from comments c
    join votes v on v.issue_id = c.issue_id and v.user_id = c.user_id
   where c.user_id = new.user_id and c.parent_id is null
     and c.faction <> v.type and c.created_at >= date_trunc('day', now());

  select count(*) into v_extra
    from item_uses
   where user_id = new.user_id and item_key = 'infiltrate_pass'
     and used_at >= date_trunc('day', now());

  if v_used >= c_limit + coalesce(v_extra,0) then
    raise exception 'infiltration_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- ── ② 대댓글 하루 한도 트리거 ──
create or replace function public.check_reply_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_used int; v_extra int;
  c_base constant int := 40;
  c_bonus constant int := 15;
begin
  if new.parent_id is null then return new; end if;  -- 최상위 댓글은 대상 아님

  select count(*) into v_used
    from comments
   where user_id = new.user_id and parent_id is not null
     and created_at >= date_trunc('day', now());

  select count(*) into v_extra
    from item_uses
   where user_id = new.user_id and item_key = 'reply_pass'
     and used_at >= date_trunc('day', now());

  if v_used >= c_base + coalesce(v_extra,0) * c_bonus then
    raise exception 'reply_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists trg_check_reply_limit on public.comments;
create trigger trg_check_reply_limit before insert on public.comments
  for each row execute function public.check_reply_limit();

-- ── ③ 대댓글 남은 횟수 조회 ──
create or replace function public.reply_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_used int; v_extra int;
  c_base constant int := 40; c_bonus constant int := 15;
begin
  if v_user is null then return jsonb_build_object('used',0,'max',c_base,'left',c_base); end if;
  select count(*) into v_used from comments
    where user_id = v_user and parent_id is not null and created_at >= date_trunc('day', now());
  select count(*) into v_extra from item_uses
    where user_id = v_user and item_key = 'reply_pass' and used_at >= date_trunc('day', now());
  return jsonb_build_object(
    'used', v_used,
    'max',  c_base + coalesce(v_extra,0) * c_bonus,
    'left', greatest(0, c_base + coalesce(v_extra,0) * c_bonus - v_used));
end $$;

-- 대댓글 연장권 사용 (침투권과 동일 패턴)
create or replace function public.use_reply_pass()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if not _consume_item(v_user, 'reply_pass') then
    return jsonb_build_object('ok', false, 'reason', 'no_item');
  end if;
  return jsonb_build_object('ok', true);
end $$;

-- 상점 가격에 reply_pass 추가
create or replace function public._item_price(p_key text)
returns int language sql immutable as $$
  select case p_key
    when 'cooldown_reset'  then 300
    when 'infiltrate_pass' then 500
    when 'revive'          then 800
    when 'emoticon_pack'   then 1000
    when 'nick_deco'       then 1500
    when 'duel_ticket'     then 700
    when 'reply_pass'      then 300
    else null end;
$$;
