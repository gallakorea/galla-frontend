-- ============================================================
-- 팔로우 알림 — 누가 나를 팔로우하면 알림 (인스타식 '팔로워' 유형)
-- follows(follower → following) INSERT 시 following 에게 알림.
-- ============================================================

create or replace function public.trg_notify_follow()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform public._notify(
    NEW.following,                 -- 받는 사람 (팔로우 당한 쪽)
    NEW.follower,                  -- 보낸 사람
    'follow',
    null,                          -- 이슈와 무관
    public._nick(NEW.follower) || '님이 회원님을 팔로우하기 시작했습니다.',
    'mypage.html?user=' || NEW.follower
  );
  return NEW;
exception when others then return NEW;   -- 알림 실패가 팔로우를 막지 않도록
end $$;

drop trigger if exists notify_follow on public.follows;
create trigger notify_follow
  after insert on public.follows
  for each row execute function public.trg_notify_follow();
