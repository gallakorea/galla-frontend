-- =========================================================
-- GC 가격표 단일화 — 세 군데 흩어져 있던 값을 한 표로
--
-- 문제: 가격이 세 곳에 있었고 서로 달랐다.
--   app_settings.ai_creation     (실사용) thumbnail 200 · video 1000 · script 0 · titles 0
--   app_settings.ai_sticker      (실사용) price 500 · set_price 1500  (+ quality/daily_limit)
--   app_settings.ai_alacarte_gc  (죽음)  thumbnail 120 · video 1200 · sticker 80 · titles 40 …
--
--   ai_alacarte_gc 는 20260808240000 에서 만들어졌지만 읽는 코드가 없다(grep 확인).
--   그런데 더 자세하고 최신처럼 보여서, 다음 사람이 그걸 진짜 가격표로 착각하기 딱 좋다.
--   실제로 썸네일은 200 vs 120, 스티커는 500 vs 80으로 6배 차이가 난다.
--
-- 해결: gc_prices 한 표가 진실. 두 과금 함수가 여기서 읽는다.
--   가격뿐 아니라 '원가 근거'(cost_krw)를 같이 적는다 — 마진을 눈으로 볼 수 있어야
--   다음에 가격을 만질 때 감으로 정하지 않는다.
--
-- ⚠️ cost_krw 는 확정치가 아니라 근거가 있는 추정이다.
--    · 채팅: ai_spend 실측 (galla-friend 4,154콜 평균 $0.001186 = ₩1.64/턴)
--    · 썸네일: Cloudflare Workers AI FLUX-1-schnell (기존 CF 인프라, 사실상 0)
--              단 얼굴/제품 편집 경로만 OpenAI gpt-image-1 edits 로 폴백 → 그때가 비싸다
--    · 스티커: OpenAI gpt-image-1 (quality=medium)
--    · 영상:   Shotstack Edit API 렌더
--    공급자 청구서가 나오면 update 해서 실측으로 바꿀 것.
--
-- quality / daily_limit 은 가격이 아니므로 app_settings.ai_sticker 에 그대로 둔다.
-- =========================================================

create table if not exists public.gc_prices (
  item        text primary key,
  gc          integer not null check (gc >= 0),
  cost_krw    numeric(10,2),            -- 우리 원가(추정 또는 실측). null = 아직 미측정
  cost_basis  text,                     -- 원가 근거 한 줄
  label       text,
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table public.gc_prices enable row level security;
drop policy if exists gc_prices_read on public.gc_prices;
create policy gc_prices_read on public.gc_prices for select using (true);
grant select on public.gc_prices to anon, authenticated;

comment on table public.gc_prices is
  'GC로 사는 것들의 단일 가격표. ai_creation_charge / ai_sticker_charge 가 여기서 읽는다. cost_krw 는 마진 확인용 원가 근거 — 공급자 청구서 나오면 실측으로 갱신할 것.';

-- 현재 "실제로 과금되던" 값을 그대로 옮긴다(가격 변경 아님 — 통합만).
-- 가격을 바꾸는 건 사장님 결정이라 여기서 임의로 손대지 않는다.
insert into public.gc_prices(item, gc, cost_krw, cost_basis, label) values
  ('thumbnail',   200,   5.00, 'CF Workers AI FLUX-1-schnell(기존 인프라, 사실상 0). 얼굴·제품 편집 경로만 OpenAI gpt-image-1 edits 폴백 → 그 경로는 훨씬 비쌈', 'AI 썸네일'),
  ('video',      1000, 200.00, 'Shotstack Edit API 렌더 1건 (청구서 확인 전 추정)', 'AI 영상'),
  ('script',        0,   1.64, 'DeepSeek chat — ai_spend 실측 ₩1.64/턴 × 수 턴', 'AI 대본'),
  ('titles',        0,   1.64, 'DeepSeek chat — ai_spend 실측 ₩1.64/턴', 'AI 제목'),
  ('sticker',     500,  55.00, 'OpenAI gpt-image-1 quality=medium 1장 (청구서 확인 전 추정)', 'AI 스티커 1장'),
  ('sticker_set',1500, 220.00, 'OpenAI gpt-image-1 medium 4장', 'AI 스티커 4장')
on conflict (item) do nothing;

-- ---------------------------------------------------------
-- 과금 함수를 단일 가격표로 연결
--   ⚠️ 가격표에 행이 없으면 과금하지 않고 실패시킨다.
--      0원으로 흘려보내면 원가만 나가는 무료 제공이 되어버린다.
-- ---------------------------------------------------------
create or replace function public.ai_creation_charge(p_kind text, p_n integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_unit int; v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;

  select gc into v_unit from gc_prices where item = p_kind and active;
  if v_unit is null then
    return jsonb_build_object('ok',false,'reason','no_price','item',p_kind);
  end if;

  v_price := v_unit * greatest(1, coalesce(p_n,1));
  if v_price <= 0 then return jsonb_build_object('ok',true,'charged',0); end if;

  -- _gc_spend 를 쓴다 — 잔액을 직접 깎으면 환불 에스크로(held) 같은 공통 규칙을 놓친다
  v_bal := _gc_spend(v_user, v_price, 'ai_creation:' || p_kind);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
  end if;
  return jsonb_build_object('ok',true,'charged',v_price,'currency','GC','balance',v_bal);
end $$;

create or replace function public.ai_sticker_charge(p_count integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_cfg jsonb; v_price int; v_today int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_count not in (1,4) then return jsonb_build_object('ok',false,'reason','bad_count'); end if;

  select gc into v_price from gc_prices
   where item = case when p_count = 1 then 'sticker' else 'sticker_set' end and active;
  if v_price is null then return jsonb_build_object('ok',false,'reason','no_price'); end if;

  -- quality / daily_limit 은 가격이 아니라 운영 파라미터 — 여기 그대로 둔다
  select v into v_cfg from app_settings where k = 'ai_sticker';
  select count(*) into v_today from my_stickers
   where user_id = v_user and created_at > now() - interval '24 hours';
  if v_today + p_count > (v_cfg->>'daily_limit')::int then
    return jsonb_build_object('ok',false,'reason','daily_limit','limit',(v_cfg->>'daily_limit')::int);
  end if;

  v_bal := _gc_spend(v_user, v_price, 'ai_sticker:x' || p_count);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id = v_user),0));
  end if;
  return jsonb_build_object('ok',true,'charged',v_price,'balance',v_bal,'quality',v_cfg->>'quality');
end $$;

-- ---------------------------------------------------------
-- 마진 한눈에 — 채널 실수령까지 반영한다.
--   GC 액면은 1원이지만 우리가 실제로 손에 쥐는 건 그보다 적다:
--     웹  = 부가세 10% + PG 3%  → GC당 약 0.88원
--     IAP = 부가세 10% + 스토어 수수료(마크업으로 상쇄) → GC당 약 0.93~0.96원
--   가장 박한 웹 기준으로 봐야 안전하다.
-- ---------------------------------------------------------
create or replace view public.gc_price_margin as
select
  p.item, p.label, p.gc,
  round(p.gc * 0.88, 1)                                   as net_krw_web,
  p.cost_krw,
  case when coalesce(p.cost_krw,0) > 0
       then round((p.gc * 0.88) / p.cost_krw, 1) end      as margin_x,
  case when coalesce(p.cost_krw,0) > 0
       then round(p.gc * 0.88 - p.cost_krw, 1) end        as profit_krw,
  p.cost_basis, p.active
from gc_prices p
order by p.gc desc;

grant select on public.gc_price_margin to authenticated;
comment on view public.gc_price_margin is
  '항목별 마진 — 가장 박한 채널(웹, GC당 0.88원) 기준. margin_x 가 1 미만이면 팔수록 손해다.';

-- ---------------------------------------------------------
-- 죽은 설정 제거 — 남겨두면 다음 사람이 진짜 가격표로 착각한다
-- ---------------------------------------------------------
delete from public.app_settings where k = 'ai_alacarte_gc';

-- 옛 가격 키는 이제 아무도 안 읽는다. 지우지 않고 표식만 남긴다(되돌릴 때 원본 확인용).
update public.app_settings
   set v = v || jsonb_build_object('_moved_to', 'gc_prices 테이블 (20260811170000)')
 where k = 'ai_creation';
update public.app_settings
   set v = v || jsonb_build_object('_price_moved_to', 'gc_prices 테이블 (20260811170000) — quality/daily_limit 만 여기서 읽음')
 where k = 'ai_sticker';
