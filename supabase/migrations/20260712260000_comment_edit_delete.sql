-- 모든 게시물 댓글의 수정/삭제: 작성자 본인 + 관리자(admin_flag) 오버라이드
-- comments(이슈)는 self update/delete 정책이 이미 있음 → 관리자 오버라이드만 보강
-- plaza_comments: update/delete 둘 다 없음 / market·news_comments: update(수정) 없음

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_profiles p where p.user_id = auth.uid() and coalesce(p.admin_flag,false));
$$;

-- ── plaza_comments (본문 body) ──
drop policy if exists plaza_comments_update_own on public.plaza_comments;
create policy plaza_comments_update_own on public.plaza_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());
drop policy if exists plaza_comments_delete_own on public.plaza_comments;
create policy plaza_comments_delete_own on public.plaza_comments
  for delete to authenticated using (user_id = auth.uid() or _is_admin());

-- ── market_comments (본문 content) : delete는 있음, update 추가 ──
drop policy if exists market_comments_update_own on public.market_comments;
create policy market_comments_update_own on public.market_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());

-- ── galla_news_comments (본문 content) : delete는 있음, update 추가 ──
drop policy if exists gnc_update_own on public.galla_news_comments;
create policy gnc_update_own on public.galla_news_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());

-- ── comments (이슈, 본문 content, 소프트삭제 status) : 관리자 오버라이드 보강 ──
drop policy if exists comments_admin_manage on public.comments;
create policy comments_admin_manage on public.comments
  for update to authenticated using (_is_admin()) with check (_is_admin());
