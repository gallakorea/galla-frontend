-- 초대 리더보드 — 누가 갈라를 가장 많이 퍼뜨렸나 (경쟁 유발)
-- 공개 닉네임 + 초대수만 노출. user_profiles 자체는 anon 차단 유지.
create or replace function public.referral_leaderboard(p_limit int default 10)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by x.invited desc), '[]'::jsonb)
  from (
    select u.nickname, count(*)::int as invited
      from user_profiles p
      join users u on u.id = p.referred_by
     where p.referred_by is not null
     group by u.nickname
     order by count(*) desc
     limit greatest(1, least(coalesce(p_limit,10), 50))
  ) x;
$$;
revoke all on function public.referral_leaderboard(int) from public;
grant execute on function public.referral_leaderboard(int) to anon, authenticated;
