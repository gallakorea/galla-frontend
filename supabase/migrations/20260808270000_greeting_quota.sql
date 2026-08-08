-- 🎟 인사(빈 메시지)를 대화 할당량에서 분리 (2026-08-08)
--
--  창을 열면 갈비스가 먼저 인사를 건다(greet). 그런데 이게 유저의 대화 턴을 깎고 있었다.
--  → 무료(12턴/5시간)는 "말 한마디 안 하고 12번 열면 끝". 우리가 시작한 말을 유저에게 청구한 셈.
--  엣지에서 '빈 메시지 = 인사'로 판정해 galla-friend-ambient 창으로 센다.
--  (빈 메시지로는 실제 답을 못 얻으니 이 경로를 악용해 공짜 대화를 뽑을 수는 없다. 폭주만 막는다.)
update public.app_settings set v = (
  select jsonb_object_agg(k2, case when k2 = 'guest' then v2
         else jsonb_set(v2, '{windows,galla-friend-ambient}', '{"n": 20, "hours": 5}'::jsonb) end)
  from jsonb_each(v) as t(k2, v2)
) where k = 'ai_tiers';
