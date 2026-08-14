-- =========================================================
-- 🚨 재화 내부 함수가 클라이언트에 열려 있던 문제
--
-- 실측: 아래 함수들이 SECURITY DEFINER 인데 anon/authenticated 에게
--       execute 가 걸려 있었고, 대상 유저를 '인자로' 받으면서
--       auth.uid() 검사를 하지 않는다. 누구나 anon 키(프론트에 공개돼 있다)로
--       직접 호출할 수 있었다.
--
--   ① ai_creation_refund(p_user, p_amount)
--      → 남의 계정이든 내 계정이든 GC 를 원하는 만큼 더할 수 있다.
--        GC 는 실화폐 재화다. 사실상 무한 발행.
--   ② _gc_spend(p_user, p_amt)
--      → 임의 유저의 GC 를 차감할 수 있다. 남의 잔액 파괴.
--   ③ ai_budget_take(p_fn, p_n) / ai_gate(p_fn, p_subject, ...)
--      → 전역 AI 일일 예산·레이트리밋 카운터를 임의로 소진시킬 수 있다.
--        AI 기능 전체를 정지시키는 DoS.
--   ④ _gc_sub_live / lifetime_gp — 남의 상태를 조회.
--
-- ✅ 호출부 실측: 넷 다 프론트엔드에서 호출하지 않는다.
--    엣지 함수가 service_role 로만 부른다(generate-thumbnail, generate-video,
--    galla-friend 등). service_role 은 grant 와 무관하게 실행되므로
--    revoke 해도 정상 경로는 영향이 없다.
--
-- ⚠️ ai_creation_charge 는 남긴다 — 엣지가 '유저 JWT'로 호출하고(asUser),
--    내부에서 auth.uid() 로 본인만 과금한다. 안전한 설계다.
--    같은 계열 ai_creation_charge_for(p_user,...) 는 이미 잠겨 있었다
--    — refund 만 빠져 있었던 것.
-- =========================================================

-- ⚠️ `revoke ... from anon, authenticated` 만으로는 막히지 않는다.
--    PostgreSQL 은 함수 생성 시 EXECUTE 를 PUBLIC 에 기본 부여한다.
--    anon/authenticated 는 PUBLIC 경유로 그대로 통과한다 —
--    실제로 revoke 후에도 has_function_privilege 가 true 였다.
--    반드시 PUBLIC 에서 회수하고 service_role 에만 다시 준다.

revoke execute on function public.ai_creation_refund(uuid, integer, text) from public;
grant  execute on function public.ai_creation_refund(uuid, integer, text) to service_role;

revoke execute on function public._gc_spend(uuid, integer, text) from public;
grant  execute on function public._gc_spend(uuid, integer, text) to service_role;

revoke execute on function public._gc_sub_live(uuid) from public;
grant  execute on function public._gc_sub_live(uuid) to service_role;

revoke execute on function public.lifetime_gp(uuid) from public;
grant  execute on function public.lifetime_gp(uuid) to service_role;

revoke execute on function public.ai_budget_take(text, integer) from public;
grant  execute on function public.ai_budget_take(text, integer) to service_role;

revoke execute on function public.ai_gate(text, text, integer, integer) from public;
grant  execute on function public.ai_gate(text, text, integer, integer) to service_role;

-- ── 같은 패턴 전수 스윕에서 추가로 나온 것들 ────────────────
--    (유저ID를 인자로 받고 본인 확인이 없으며, 엣지 함수만 호출한다)
--    이쪽은 PUBLIC 기본값이 아니라 anon/authenticated 에 직접 grant 가
--    박혀 있어서 from public 만으로는 회수되지 않았다.
--
--    ai_spend_add          — AI 원가 계측 오염 → 마진 가드 오작동
--    translate_gate        — 남의 번역 쿼터 소진
--    touch_friend_memory   — 남의 친구 기억 조작
--    apply/fail_video_migration — 남의 영상 URL 주입
revoke execute on function public.ai_spend_add(text, text, uuid, bigint, bigint, bigint) from anon, authenticated;
revoke execute on function public.translate_gate(uuid, integer)             from anon, authenticated;
revoke execute on function public.touch_friend_memory(uuid, bigint[])       from anon, authenticated;
revoke execute on function public.apply_video_migration(text, text, text)   from anon, authenticated;
revoke execute on function public.fail_video_migration(text, text)          from anon, authenticated;
