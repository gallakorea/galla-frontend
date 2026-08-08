-- 🎟 무료 등급이 대화 한 번을 못 끝내던 문제 (2026-08-08)
--
--  실측: 자연스러운 대화 한 세션이 20턴인데 무료 창 한도가 12턴이라 중간에 끊겼다
--  ("아 목이 좀 쉬었다 ㅋㅋ 21:10쯤 다시 올게"). 맛보기가 아니라 '매번 끊기는 경험'이라
--  전환보다 이탈을 만든다.
--
--  ⚠️ 핵심: 창 한도를 키워도 비용은 늘지 않는다.
--     창(5시간)은 '몰아쓰기 방지'용이고, 총비용은 결제주기 예산 하드스톱(ai_gate의 budget 체크)이 막는다.
--     즉 12턴은 돈을 아끼지도 못하면서 경험만 망가뜨리고 있었다.
update public.app_settings
   set v = jsonb_set(v, '{free,windows,galla-friend}', '{"n": 25, "hours": 5}'::jsonb)
 where k = 'ai_tiers';

-- 라이트도 같은 이유로 소폭 상향(40 → 50): 유료 첫 단계가 대화 두 번은 끝낼 수 있어야 한다.
update public.app_settings
   set v = jsonb_set(v, '{lite,windows,galla-friend}', '{"n": 50, "hours": 5}'::jsonb)
 where k = 'ai_tiers';
