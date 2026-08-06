-- 📡 실시간 미러링 견고화 — friend_relationship UPDATE 이벤트가 항상 완전한 old/new를 싣게.
--   default replica identity는 old에 PK만 → 일부 realtime RLS 평가 경로에서 취약. full로 승격(follows와 동일 정책).
alter table public.friend_relationship replica identity full;
