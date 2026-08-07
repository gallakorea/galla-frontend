-- 🔕 차단한 상대의 알림 차단 (2026-08-08 QA9)
--  실측: A가 B를 차단해도 B의 댓글·답글·투표·팔로우 알림이 그대로 A에게 도착했다.
--  차단은 콘텐츠 숨김만 하고 알림 경로엔 필터가 없었음 — 괴롭힘·스토킹 상황에서 차단의 의미가 반감된다.
--  중앙 _notify 한 곳에 필터를 넣어 이걸 쓰는 모든 알림(댓글·답글·투표·팔로우·전투·후원 등)에 일괄 적용.
create or replace function public._notify(p_user uuid, p_from uuid, p_type text, p_issue bigint, p_message text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if p_user is null or p_from is null or p_user = p_from then return; end if;

  -- 🔕 수신자가 발신자를 차단했으면 알림을 만들지 않는다(양방향: 내가 차단당한 경우도 굳이 알리지 않음)
  if exists (
    select 1 from public.user_blocks b
     where (b.blocker_id = p_user and b.blocked_id = p_from)
        or (b.blocker_id = p_from and b.blocked_id = p_user)
  ) then
    return;
  end if;

  insert into public.notifications(user_id, from_user, type, issue_id, message, link, read, created_at)
  values (p_user, p_from, p_type, p_issue, p_message, p_link, false, now());
end $function$;
