-- =========================================================
-- 확산 우선 가격 — 구독 마진을 얇게. 무료는 그대로.
--
-- 사장님 결정: "컴패니언 마진을 확 낮춰 확산이 중요하니 / 무료는 늘리지마"
--
-- 지렛대는 하나만 쓴다 — AI 몫 상한 0.40 → 0.85
--   원래 40%는 인프라·마진에 60%를 남기려던 안전선인데, 갈라는 AI 말고 나가는 돈이
--   거의 없다(Supabase·Cloudflare·R2 고정비). 확산기에는 85%까지 열어도 선다.
--   ⚠️ 이 값을 안 올리고 요금만 내리면 최악이 된다 — model_for 가 원가 예산을
--      이 비율로 계산해서, 싸게 팔고 저가 모델로 다운그레이드해 주게 된다.
--
-- 값 (웹 기준. 인앱은 _charge_price 가 애플 가격표에 스냅한다)
--                   월 포함   웹      인앱     원가      실수령×85%   여유
--   가끔             300턴   ₩600   ₩1,100   ₩438      ₩495        12%
--   매일             900턴   ₩1,900 ₩3,000   ₩1,314    ₩1,567      19%
--   종일           2,400턴   ₩4,900 ₩7,000   ₩3,504    ₩4,040      15%
--   턴당 ₩1.46 실측(딥시크 청구서 대조, 캐시히트 97%).
--
--   직전 안(990/2,900/7,900)에서 인앱이 1,500/4,500/12,000 → 1,100/3,000/7,000 이 된다.
--   가끔은 애플 최저 가격대에 붙는다 — 그보다 싸게는 인앱에서 못 판다.
--
-- ⚠️ 최악 기준이다 — 포함량을 100% 소진해도 원가를 덮는다.
--    실제로 다 쓰는 사람은 드물고, 넘으면 종량으로 이어지고,
--    예산을 넘으면 저가 모델로 자동 다운그레이드된다. 방어가 셋이다.
--
-- 무료(150턴)는 건드리지 않는다. 확산을 무료로 사면 원가가 그대로 나가고,
-- 유료로 넘어올 이유도 같이 사라진다.
-- =========================================================

-- ── AI 몫 ────────────────────────────────────────────────
update app_settings set v = jsonb_set(v, '{ai_share}', '0.85'::jsonb) where k = 'ai_margin';

-- ── 요금·포함량 ──────────────────────────────────────────
update app_settings set v = jsonb_build_object(
  'guest', v -> 'guest',
  'free',  v -> 'free',                      -- 손대지 않는다
  'companion_sometimes', jsonb_set(
      jsonb_set(v -> 'companion_sometimes', '{monthly_turns}', '300'::jsonb),
      '{price}', '600'::jsonb),
  'companion_daily', jsonb_set(
      jsonb_set(v -> 'companion_daily', '{monthly_turns}', '900'::jsonb),
      '{price}', '1900'::jsonb),
  'companion_always', jsonb_set(
      jsonb_set(v -> 'companion_always', '{monthly_turns}', '2400'::jsonb),
      '{price}', '4900'::jsonb)
) where k = 'ai_tiers';

-- ── GC 단가 — 창작을 1/12 로 ─────────────────────────────
-- 지금 릴스 한 편에 script 200 + video 1000 = 1,200 GC 를 받는데 실원가는 ₩13.5 다.
-- Shotstack 추정 ₩200 시절에 5배로 잡은 값인데, 자체 워커로 옮기며 원가가 15배 떨어졌다.
-- 편당 100 GC(=₩100) 로 내린다 — 그래도 원가의 7.4배다.
update public.gc_prices set gc = 20, cost_krw = 1.64,
       cost_basis = 'DeepSeek chat 실측 ₩1.64/턴 × 수 턴', updated_at = now() where item = 'script';
update public.gc_prices set gc = 80, cost_krw = 13.50,
       cost_basis = '자체 워커 실측 — 첫 제작 ₩13.5(TTS 73%) · 재렌더 ₩0.9 · 승인 후 편집 ₩0',
       updated_at = now() where item = 'video';
update public.gc_prices set gc = 60,  updated_at = now() where item = 'thumbnail';
update public.gc_prices set gc = 10,  updated_at = now() where item = 'titles';
update public.gc_prices set gc = 150, updated_at = now() where item = 'sticker';
update public.gc_prices set gc = 500, updated_at = now() where item = 'sticker_set';

-- 대화 초과분 — 가장 싼 단의 실효 단가(₩2.0/턴)보다 비싸야 한다.
-- 초과가 더 싸면 아무도 큰 단을 사지 않는다.
update public.gc_prices set gc = 4, active = true, updated_at = now() where item = 'chat_turn';

-- 릴스 건당(새 경로용) · 이미지 생성. 영상 생성은 실원가를 못 재서 계속 잠금.
update public.gc_prices set gc = 100, active = true, updated_at = now() where item = 'reel';
update public.gc_prices set gc = 30,  active = true, updated_at = now() where item = 'gen_image';

-- ── 가드 ─────────────────────────────────────────────────
do $$
declare
  v_share numeric; v_free int; r record;
begin
  select (v ->> 'ai_share')::numeric into v_share from app_settings where k = 'ai_margin';
  if v_share < 0.80 then
    raise exception 'AI 몫이 안 올라갔다 — 싸게 팔고 저가 모델을 주게 된다 (%)', v_share;
  end if;

  -- 요금이 포함량 원가를 덮는가(최악 기준). 턴당 ₩1.46.
  for r in
    select t.tier,
           (a.v -> t.tier ->> 'price')::int          as price,
           (a.v -> t.tier ->> 'monthly_turns')::int  as turns
      from app_settings a
      cross join (select unnest(array['companion_sometimes','companion_daily','companion_always']) tier) t
     where a.k = 'ai_tiers'
  loop
    if r.price is null or r.turns is null then
      raise exception '% 의 요금 또는 포함량이 비어 있다', r.tier;
    end if;
    if r.price * 0.97 * v_share < r.turns * 1.46 then
      raise exception '% 요금이 포함량 원가를 못 덮는다 (요금 %, 포함 %턴)', r.tier, r.price, r.turns;
    end if;
  end loop;

  -- 무료를 건드리지 않았는지 확인 — 확산을 무료로 사면 원가가 그대로 나간다
  select (v -> 'free' ->> 'monthly_turns')::int into v_free from app_settings where k = 'ai_tiers';
  if v_free <> 150 then raise exception '무료 한도가 바뀌었다 (%)', v_free; end if;

  if (select gc from gc_prices where item = 'chat_turn') <= 2 then
    raise exception '대화 초과 단가가 구독 실효 단가보다 싸다 — 아무도 큰 단을 안 산다';
  end if;
end $$;
