-- 2026-10-11: 카카오·네이버가 '사진 없음' 사용자에게 주는 기본 실루엣 이미지가 내 사진처럼 저장돼
-- 네비·프로필에 작은 회색 사람이 떴다(사장님 제보). 플레이스홀더는 사진이 아니다 → null(갈라 기본 아바타가 대신 뜸).
create or replace function public._avatar_strip_placeholder() returns trigger
language plpgsql as $$
begin
  if new.avatar_url is not null and (
       new.avatar_url ~* 'kakaocdn\.net/.*default_profile'
    or new.avatar_url ~* 'kakaocdn\.net%2Faccount_images%2Fdefault_profile'
    or new.avatar_url ~* 'pstatic\.net/static/pwe/address/img_profile\.png'
  ) then
    new.avatar_url := null;
  end if;
  return new;
end $$;
drop trigger if exists trg_users_avatar_placeholder on public.users;
create trigger trg_users_avatar_placeholder before insert or update of avatar_url on public.users
  for each row execute function public._avatar_strip_placeholder();
update public.users set avatar_url = null
 where avatar_url ~* 'kakaocdn\.net/.*default_profile|kakaocdn\.net.*account_images.*default_profile|pstatic\.net/static/pwe/address/img_profile\.png';
