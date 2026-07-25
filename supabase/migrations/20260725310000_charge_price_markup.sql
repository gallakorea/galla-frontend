-- 충전 구조 재설계 (사장님 결정: "1만원 냈는데 7,000 GC 쌓이는 게 문제" → "가격 올려서 판매")
--
-- 직전 마이그레이션(charge_fee_net)은 '코인 개수'에서 수수료를 깎았다 → 10,000원에 7,000 GC.
-- 사용자에겐 어정쩡한 숫자라 최악의 UX였다. 업계 표준(스포티파이·틴더·유튜브)은 반대다:
--   ▸ 코인은 항상 1개 = 1원으로 깔끔하게 준다.
--   ▸ 스토어 수수료는 '낸 가격'에서 회수한다 = 인앱에서는 같은 코인을 더 비싸게 판다.
--   ▸ "웹에서 사면 더 쌉니다" 안내로 웹 결제를 유도한다.
--
-- 계산
--   base = 패키지 액면가(= 지급 코인, gc_packages.krw). 코인은 항상 base 그대로 준다.
--   fee  = 채널 스토어 수수료율(app_settings.charge_fees). 웹은 0(=마진에서 흡수), 인앱 0.30.
--   판매가 price = base / (1 − fee)를 100원 단위로 올림. 웹은 price = base.
--   → 플랫폼이 스토어에 fee를 떼여도 손에 쥐는 현금 = price×(1−fee) ≥ base.
--     그 base(순액)에 20/5/75를 적용하므로 채널 무관 플랫폼 20% 확보.
--   예) 웹   10,000 GC = 10,000원, 플랫폼 현금 10,000(−PG 3%는 20% 마진서 흡수)
--       인앱 10,000 GC = 14,300원(애플 30% 떼면 10,010 현금), 코인은 동일하게 10,000
--
-- gc_charges 컬럼(전 마이그레이션에서 추가): channel 유지, fee = '판매가 − base'(마크업 금액)로 의미 변경.

-- 웹은 코인·가격 모두 1:1(PG 3%는 정산 시 플랫폼 마진서 흡수, 현재 PG 미연동이라 미모델)
update app_settings
   set v = jsonb_set(v, '{web}', '0'::jsonb)
 where k = 'charge_fees';

-- 판매가 계산: base를 채널 수수료만큼 웃돈 붙여 100원 단위로 올림
create or replace function _charge_price(p_base int, p_channel text)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_rate numeric := _charge_fee_rate(p_channel);
begin
  if v_rate <= 0 then return p_base; end if;               -- 웹 등: 마크업 없음
  return (ceil( (p_base::numeric / (1 - v_rate)) / 100 ) * 100)::int;
end $$;

-- 충전 시작 — 코인은 액면가(round) 그대로, 가격만 채널별로 다르게
create or replace function gc_charge_begin(p_key text, p_channel text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p gc_packages%rowtype;
  v_id uuid; v_ch text; v_base int; v_price int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into p from gc_packages where key = p_key and active;
  if p.key is null then return jsonb_build_object('ok',false,'reason','bad_package'); end if;

  v_ch := lower(coalesce(nullif(btrim(p_channel), ''), 'web'));
  v_base := p.krw;                       -- 액면가 = 지급 코인(1:1)
  v_price := _charge_price(v_base, v_ch); -- 실제 결제 금액(인앱이면 웃돈)

  -- krw = 결제 금액(가격), gc = 지급 코인(round), fee = 마크업 금액
  insert into gc_charges(user_id, pkg, krw, gc, status, channel, fee)
    values (v_uid, p.key, v_price, v_base, 'pending', v_ch, v_price - v_base)
    returning id into v_id;

  return jsonb_build_object('ok',true,'charge_id',v_id,
    'krw',v_price, 'gc',v_base, 'base',v_base, 'markup',v_price - v_base, 'channel',v_ch);
end $$;

grant execute on function gc_charge_begin(text, text) to authenticated;

-- 패키지 목록 — 코인은 액면가, 가격은 채널별. 화면이 "10,000 GC = 앱 14,300원 / 웹 10,000원" 비교 가능.
create or replace function gc_charge_packages(p_channel text default 'web')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_ch text := lower(coalesce(nullif(btrim(p_channel),''),'web'));
begin
  return jsonb_build_object(
    'ok', true,
    'channel', v_ch,
    'fee_rate', _charge_fee_rate(v_ch),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', key,
               'gc',  krw,                          -- 지급 코인(액면가, 1:1)
               'krw', _charge_price(krw, v_ch),      -- 이 채널 결제가
               'web_krw', krw,                       -- 웹 기준가(비교용)
               'label', label)
             order by sort)
      from gc_packages where active
    ), '[]'::jsonb)
  );
end $$;

grant execute on function gc_charge_packages(text) to anon, authenticated;
