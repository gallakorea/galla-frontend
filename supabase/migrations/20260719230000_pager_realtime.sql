-- 📟 삐삐 실시간 배달 — 발행 누락으로 열어둔 화면에 새 호출이 안 떴다(적용됨, 기록용)
do $$ begin
  alter publication supabase_realtime add table public.pager_messages;
exception when duplicate_object then null; end $$;
