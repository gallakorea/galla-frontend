-- 👻 유령 모드 — 계정 익명 폐지, 기간제 유령권 아이템. 댓글만 적용.
--  · 유저당 고정 페르소나(ghost_seed) — 이름·아바타는 클라 GALLA_ghost(seed)가 결정적 생성
--  · 유령권(ghost_until) 사는 동안 댓글 유령, 만료 뒤에도 그때 단 댓글은 is_anonymous로 영구 유령

alter table public.user_profiles
  add column if not exists ghost_seed text,
  add column if not exists ghost_until timestamptz;

alter table public.comments add column if not exists ghost_seed text;
alter table public.plaza_comments
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists ghost_seed text;

-- 유령 시드 보장(최초 1회 랜덤·고정)
create or replace function public._ensure_ghost_seed(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  select ghost_seed into v from user_profiles where user_id=p_user;
  if v is null or v='' then
    v := substr(md5(random()::text || p_user::text || clock_timestamp()::text), 1, 12);
    insert into user_profiles(user_id, ghost_seed) values (p_user, v)
      on conflict (user_id) do update set ghost_seed=excluded.ghost_seed where user_profiles.ghost_seed is null;
    select ghost_seed into v from user_profiles where user_id=p_user;  -- 경합 시 확정값
  end if;
  return v;
end $$;

-- BEFORE INSERT: is_anonymous면 유령권 필수 + seed 강제 주입(클라 위조 차단)
create or replace function public._enforce_ghost()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_until timestamptz;
begin
  if coalesce(NEW.is_anonymous,false) then
    if NEW.user_id is null or NEW.user_id <> auth.uid() then
      -- 봇/서비스롤 삽입(레거시·이관)은 통과
      if auth.uid() is not null then raise exception 'ghost_not_owner'; end if;
      return NEW;
    end if;
    select ghost_until into v_until from user_profiles where user_id=auth.uid();
    if v_until is null or v_until <= now() then
      raise exception 'no_ghost_pass' using errcode='P0001';
    end if;
    NEW.ghost_seed := _ensure_ghost_seed(auth.uid());   -- 항상 본인 시드로 고정
  end if;
  return NEW;
end $$;

drop trigger if exists trg_enforce_ghost_comments on public.comments;
create trigger trg_enforce_ghost_comments before insert on public.comments
  for each row execute function public._enforce_ghost();
drop trigger if exists trg_enforce_ghost_plaza on public.plaza_comments;
create trigger trg_enforce_ghost_plaza before insert on public.plaza_comments
  for each row execute function public._enforce_ghost();

-- 컴포저용 상태
create or replace function public.ghost_status()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_until timestamptz; v_seed text;
begin
  if auth.uid() is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select ghost_until, ghost_seed into v_until, v_seed from user_profiles where user_id=auth.uid();
  return jsonb_build_object('ok',true,'active', (v_until is not null and v_until>now()),
    'until', v_until, 'seed', v_seed);
end $$;

-- 유령권 구매(기간제) — 소각형이라 _gp_spend(유료 우선)
create or replace function public.buy_ghost_pass(p_days int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cost int; v_bal double precision; v_seed text; v_until timestamptz;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_days = 3 then v_cost := 800;
  elsif p_days = 7 then v_cost := 1500;
  elsif p_days = 30 then v_cost := 4500;
  else return jsonb_build_object('ok',false,'reason','bad_days'); end if;

  v_bal := _gp_spend(v_user, v_cost);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient',
      'balance', coalesce((select balance+paid_balance from point_balances where user_id=v_user),0), 'cost', v_cost); end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_cost, 'ghost_pass:'||p_days);

  v_seed := _ensure_ghost_seed(v_user);
  update user_profiles
    set ghost_until = greatest(coalesce(ghost_until, now()), now()) + make_interval(days=>p_days)
    where user_id=v_user returning ghost_until into v_until;
  return jsonb_build_object('ok',true,'until',v_until,'seed',v_seed,'balance',v_bal);
end $$;

revoke all on function public._ensure_ghost_seed(uuid) from public, anon, authenticated;
revoke all on function public._enforce_ghost() from public, anon, authenticated;
grant execute on function public.ghost_status() to authenticated;
grant execute on function public.buy_ghost_pass(int) to authenticated;
