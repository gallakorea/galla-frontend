-- 애플 Guideline 1.2(UGC 안전) 대응 — 맛집·여행 "한마디" 댓글에 신고·차단·본인 수정/삭제
-- 프런트(js/food.js·js/travel-place.js)가 공용 comment-actions.js ⋯ 메뉴를 붙였다.
--   · 신고(content_reports)·차단(user_blocks)은 report-block.js 가 이미 함 → 작성자 user_id 가 필요
--   · 본인 수정/삭제는 comment-actions 가 테이블 직접 update/delete → 본인 RLS 가 필요
-- 두 가지를 여기서 연다. (뉴스·광장·이슈 댓글과 동일한 패턴: 20260712260000_comment_edit_delete.sql)

create or replace function public._is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_profiles p where p.user_id = auth.uid() and coalesce(p.admin_flag,false));
$$;

-- ── 1) *_talk RPC 에 작성자 user_id 노출 (차단 대상 식별용) ──
-- 닉네임은 이미 프로필에서 내려주고 있어, user_id 추가는 다른 표면(video_comments)과 같은 수준.
create or replace function public.food_talk(p_id uuid, p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok',true,'comments', coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', c.id, 'body', c.body, 'faction', c.faction, 'parent_id', c.parent_id,
      'likes', c.likes, 'created_at', c.created_at,
      'user_id', c.user_id,
      'nick', coalesce(u.nickname, '익명'),
      'mine', c.user_id = auth.uid(),
      'liked', exists (select 1 from food_comment_likes l
                        where l.comment_id = c.id and l.user_id = auth.uid())) x
    from food_comments c
    left join user_profiles u on u.user_id = c.user_id
    where c.place_id = p_id and c.status = 'live'
    order by c.created_at
    limit least(coalesce(p_limit,60), 200)
  ) q;
$fn$;

create or replace function public.travel_talk(p_id uuid, p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok',true,'comments', coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', c.id, 'body', c.body, 'faction', c.faction, 'parent_id', c.parent_id,
      'likes', c.likes, 'created_at', c.created_at,
      'user_id', c.user_id,
      'nick', coalesce(u.nickname, '익명'),
      'mine', c.user_id = auth.uid(),
      'liked', exists (select 1 from travel_comment_likes l
                        where l.comment_id = c.id and l.user_id = auth.uid())) x
    from travel_comments c
    left join user_profiles u on u.user_id = c.user_id
    where c.place_id = p_id and c.status = 'live'
    order by c.created_at
    limit least(coalesce(p_limit,60), 200)
  ) q;
$fn$;

-- ── 2) 본인(+관리자) 수정/삭제 RLS ──
-- insert 는 여전히 RPC(food_say·travel_say)로만 — '투표해야 말할 수 있다' 는 그대로.
-- update/delete 만 본인 행에 대해 연다(공용 ⋯ 메뉴의 수정·삭제).
drop policy if exists food_comments_update_own on public.food_comments;
create policy food_comments_update_own on public.food_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());
drop policy if exists food_comments_delete_own on public.food_comments;
create policy food_comments_delete_own on public.food_comments
  for delete to authenticated using (user_id = auth.uid() or _is_admin());

drop policy if exists travel_comments_update_own on public.travel_comments;
create policy travel_comments_update_own on public.travel_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());
drop policy if exists travel_comments_delete_own on public.travel_comments;
create policy travel_comments_delete_own on public.travel_comments
  for delete to authenticated using (user_id = auth.uid() or _is_admin());

-- ── video_comments (핫튜브·watch 댓글, 본문 body) ──
-- delete(본인+관리자)는 이미 있음(20260715040000). ⋯ 메뉴가 수정도 제공 → update 정책 추가.
drop policy if exists video_comments_update_own on public.video_comments;
create policy video_comments_update_own on public.video_comments
  for update to authenticated using (user_id = auth.uid() or _is_admin())
  with check (user_id = auth.uid() or _is_admin());
