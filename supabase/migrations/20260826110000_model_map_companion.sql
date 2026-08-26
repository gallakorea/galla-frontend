-- =========================================================
-- 모델 맵에 새 이용권 키를 넣는다 — 안 넣으면 조용히 저가 모델로 떨어진다
--
-- model_for() 는 ai_margin.models.<kind>.<tier> 를 찾고, 없으면 말없이
-- deepseek-chat 으로 폴백한다. 등급 이름을 바꾸면서 이 맵을 안 옮기면
-- 컴패니언 구독자가 무거운 작업에서 claude-haiku 대신 deepseek 를 받는다.
-- 오류가 안 나서 아무도 모른다 — 구독자가 생기는 날 조용히 시작된다.
--
-- 옮기는 규칙: 가끔·매일 = 옛 lite/friend(haiku), 종일 = 옛 pro(sonnet).
--
-- ⚠️ 요금(price)이 아직 미정(null)이라 model_for 의 원가 예산이 0으로 계산된다.
--    그러면 구독자라도 곧바로 폴백 모델로 내려간다. 가격을 정하기 전에는
--    구독을 팔지 마라 — 팔아도 제값을 못 받는 게 아니라 제값을 못 준다.
--    (돈이 새는 게 아니라 품질이 새는 쪽이라 실패 방향은 안전하다.)
-- =========================================================

update app_settings set v = jsonb_set(
  jsonb_set(v, '{models,chat}', (v -> 'models' -> 'chat')
    || jsonb_build_object(
         'companion_sometimes', v -> 'models' -> 'chat' -> 'lite',
         'companion_daily',     v -> 'models' -> 'chat' -> 'friend',
         'companion_always',    v -> 'models' -> 'chat' -> 'pro')),
  '{models,heavy}', (v -> 'models' -> 'heavy')
    || jsonb_build_object(
         'companion_sometimes', v -> 'models' -> 'heavy' -> 'lite',
         'companion_daily',     v -> 'models' -> 'heavy' -> 'friend',
         'companion_always',    v -> 'models' -> 'heavy' -> 'pro'))
 where k = 'ai_margin'
   and (v -> 'models' -> 'chat' -> 'companion_daily') is null;

-- 옛 키는 남겨 둔다 — 지우면 되돌릴 때 무엇이었는지 알 길이 없다.
-- model_for 는 tier_of 가 주는 키만 찾으므로 남아 있어도 해가 없다.

do $$
begin
  if exists (select 1 from app_settings where k = 'ai_margin'
              and ((v -> 'models' -> 'chat'  -> 'companion_always') is null
                or (v -> 'models' -> 'heavy' -> 'companion_always') is null)) then
    raise exception '모델 맵에 새 이용권 키가 안 들어갔다 — 구독자가 저가 모델로 떨어진다';
  end if;
end $$;
