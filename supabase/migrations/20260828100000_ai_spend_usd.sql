-- 💵 토큰이 아니라 '건수'가 원가인 호출을 장부에 남긴다
--
-- ai_spend_add 는 토큰 × 단가로 원가를 계산한다. 그런데 이미지 생성·음성 인식은
-- 토큰이 없다 — 장당·초당 고정 요금이다. 그래서 지금까지 **제일 비싼 호출들이
-- 장부에서 통째로 빠져 있었다**(AI 스티커 1장 실측 ₩55, 4장 세트 ₩220).
-- 대화 한 턴이 ₩1.5 인데 스티커 한 장이 ₩55 다. 안 적으면 원가 구조를 거꾸로 본다.
--
-- calls 는 '건수'로 센다(이미지 3장이면 3). 토큰 컬럼은 0 이다.

create or replace function public.ai_spend_add_usd(
  p_fn text, p_model text, p_uid uuid, p_usd numeric, p_units int default 1
) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_day date := (now() at time zone 'Asia/Seoul')::date;
  v_uid uuid := coalesce(p_uid, public.ai_guest_uid());
  v_n   int  := greatest(1, coalesce(p_units, 1));
begin
  if p_model is null or p_model = '' then return jsonb_build_object('ok', false); end if;
  -- ⚠️ p_usd = 0 도 받는다. 단가를 아직 모르는 경로(CF 이미지·음성)는 '건수'라도 남겨야
  --    청구서가 왔을 때 곱할 대상이 생긴다. 모르면 안 적는다가 지금까지의 공백이었다.

  insert into ai_spend (day, user_id, fn, model, calls, in_tokens, cache_tokens, out_tokens, cost_usd)
  values (v_day, v_uid, p_fn, p_model, v_n, 0, 0, 0, coalesce(p_usd, 0))
  on conflict (day, user_id, fn, model) do update set
    calls    = ai_spend.calls + excluded.calls,
    cost_usd = ai_spend.cost_usd + excluded.cost_usd;

  return jsonb_build_object('ok', true, 'usd', p_usd, 'units', v_n);
end $$;

revoke all on function public.ai_spend_add_usd(text, text, uuid, numeric, int) from public, anon, authenticated;
grant execute on function public.ai_spend_add_usd(text, text, uuid, numeric, int) to service_role;
