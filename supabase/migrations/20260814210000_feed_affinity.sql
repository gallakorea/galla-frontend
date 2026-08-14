-- =========================================================
-- 개인화 신호 — my_feed_affinity()
--
-- 원칙(이걸 어기면 갈라가 죽는다):
--   ✅ 카테고리 관심도 — 내가 참여해온 주제를 더 보여준다
--   ✅ 팔로우한 작성자 — 명시적으로 표현한 관심
--   ✅ 이미 참전한 이슈는 하향 — 내가 이미 투표한 글이 계속 상단에 남는 건 낭비다
--   ❌ '같은 진영' 콘텐츠 부스트는 하지 않는다
--      갈라는 찬반이 부딪히는 곳이다. 내 편 글만 띄우면 에코 체임버가 되고
--      제품의 존재 이유가 사라진다. 카테고리는 중립 그릇이라 안전하지만,
--      진영은 절대 가중치로 쓰지 않는다.
--
-- 반환은 '가중치 재료'일 뿐 필터가 아니다 — 무엇도 피드에서 제거하지 않는다.
-- =========================================================

create or replace function public.my_feed_affinity()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); v_cat jsonb; v_follow jsonb; v_max numeric;
begin
  if u is null then
    return jsonb_build_object('ok', true, 'categories', '{}'::jsonb, 'following', '[]'::jsonb);
  end if;

  /* 카테고리 관심도 — 최근 90일의 내 참여(투표·댓글)를 카테고리별로 센다.
     투표보다 댓글이 무겁다(더 큰 관여). */
  with acts as (
    select i.category, 1 as w
      from votes v join issues i on i.id = v.issue_id
     where v.user_id = u and v.created_at > now() - interval '90 days'
       and coalesce(i.category,'') <> ''
    union all
    select i.category, 2
      from comments c join issues i on i.id = c.issue_id
     where c.author_id = u and c.created_at > now() - interval '90 days'
       and coalesce(i.category,'') <> ''
  ),
  agg as (select category, sum(w)::numeric s from acts group by category)
  select coalesce(max(s), 0) into v_max from agg;

  with acts as (
    select i.category, 1 as w
      from votes v join issues i on i.id = v.issue_id
     where v.user_id = u and v.created_at > now() - interval '90 days'
       and coalesce(i.category,'') <> ''
    union all
    select i.category, 2
      from comments c join issues i on i.id = c.issue_id
     where c.author_id = u and c.created_at > now() - interval '90 days'
       and coalesce(i.category,'') <> ''
  ),
  agg as (select category, sum(w)::numeric s from acts group by category)
  /* 최댓값으로 정규화해 0~1 로 만든다 — 활동량이 많고 적음에 따라
     가중치 스케일이 통째로 달라지면 안 된다. */
  select coalesce(jsonb_object_agg(category, round(s / nullif(v_max,0), 3)), '{}'::jsonb)
    into v_cat from agg;

  select coalesce(jsonb_agg(following), '[]'::jsonb) into v_follow
    from follows where follower = u;

  return jsonb_build_object('ok', true, 'categories', v_cat, 'following', v_follow);
end $$;

grant execute on function public.my_feed_affinity() to authenticated;

comment on function public.my_feed_affinity() is
  '개인화 재료 — 카테고리 관심도(0~1 정규화)와 팔로우 목록. 진영은 의도적으로 넣지 않는다(에코 체임버 방지).';
