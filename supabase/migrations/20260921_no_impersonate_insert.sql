-- 🔒 남의 명의로 쓰기 차단(26.9.21 보안 점검) — 조건 없는(check true) 허용 정책이 '본인만' 정책과 OR 로 합쳐져
-- 로그인한 누구나 user_id 를 남으로 바꿔 넣을 수 있었다.
--  · issues: 「issues insert」(true) → 남의 명의로 이슈 발행. 「Insert own issue」(auth.uid()=user_id)만 남긴다.
--  · comment_actions: 「Allow authenticated insert」(true) → 남의 명의로 공격·방어(배틀 결과 조작).
--    앱은 읽기만 하고 쓰기는 battle_action(SECURITY DEFINER)이 한다 → 클라 직접 쓰기 정책은 본인 한정으로.
-- 정당한 작성 경로(admin_publish_issue·battle_action)는 SECURITY DEFINER 라 RLS 영향 없음.
drop policy if exists "issues insert" on public.issues;
drop policy if exists "Allow authenticated insert" on public.comment_actions;
create policy comment_actions_insert_own on public.comment_actions for insert to authenticated with check (user_id = auth.uid());
