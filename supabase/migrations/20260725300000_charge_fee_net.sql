-- 충전 단계에서 결제 수수료를 차감한다 (사장님 결정: "수수료는 제외하고 나눠야지")
--
-- 왜 바꾸는가 — 기존 구조는 플랫폼이 결제 수수료를 전부 떠안았다:
--   gc_packages가 1원 = 1GC로 깎지 않고 적립하고, gc_donate가 GC '총액'에 20/5/75를 곱했다.
--   웹 카드(3%)는 플랫폼 몫 2,000원에서 300원을 부담해 1,700원이 남지만,
--   애플·구글 인앱(30%)이면 2,000원 몫에 3,000원 수수료 = 후원 한 건당 1,000원 적자였다.
--   후원이 늘수록 손실이 커지는 구조라 유지할 수 없다.
--
-- 어떻게 바꾸는가 — GC를 '플랫폼이 실제로 손에 쥔 현금'과 1:1로 맞춘다:
--   충전 시 적립 GC = 결제액 × (1 − 채널 수수료율)
--   예) 웹 10,000원 → 9,700 GC / 인앱 10,000원 → 7,000 GC
--   그 뒤 후원 배분(20/5/75)은 손대지 않는다. GC 자체가 이미 순액이므로
--   자동으로 '수수료 빼고 나누는' 결과가 되고, 수수료는 세 몫이 비율대로 함께 부담한다.
--   결과: 채널이 무엇이든 플랫폼은 순액의 20%를 남기고 적자가 나지 않는다.
--     웹   10,000원 → 현금 9,700 = 창작자 7,275 + 자선 485 + 플랫폼 1,940
--     인앱 10,000원 → 현금 7,000 = 창작자 5,250 + 자선 350 + 플랫폼 1,400
--
-- 참고: 한국은 2021년 전기통신사업법 개정으로 앱마켓이 인앱결제를 강제할 수 없다.
--       즉 웹 충전(수수료 3%)을 함께 제공할 수 있고, 그쪽이 후원자에게 더 유리하다.

alter table gc_charges add column if not exists channel text not null default 'web';
alter table gc_charges add column if not exists fee int not null default 0;

insert into app_settings (k, v)
values ('charge_fees', jsonb_build_object(
  'web',      0.03,   -- 국내 카드 PG 통상 요율
  'ios',      0.30,   -- 애플 인앱
  'android',  0.30,   -- 구글 인앱
  '_default', 0.03
))
on conflict (k) do nothing;

-- 채널별 수수료율 조회(0~0.9로 제한 — 설정 실수로 GC가 0이 되는 걸 막는다)
create or replace function _charge_fee_rate(p_channel text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_caps jsonb; r numeric;
begin
  select v into v_caps from app_settings where k = 'charge_fees';
  r := coalesce(
    (v_caps ->> lower(coalesce(p_channel, 'web')))::numeric,
    (v_caps ->> '_default')::numeric,
    0.03
  );
  if r < 0 then r := 0; end if;
  if r > 0.9 then r := 0.9; end if;
  return r;
end $$;

-- 충전 시작 — 채널을 받아 적립 GC를 순액으로 계산한다
create or replace function gc_charge_begin(p_key text, p_channel text default 'web')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  p gc_packages%rowtype;
  v_id uuid; v_rate numeric; v_fee int; v_gc int; v_ch text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into p from gc_packages where key = p_key and active;
  if p.key is null then return jsonb_build_object('ok',false,'reason','bad_package'); end if;

  v_ch := lower(coalesce(nullif(btrim(p_channel), ''), 'web'));
  v_rate := _charge_fee_rate(v_ch);
  v_fee := floor(p.krw * v_rate)::int;
  v_gc := p.krw - v_fee;               -- 적립 GC = 플랫폼이 실제로 받는 현금

  insert into gc_charges(user_id, pkg, krw, gc, status, channel, fee)
    values (v_uid, p.key, p.krw, v_gc, 'pending', v_ch, v_fee)
    returning id into v_id;

  return jsonb_build_object('ok',true,'charge_id',v_id,'krw',p.krw,'gc',v_gc,
                            'fee',v_fee,'fee_rate',v_rate,'channel',v_ch);
end $$;

grant execute on function gc_charge_begin(text, text) to authenticated;

-- 옛 1-인자 오버로드는 남기면 '모호한 함수' 오류를 만든다(전례 있음) → 제거
drop function if exists gc_charge_begin(text);

-- 패키지 목록도 채널별 적립량을 함께 돌려준다(화면에서 "10,000원 → 9,700 GC" 표시용)
create or replace function gc_charge_packages(p_channel text default 'web')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_rate numeric := _charge_fee_rate(p_channel);
begin
  return jsonb_build_object(
    'ok', true,
    'channel', lower(coalesce(nullif(btrim(p_channel),''),'web')),
    'fee_rate', v_rate,
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', key, 'krw', krw,
               'gc', krw - floor(krw * v_rate)::int,
               'fee', floor(krw * v_rate)::int,
               'label', label)
             order by sort)
      from gc_packages where active
    ), '[]'::jsonb)
  );
end $$;

grant execute on function gc_charge_packages(text) to anon, authenticated;
drop function if exists gc_charge_packages();
