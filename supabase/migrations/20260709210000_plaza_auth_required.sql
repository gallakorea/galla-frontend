-- 정통망법 대비: 모든 작성은 로그인 필수 + 실작성자(user_id) 기록. 익명은 '표시'만.
-- Management API로 적용. 기록용.

alter table public.plaza_posts add column if not exists user_id uuid references auth.users(id);
alter table public.plaza_comments add column if not exists user_id uuid references auth.users(id);
create index if not exists idx_plaza_posts_user on public.plaza_posts(user_id);
create index if not exists idx_plaza_comments_user on public.plaza_comments(user_id);

-- 익명 insert 구멍 제거, 본인 user_id 강제
drop policy if exists plaza_posts_insert_all on public.plaza_posts;
drop policy if exists "insert plaza post" on public.plaza_posts;
create policy plaza_posts_insert_auth on public.plaza_posts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "insert plaza comment" on public.plaza_comments;
create policy plaza_comments_insert_auth on public.plaza_comments
  for insert to authenticated with check (auth.uid() = user_id);

-- 스토리지: plaza-images 익명 업로드 차단 → 로그인 사용자만
drop policy if exists "Public insert" on storage.objects;
create policy "plaza-images authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'plaza-images');

-- 감사에서 발견된 추가 구멍
-- 1) comments: is_anonymous=true면 비로그인 insert 가능했음 → 로그인+본인 강제(익명은 표시 전용)
drop policy if exists "insert comment" on public.comments;
-- (comments_insert_self 정책이 authenticated+본인 체크로 이미 존재)

-- 2) user_profiles: check true → 본인만
drop policy if exists "Users can insert their own profile" on public.user_profiles;
create policy user_profiles_insert_self on public.user_profiles
  for insert to authenticated with check (auth.uid() = user_id);
