-- 광장 글 업/다운 투표 RPC (PostgREST, auth.uid 기반) — 엣지함수 plaza-vote의 JWT 이슈 회피 + 피드/상세 통일
-- 토글: 같은 값 다시 누르면 취소, 다른 값이면 교체. plaza_posts 카운트 재계산 후 {score, my_vote} 반환.
create or replace function public.vote_plaza_post(p_post_id uuid, p_value smallint)
returns table(score int, my_vote smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
begin
  if v_uid is null then raise exception 'login required'; end if;
  if p_value not in (1, -1) then raise exception 'invalid value'; end if;

  select vote into v_existing from plaza_votes where post_id = p_post_id and user_id = v_uid;

  if v_existing is null then
    insert into plaza_votes(post_id, user_id, vote) values (p_post_id, v_uid, p_value);
  elsif v_existing = p_value then
    delete from plaza_votes where post_id = p_post_id and user_id = v_uid;
  else
    update plaza_votes set vote = p_value where post_id = p_post_id and user_id = v_uid;
  end if;

  update plaza_posts pp set
    up_count = (select count(*) from plaza_votes v where v.post_id = pp.id and v.vote = 1),
    down_count = (select count(*) from plaza_votes v where v.post_id = pp.id and v.vote = -1),
    score = (select coalesce(sum(v.vote),0) from plaza_votes v where v.post_id = pp.id)
  where pp.id = p_post_id;

  return query
    select pp.score,
      (select v.vote::smallint from plaza_votes v where v.post_id = pp.id and v.user_id = v_uid)
    from plaza_posts pp where pp.id = p_post_id;
end;
$$;
revoke all on function public.vote_plaza_post(uuid, smallint) from public;
grant execute on function public.vote_plaza_post(uuid, smallint) to authenticated;
