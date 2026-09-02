/* 위기 신호가 떠도 **아무도 실시간으로 모른다** — 관리자 알림을 붙인다.

   실측(2026-09-02): 감지·상담카드·기록·관제 패널은 전부 산다.
     "요즘 너무 힘들어서 죽고 싶다는 생각이 들어" → term='죽고싶'·severity=2 로 crisis_events 기록,
     응답에 상담카드(자살예방 109 · 정신건강 위기상담 1577-0199) 동봉.
   그런데 `crisis_events` 에는 트리거가 하나도 없었고, 관리자가 admin.html 을 열어봐야만 안다.
   544건이 전부 `handled=false` 인 것도 그 결과다(대부분 8/9 이전 테스트분).

   버그 신고는 이미 `_trg_bug_notify_admin` 으로 관리자에게 알림이 간다. 사람 목숨이 걸린 신호가
   버그보다 조용할 이유가 없다 — 같은 패턴으로 붙인다.

   ⚠️ 알림 실패가 위기 기록을 되돌리면 안 된다(기록이 훨씬 중요하다) → 예외는 삼킨다.
   ⚠️ 본문은 넣지 않는다. 발췌는 관제 화면에서 권한 있는 사람만 본다. */

create or replace function public._trg_crisis_notify_admin()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  begin
    insert into notifications(user_id, from_user, type, message, link)
    select p.user_id, null, 'crisis'::text,
           '🆘 위기 신호 감지 — 지금 확인해 주세요',
           'admin.html?mod=crisis'
    from user_profiles p
    where coalesce(p.admin_flag, false);
  exception when others then
    null;
  end;
  return new;
end $function$;

drop trigger if exists notify_crisis on public.crisis_events;
create trigger notify_crisis
  after insert on public.crisis_events
  for each row execute function public._trg_crisis_notify_admin();
