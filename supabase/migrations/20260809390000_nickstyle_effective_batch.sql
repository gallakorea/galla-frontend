-- 🩹 구독 만료 후에도 빌려 쓰던 닉네임 스타일이 계속 보이던 것 (2026-08-09)
--
--  nickstyle_effective(uid)를 만들어놓고 정작 도색기는 user_cosmetics.nick_style을
--  그대로 읽고 있었다. 그러면 구독이 끝나도 프리미엄 스타일이 영구히 남는다
--  — 구독 혜택이 아니라 영구 지급이 되어버린다.
--
--  도색기는 화면 한 번에 수십 명을 그리므로 1인 1쿼리는 안 된다. 배치로 준다.

create or replace function public.nickstyles_of(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(u.uid, s), '{}'::jsonb)
    from unnest(p_uids) as u(uid)
    cross join lateral (select public.nickstyle_effective(u.uid) s) t
   where s is not null;
$$;
grant execute on function public.nickstyles_of(uuid[]) to anon, authenticated;
