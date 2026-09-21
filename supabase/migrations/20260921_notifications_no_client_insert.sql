-- 🔒 알림 위조 차단(26.9.21 보안 점검) — "Authenticated users can insert notifications"(check: auth.role()='authenticated')는
-- 로그인한 누구나 남의 user_id 로 알림 행을 넣을 수 있게 했다 → notifications_push 트리거가 그대로 푸시까지 보낸다
-- (임의 문구 푸시 = 피싱 통로). 앱은 알림을 직접 넣지 않는다 — 전부 SECURITY DEFINER 트리거(_notify)·서비스 키 함수가 만든다.
drop policy if exists "Authenticated users can insert notifications" on public.notifications;
