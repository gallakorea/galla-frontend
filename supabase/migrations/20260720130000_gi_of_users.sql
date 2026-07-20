-- 여러 유저의 갈라 지수(GI)를 한 번에 계산 — 닉네임 도색기가 등급 아이콘을
-- 갈라리안 등급표(grade 페이지 = GALLA_gallianOf)와 일치시키기 위해 배치 조회.
-- 활동 + 전투액션 + 예측(predict_bets, 파리뮤추얼 최신) 공식.
-- (전공 merit 가중은 gallian.js에만 있으나 상위권 소수에만 영향 → 등급 경계 사실상 일치)
create or replace function public.gi_of_users(p_uids uuid[])
returns jsonb language sql stable security definer set search_path=public as $fn$
  select coalesce(jsonb_object_agg(u::text, (
      coalesce((select count(*) from issues where user_id=u),0)*50
    + coalesce((select count(*) from comments where user_id=u and status<>'deleted'),0)*10
    + coalesce((select count(*) from votes where user_id=u),0)*2
    + coalesce((select count(*) from plaza_posts where user_id=u),0)*15
    + coalesce((select count(*) from plaza_comments where user_id=u),0)*5
    + coalesce((select count(*) from comment_actions where user_id=u),0)*8
    + coalesce((select count(*) from predict_bets where user_id=u),0)*10
  )::bigint), '{}'::jsonb)
  from unnest(p_uids) u;
$fn$;
grant execute on function public.gi_of_users(uuid[]) to anon, authenticated;
