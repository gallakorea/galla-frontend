-- 🐞 버그 신고가 접수되면 관리자에게 알림
--
-- 배경: 신고 기능은 멀쩡히 살아 있는데 접수가 0건이었다. 진입점이 설정 화면 한 곳뿐인 게
--   주원인이지만(프론트에서 별도 해결), 설령 들어와도 관리자가 관제센터를 직접 열어보기
--   전까지는 아무도 모르는 구조라는 문제도 있었다. 알림으로 밀어준다.
--
-- 설계:
-- · 트리거로 붙인다 — submit_bug 본문을 건드리면 신고 접수 자체가 위험해진다(알림 실패가
--   신고 실패로 번짐). 트리거도 같은 트랜잭션이라 예외는 여전히 전파되므로 아래처럼 감싼다.
-- · 알림 삽입이 실패해도 신고는 반드시 남아야 한다 → exception 블록으로 통째로 삼킨다.
--   버그 신고를 잃는 것보다 알림 한 건을 잃는 게 낫다.
-- · 본인이 신고했으면 자기 자신에겐 안 보낸다(관리자도 버그를 신고한다).
-- · notifications.type에 CHECK 제약이 없어 새 타입 'bug_report'를 그대로 쓸 수 있다(확인함).
--   프론트 유형 맵에 없는 타입은 '기타'로 떨어지므로 알림 화면도 깨지지 않는다.

create or replace function public._trg_bug_notify_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  begin
    insert into notifications(user_id, from_user, type, message, link)
    select p.user_id, new.user_id, 'bug_report'::text,
           '🐞 버그 신고 도착 — ' || left(regexp_replace(new.message, '\s+', ' ', 'g'), 40),
           'admin.html?mod=bugs'
    from user_profiles p
    where coalesce(p.admin_flag, false)
      and p.user_id is distinct from new.user_id;   -- 내가 신고한 걸 나에게 알리지 않는다
  exception when others then
    null;   -- ★ 알림 실패가 신고 접수를 되돌리지 않게. 신고 본문이 훨씬 중요하다.
  end;
  return new;
end $$;

drop trigger if exists trg_bug_notify_admin on public.bug_reports;
create trigger trg_bug_notify_admin
  after insert on public.bug_reports
  for each row execute function public._trg_bug_notify_admin();
