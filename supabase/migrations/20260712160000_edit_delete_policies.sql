-- 작성 콘텐츠 수정/삭제 기능: 광장·예측 RLS 추가 + 관리자 오버라이드
-- 원칙: 소유자(auth.uid()=소유컬럼) 또는 관리자(admin_flag)만. RLS가 방어선.
-- 예측(markets)은 거래가 있으면 삭제 불가(정산 무결성).

-- 관리자 판별 헬퍼
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.user_profiles
    where user_id = auth.uid() and admin_flag = true
  );
$$;

-- ── 광장(plaza_posts): 수정/삭제 정책 신설 ──
drop policy if exists plaza_posts_update_own on public.plaza_posts;
create policy plaza_posts_update_own on public.plaza_posts
  for update to authenticated
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop policy if exists plaza_posts_delete_own on public.plaza_posts;
create policy plaza_posts_delete_own on public.plaza_posts
  for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- ── 예측(markets): 수정/삭제 정책 신설 ──
drop policy if exists markets_update_own on public.markets;
create policy markets_update_own on public.markets
  for update to authenticated
  using (auth.uid() = created_by or public.is_admin())
  with check (auth.uid() = created_by or public.is_admin());

-- 삭제는 거래(market_trades)가 하나도 없을 때만 허용
drop policy if exists markets_delete_own on public.markets;
create policy markets_delete_own on public.markets
  for delete to authenticated
  using (
    (auth.uid() = created_by or public.is_admin())
    and not exists (select 1 from public.market_trades t where t.market_id = markets.id)
  );

-- ── 이슈(issues): 소유자 정책은 이미 있음 → 관리자 오버라이드만 추가 ──
drop policy if exists issues_admin_update on public.issues;
create policy issues_admin_update on public.issues
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists issues_admin_delete on public.issues;
create policy issues_admin_delete on public.issues
  for delete to authenticated
  using (public.is_admin());
