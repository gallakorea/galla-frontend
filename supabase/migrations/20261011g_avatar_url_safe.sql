-- 2026-10-11 보안 감사: users.avatar_url 은 본인이 직접 바꿀 수 있는 칸(grant update(avatar_url))이라
-- 따옴표를 넣어 <img src="…"> 속성을 깨고 onerror 를 심을 수 있었다(검색·팔로워 목록 XSS).
-- 클라에서도 걸렀지만(GALLA_avatarSrc) 서버에서도 막는다. 적용 전 위반 행 0건 확인.
alter table public.users drop constraint if exists users_avatar_url_safe;
alter table public.users add constraint users_avatar_url_safe
  check (avatar_url is null or avatar_url !~ '["''<>[:space:]`\\]');
