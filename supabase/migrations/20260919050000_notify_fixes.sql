-- 🔔 알림 전면 QA(26.9.19)
-- ① 후원 알림: 'GP' 로 적혀 나갔다(후원은 원화·갈라코인) → 원. 이동 주소를 늘 issue.html 로 만들어
--    숏판·광장·예측·라이브·앱 결제 후원은 issue_id 가 비어 링크가 통째로 NULL 이었다 → 대상별 주소.
-- ② 알림이 아예 없던 행동: 이슈 좋아요 · 숏판/롱판 좋아요 · 숏판/롱판 댓글(+답글) · 숏판 댓글 좋아요
-- ③ 버그헌터 감지: 백업 테이블 RLS 꺼짐 + anon 읽기 가능 → 잠금

create or replace function public.trg_notify_donation()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_who text; v_msg text; v_link text;
begin
  if coalesce(NEW.status, '') not in ('paid', 'succeeded', 'completed') then return NEW; end if;
  if TG_OP = 'UPDATE' and coalesce(OLD.status, '') = coalesce(NEW.status, '') then return NEW; end if;
  v_who := case when NEW.is_anonymous then '익명의 후원자' else public._nick(NEW.supporter_id) end;
  v_msg := v_who || '님이 ' || to_char(NEW.amount, 'FM999,999,999') || '원을 후원했어요! 💝'
           || coalesce(' — "' || nullif(NEW.message, '') || '"', '');
  v_link := case
    when NEW.issue_id is not null then 'issue.html?id=' || NEW.issue_id
    when NEW.post_id is not null then 'gallari-post.html?id=' || NEW.post_id
    when NEW.plaza_post_id is not null then 'plaza_detail.html?id=' || NEW.plaza_post_id
    when NEW.market_id is not null then 'predict-market.html?id=' || NEW.market_id
    else 'revenue-settlement.html' end;
  if NEW.is_anonymous then
    perform public._notify_sys(NEW.creator_id, 'donation', NEW.issue_id, v_msg, v_link);
  else
    perform public._notify(NEW.creator_id, NEW.supporter_id, 'donation', NEW.issue_id, v_msg, v_link);
  end if;
  return NEW;
exception when others then return NEW;
end $$;

-- 이슈 좋아요
create or replace function public.trg_notify_issue_like()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_title text;
begin
  select user_id, title into v_owner, v_title from issues where id = NEW.issue_id;
  perform public._notify(v_owner, NEW.user_id, 'like', NEW.issue_id,
    public._nick(NEW.user_id) || '님이 회원님의 이슈를 좋아해요: ' || left(coalesce(v_title, ''), 40),
    'issue.html?id=' || NEW.issue_id);
  return NEW;
exception when others then return NEW;
end $$;
drop trigger if exists notify_issue_like on public.issue_likes;
create trigger notify_issue_like after insert on public.issue_likes for each row execute function public.trg_notify_issue_like();

-- 숏판·롱판 좋아요
create or replace function public.trg_notify_post_like()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_kind text;
begin
  select user_id, kind into v_owner, v_kind from posts where id = NEW.post_id;
  perform public._notify(v_owner, NEW.user_id, 'like', null,
    public._nick(NEW.user_id) || '님이 회원님의 ' || case when v_kind = 'horizontal' then '롱판' else '숏판' end || '을 좋아해요.',
    'gallari-post.html?id=' || NEW.post_id);
  return NEW;
exception when others then return NEW;
end $$;
drop trigger if exists notify_post_like on public.post_likes;
create trigger notify_post_like after insert on public.post_likes for each row execute function public.trg_notify_post_like();

-- 숏판·롱판 댓글(글쓴이에게) + 답글(원댓글 쓴이에게)
create or replace function public.trg_notify_post_comment()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_kind text; v_parent uuid; v_body text := left(coalesce(NEW.body, ''), 40);
begin
  select user_id, kind into v_owner, v_kind from posts where id = NEW.post_id;
  if NEW.parent_id is not null then
    select user_id into v_parent from post_comments where id = NEW.parent_id;
    perform public._notify(v_parent, NEW.user_id, 'reply', null,
      public._nick(NEW.user_id) || '님이 회원님의 댓글에 답글: ' || v_body, 'gallari-post.html?id=' || NEW.post_id || '#comments');
  end if;
  if v_owner is distinct from v_parent then
    perform public._notify(v_owner, NEW.user_id, 'comment', null,
      public._nick(NEW.user_id) || '님이 회원님의 ' || case when v_kind = 'horizontal' then '롱판' else '숏판' end || '에 댓글: ' || v_body,
      'gallari-post.html?id=' || NEW.post_id || '#comments');
  end if;
  return NEW;
exception when others then return NEW;
end $$;
drop trigger if exists notify_post_comment on public.post_comments;
create trigger notify_post_comment after insert on public.post_comments for each row execute function public.trg_notify_post_comment();

-- 숏판 댓글 좋아요
create or replace function public.trg_notify_post_comment_like()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_owner uuid; v_post bigint; v_body text;
begin
  select user_id, post_id, left(coalesce(body, ''), 30) into v_owner, v_post, v_body from post_comments where id = NEW.comment_id;
  perform public._notify(v_owner, NEW.user_id, 'like', null,
    public._nick(NEW.user_id) || '님이 회원님의 댓글을 좋아해요: ' || v_body, 'gallari-post.html?id=' || v_post || '#comments');
  return NEW;
exception when others then return NEW;
end $$;
drop trigger if exists notify_post_comment_like on public.post_comment_likes;
create trigger notify_post_comment_like after insert on public.post_comment_likes for each row execute function public.trg_notify_post_comment_like();

-- ③ 백업 테이블 잠금
alter table if exists public.travel_places_admin1_backup_20260918 enable row level security;
revoke all on table public.travel_places_admin1_backup_20260918 from anon, authenticated;
