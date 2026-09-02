/* 프로필 사진·광장 이미지는 **본인도 지울 수 없었다** — 소유자 삭제 정책을 준다.

   `storage.objects` 에 DELETE 정책이 `issues` 버킷 하나뿐이었다
   (`authenticated-delete-own-issue-files`, owner 검사 있음).
   `profiles`·`plaza-images` 는 정책이 아예 없어 RLS 기본 거부 → **아무도 못 지운다.**

   실측(2026-09-02): 심사계정으로 `profiles` 에 1×1 PNG 를 올린 뒤
   `storage.remove()` 를 부르니 **삭제 0건**. 프로필 사진을 바꿀 때마다 옛 파일이 영구히 남는다는 뜻이다.
   프로필 사진은 자주 바뀌는 자산이라 누적이 빠르다.
   (같은 계열: `issues` 버킷 197파일 1.16GB 중 참조 0건 — 사장님이 비우기로 한 그 문제.)

   owner 컬럼은 정상적으로 채워진다(현재 210개 객체 중 null 3개, 전부 issues 의 옛 파일).
   → issues 와 같은 모양으로 소유자 한정 삭제만 연다. 남의 파일은 여전히 못 건드린다. */

create policy "profiles_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'profiles' and auth.uid() = owner);

create policy "plaza_images_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'plaza-images' and auth.uid() = owner);
