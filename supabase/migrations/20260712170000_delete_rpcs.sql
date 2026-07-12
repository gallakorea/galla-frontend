-- 콘텐츠 삭제 RPC (소유자/관리자만). 자식 행까지 정리해 FK 제약 회피.
-- 프론트 owner-actions.js 가 테이블 직접 delete 대신 이 RPC를 호출.

-- 이슈 삭제: 댓글/좋아요/전투액션/투표 등 정리 후 삭제
create or replace function public.delete_issue(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from issues where id = p_id and (user_id = auth.uid() or public.is_admin())) then
    raise exception 'not_authorized';
  end if;
  delete from comment_likes   where comment_id in (select id from comments where issue_id = p_id);
  delete from comment_actions where comment_id in (select id from comments where issue_id = p_id);
  delete from comments        where issue_id = p_id;
  delete from votes           where issue_id = p_id;
  delete from supports        where issue_id = p_id;
  delete from notifications   where issue_id = p_id;
  -- 나머지(bookmarks, faction_chats, ai_news, issue_clusters/trends/articles, author_supports)는 ON DELETE CASCADE
  delete from issues where id = p_id;
end; $$;

-- 광장 글 삭제
create or replace function public.delete_plaza_post(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from plaza_posts where id = p_id and (user_id = auth.uid() or public.is_admin())) then
    raise exception 'not_authorized';
  end if;
  delete from plaza_comment_votes where comment_id in (select id from plaza_comments where post_id = p_id);
  delete from plaza_comments      where post_id = p_id;
  delete from plaza_votes         where post_id = p_id;
  delete from plaza_bookmarks     where post_id = p_id;
  delete from plaza_posts where id = p_id;
end; $$;

-- 예측 삭제: 거래가 있으면 거부(정산 무결성)
create or replace function public.delete_market(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from markets where id = p_id and (created_by = auth.uid() or public.is_admin())) then
    raise exception 'not_authorized';
  end if;
  if exists (select 1 from market_trades where market_id = p_id) then
    raise exception 'has_trades';
  end if;
  delete from market_comment_likes where comment_id in (select id from market_comments where market_id = p_id);
  delete from market_comments  where market_id = p_id;
  delete from market_reactions where market_id = p_id;
  delete from market_bookmarks where market_id = p_id;
  delete from market_positions where market_id = p_id;
  delete from market_outcomes  where market_id = p_id;
  delete from markets where id = p_id;
end; $$;

grant execute on function public.delete_issue(bigint)     to authenticated;
grant execute on function public.delete_plaza_post(uuid)   to authenticated;
grant execute on function public.delete_market(bigint)     to authenticated;
