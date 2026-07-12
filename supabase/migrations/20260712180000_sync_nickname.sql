-- 작성자명 불일치 수정: users.nickname(정본, 설정에서 수정) 변경 시
-- user_profiles.nickname 자동 동기화. 피드/릴스는 user_profiles를 읽으므로
-- 두 값이 어긋나면 화면마다 이름이 달라 보임.

create or replace function public.sync_profile_nickname()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nickname is distinct from old.nickname then
    update public.user_profiles set nickname = new.nickname where user_id = new.id;
  end if;
  return new;
end; $$;

drop trigger if exists trg_sync_profile_nickname on public.users;
create trigger trg_sync_profile_nickname
  after update of nickname on public.users
  for each row execute function public.sync_profile_nickname();

-- 기존 어긋난 데이터 백필 (users → user_profiles)
update public.user_profiles p
   set nickname = u.nickname
  from public.users u
 where p.user_id = u.id
   and u.nickname is not null
   and p.nickname is distinct from u.nickname;
