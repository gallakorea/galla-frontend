-- 광장: 게시물 조회수 + 댓글 좋아요/싫어요
-- Management API로 적용. 기록용.

-- 1) 조회수
alter table public.plaza_posts add column if not exists view_count int not null default 0;

create or replace function public.increment_plaza_view(p_post_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.plaza_posts set view_count = view_count + 1 where id = p_post_id;
$$;
revoke all on function public.increment_plaza_view(uuid) from public;
grant execute on function public.increment_plaza_view(uuid) to anon, authenticated;

-- 2) 댓글 투표 (로그인 필수, 정통망법 정책과 일관)
create table if not exists public.plaza_comment_votes (
  comment_id uuid not null references public.plaza_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  value smallint not null check (value in (1, -1)),
  created_at timestamptz default now(),
  primary key (comment_id, user_id)
);
alter table public.plaza_comment_votes enable row level security;
create policy pcv_select_own on public.plaza_comment_votes for select to authenticated using (auth.uid() = user_id);

-- 토글 투표: 같은 값 다시 누르면 취소, 다른 값이면 교체. 카운트 재계산 후 반환.
create or replace function public.vote_plaza_comment(p_comment_id uuid, p_value smallint)
returns table(like_count int, dislike_count int, my_vote smallint)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing smallint;
begin
  if v_uid is null then
    raise exception 'login required';
  end if;
  if p_value not in (1, -1) then
    raise exception 'invalid value';
  end if;

  select value into v_existing from plaza_comment_votes
    where comment_id = p_comment_id and user_id = v_uid;

  if v_existing is null then
    insert into plaza_comment_votes(comment_id, user_id, value) values (p_comment_id, v_uid, p_value);
  elsif v_existing = p_value then
    delete from plaza_comment_votes where comment_id = p_comment_id and user_id = v_uid;
  else
    update plaza_comment_votes set value = p_value where comment_id = p_comment_id and user_id = v_uid;
  end if;

  update plaza_comments c set
    like_count = (select count(*) from plaza_comment_votes v where v.comment_id = c.id and v.value = 1),
    dislike_count = (select count(*) from plaza_comment_votes v where v.comment_id = c.id and v.value = -1)
  where c.id = p_comment_id;

  return query
    select c.like_count, c.dislike_count,
      (select v.value from plaza_comment_votes v where v.comment_id = c.id and v.user_id = v_uid)
    from plaza_comments c where c.id = p_comment_id;
end;
$$;
revoke all on function public.vote_plaza_comment(uuid, smallint) from public;
grant execute on function public.vote_plaza_comment(uuid, smallint) to authenticated;
