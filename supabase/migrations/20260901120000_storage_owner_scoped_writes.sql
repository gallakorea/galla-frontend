/* 스토리지 정책에 소유자 검사가 빠진 게 셋 있었다(2026-09-01 실측).
   RLS PERMISSIVE 는 OR 로 합쳐지므로, 옆에 제대로 된 정책이 있어도
   헐거운 것 하나가 전부를 무력화한다 — 정지 기능 때와 같은 함정이다.

     issues_delete_authenticated          bucket_id='issues' 뿐  → 로그인한 아무나 남의 이슈 사진·영상 삭제
     issues_update_authenticated          bucket_id='issues' 뿐  → 남의 파일 덮어쓰기
     authenticated can update profile…    bucket_id='profiles' 뿐 → 남의 프로필 사진 덮어쓰기

   대상은 197개(1.16GB)·프로필 3개. 읽기(SELECT)와 올리기(INSERT)는 공개 버킷이라
   버킷 단독 조건이 맞다 — 건드리지 않는다.
   owner 는 209개 중 206개에 채워져 있어 소유자 정책이 정상 동작한다(나머지 3개는
   서비스롤 업로드라 사용자 경로로 지울 일이 없다). */

drop policy if exists "issues_delete_authenticated" on storage.objects;

drop policy if exists "issues_update_authenticated" on storage.objects;
create policy "issues_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'issues' and auth.uid() = owner)
  with check (bucket_id = 'issues' and auth.uid() = owner);

drop policy if exists "authenticated can update profile images" on storage.objects;
create policy "profiles_update_own" on storage.objects
  for update to authenticated
  using      (bucket_id = 'profiles' and auth.uid() = owner)
  with check (bucket_id = 'profiles' and auth.uid() = owner);
