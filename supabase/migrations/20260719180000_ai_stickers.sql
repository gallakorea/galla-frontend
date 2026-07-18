-- ═══════════════════════════════════════════════════════════════
-- 🎨 나만의 이모티콘 (AI 생성) — 유료 아이템
--
-- 왜 유료인가: 장당 실제 원가(OpenAI)가 발생한다. 그리고 이건 사행성이 아니라
-- 순수 아이템 판매라 유료 충전 GP를 써도 법적으로 깨끗하다([[galla-monetization]]의
-- '유료 GP는 예측·일기토 투입 불가' 원칙에 걸리지 않는다). GP 소각처로도 이상적.
--
-- 돈 흐름: 생성 요청 → GP 선차감(ai_sticker_charge) → 이미지 생성 →
--          성공하면 그대로, 실패하면 ai_sticker_refund로 되돌린다.
--          '차감했는데 그림이 안 나오는' 상황을 만들지 않는 게 핵심.
-- ═══════════════════════════════════════════════════════════════

-- 가격·품질은 코드 배포 없이 바꿀 수 있어야 한다(운영이 시장 보고 조정)
create table if not exists public.app_settings (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
-- 가격표는 공개(클라가 버튼에 표시해야 한다) — 쓰기는 서비스 롤만
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (true);
grant select on public.app_settings to authenticated;

insert into public.app_settings(k, v) values
  ('ai_sticker', jsonb_build_object(
     'price', 500,          -- 1장 생성 가격(GP)
     'set_price', 1500,     -- 세트(4장) 가격
     'quality', 'medium',   -- low | medium | high  (원가: 약 15 / 60 / 240원)
     'daily_limit', 20      -- 유저당 하루 생성 상한(비용 폭주 차단)
   ))
on conflict (k) do nothing;

-- 내가 만든 이모티콘
create table if not exists public.my_stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  url text not null,
  prompt text not null default '',
  set_id uuid,                       -- 세트로 뽑은 것들을 묶는다(같은 캐릭터 표정 모음)
  is_public boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_my_stickers_user on public.my_stickers(user_id, created_at desc);
alter table public.my_stickers enable row level security;
drop policy if exists my_stickers_own on public.my_stickers;
create policy my_stickers_own on public.my_stickers for select to authenticated
  using (user_id = auth.uid() or is_public);
drop policy if exists my_stickers_del on public.my_stickers;
create policy my_stickers_del on public.my_stickers for delete to authenticated
  using (user_id = auth.uid());
drop policy if exists my_stickers_upd on public.my_stickers;
create policy my_stickers_upd on public.my_stickers for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, delete on public.my_stickers to authenticated;
grant update (is_public) on public.my_stickers to authenticated;
-- ⚠️ INSERT 권한은 주지 않는다 — 생성은 반드시 엣지 함수(서비스 롤)를 거쳐야
--    GP 차감·검열을 우회할 수 없다.

-- ── 선차감: 한도 확인 + GP 차감을 한 트랜잭션에 ──
create or replace function public.ai_sticker_charge(p_count int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_cfg jsonb; v_price int; v_today int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_count not in (1, 4) then return jsonb_build_object('ok', false, 'reason', 'bad_count'); end if;
  select v into v_cfg from app_settings where k = 'ai_sticker';
  v_price := case when p_count = 1 then (v_cfg->>'price')::int else (v_cfg->>'set_price')::int end;

  select count(*) into v_today from my_stickers
   where user_id = v_user and created_at > now() - interval '24 hours';
  if v_today + p_count > (v_cfg->>'daily_limit')::int then
    return jsonb_build_object('ok', false, 'reason', 'daily_limit', 'limit', (v_cfg->>'daily_limit')::int);
  end if;

  v_bal := _gp_spend(v_user, v_price);
  if v_bal is null then
    return jsonb_build_object('ok', false, 'reason', 'insufficient', 'cost', v_price,
      'balance', (select balance + paid_balance from point_balances where user_id = v_user));
  end if;
  insert into point_ledger(user_id, delta, reason) values (v_user, -v_price, 'ai_sticker:x' || p_count);
  return jsonb_build_object('ok', true, 'charged', v_price, 'balance', v_bal,
                            'quality', v_cfg->>'quality');
end $$;
grant execute on function public.ai_sticker_charge(int) to authenticated;

-- ── 환불: 생성 실패 시. 서비스 롤(엣지 함수)만 호출한다 ──
create or replace function public.ai_sticker_refund(p_user uuid, p_amount int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  -- 환불은 무상 GP로 돌려준다(유료 충전분 되살리기는 결제 정합성이 복잡해진다)
  update point_balances set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  insert into point_ledger(user_id, delta, reason) values (p_user, p_amount, 'ai_sticker:refund');
end $$;
revoke all on function public.ai_sticker_refund(uuid, int) from authenticated, anon;
