-- 활동 알림 트리거 6종 — 내 콘텐츠에 대한 타인의 행위를 notifications에 기록
-- 공통: 본인 행위 제외, 트리거 실패가 원 액션을 롤백하지 않도록 EXCEPTION 무시

create or replace function public._notify(
  p_user uuid, p_from uuid, p_type text, p_issue bigint, p_message text, p_link text
) returns void language plpgsql security definer as $$
begin
  if p_user is null or p_from is null or p_user = p_from then return; end if;
  insert into public.notifications(user_id, from_user, type, issue_id, message, link, read, created_at)
  values (p_user, p_from, p_type, p_issue, p_message, p_link, false, now());
end $$;

create or replace function public._nick(p_user uuid) returns text language sql security definer as $$
  select coalesce(nullif(nickname,''), '누군가') from public.user_profiles where user_id = p_user limit 1;
$$;

-- 1. 댓글 좋아요/싫어요 → 댓글 주인
create or replace function public.trg_notify_comment_like() returns trigger language plpgsql security definer as $$
declare c record; begin
  select user_id, issue_id into c from public.comments where id = NEW.comment_id;
  perform public._notify(c.user_id, NEW.user_id,
    case when NEW.value = 1 then 'like' else 'dislike' end, c.issue_id,
    public._nick(NEW.user_id) || '님이 회원님의 댓글을 ' || case when NEW.value=1 then '좋아합니다 👍' else '싫어합니다 👎' end,
    'issue.html?id=' || c.issue_id);
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_comment_like on public.comment_likes;
create trigger notify_comment_like after insert on public.comment_likes
  for each row execute function public.trg_notify_comment_like();

-- 2. 전투 액션(공격/방어/지원) → 댓글 주인
create or replace function public.trg_notify_comment_action() returns trigger language plpgsql security definer as $$
declare c record; act text; begin
  select user_id, issue_id into c from public.comments where id = NEW.comment_id;
  act := case NEW.action_type when 'attack' then '💥 공격했습니다' when 'defend' then '🛡 방어해줬습니다' when 'support' then '💣 지원해줬습니다' else '반응했습니다' end;
  perform public._notify(c.user_id, NEW.user_id, NEW.action_type, c.issue_id,
    public._nick(NEW.user_id) || '님이 회원님의 댓글을 ' || act, 'issue.html?id=' || c.issue_id);
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_comment_action on public.comment_actions;
create trigger notify_comment_action after insert on public.comment_actions
  for each row execute function public.trg_notify_comment_action();

-- 3. 댓글/답글 → 답글이면 부모 댓글 주인(reply), 최상위면 이슈 주인(comment)
create or replace function public.trg_notify_comment() returns trigger language plpgsql security definer as $$
declare pu uuid; iu uuid; begin
  if NEW.parent_id is not null then
    select user_id into pu from public.comments where id = NEW.parent_id;
    perform public._notify(pu, NEW.user_id, 'reply', NEW.issue_id,
      public._nick(NEW.user_id) || '님이 회원님의 댓글에 답글을 남겼습니다 💬', 'issue.html?id=' || NEW.issue_id);
  else
    select user_id into iu from public.issues where id = NEW.issue_id;
    perform public._notify(iu, NEW.user_id, 'comment', NEW.issue_id,
      public._nick(NEW.user_id) || '님이 회원님의 갈라에 댓글을 남겼습니다 💬', 'issue.html?id=' || NEW.issue_id);
  end if;
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row execute function public.trg_notify_comment();

-- 4. 투표 → 이슈 주인
create or replace function public.trg_notify_vote() returns trigger language plpgsql security definer as $$
declare iu uuid; begin
  select user_id into iu from public.issues where id = NEW.issue_id;
  perform public._notify(iu, NEW.user_id, 'vote', NEW.issue_id,
    public._nick(NEW.user_id) || '님이 회원님의 갈라에 투표했습니다 🗳', 'issue.html?id=' || NEW.issue_id);
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_vote on public.votes;
create trigger notify_vote after insert on public.votes
  for each row execute function public.trg_notify_vote();

-- 5. 광장 추천 → 글 주인
create or replace function public.trg_notify_plaza_vote() returns trigger language plpgsql security definer as $$
declare pu uuid; begin
  if NEW.vote <> 1 then return NEW; end if;
  select user_id into pu from public.plaza_posts where id = NEW.post_id;
  perform public._notify(pu, NEW.user_id, 'plaza_like', null,
    public._nick(NEW.user_id) || '님이 회원님의 광장 글을 좋아합니다 👍', 'plaza_detail.html?id=' || NEW.post_id);
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_plaza_vote on public.plaza_votes;
create trigger notify_plaza_vote after insert on public.plaza_votes
  for each row execute function public.trg_notify_plaza_vote();

-- 6. 광장 댓글 → 답글이면 부모 댓글 주인, 최상위면 글 주인
create or replace function public.trg_notify_plaza_comment() returns trigger language plpgsql security definer as $$
declare pu uuid; begin
  if NEW.parent_id is not null then
    select user_id into pu from public.plaza_comments where id = NEW.parent_id;
  else
    select user_id into pu from public.plaza_posts where id = NEW.post_id;
  end if;
  perform public._notify(pu, NEW.user_id, 'plaza_comment', null,
    public._nick(NEW.user_id) || '님이 회원님의 광장 글에 댓글을 남겼습니다 💬', 'plaza_detail.html?id=' || NEW.post_id);
  return NEW;
exception when others then return NEW; end $$;
drop trigger if exists notify_plaza_comment on public.plaza_comments;
create trigger notify_plaza_comment after insert on public.plaza_comments
  for each row execute function public.trg_notify_plaza_comment();
