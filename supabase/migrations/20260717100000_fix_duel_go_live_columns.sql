-- =========================================================
-- 🐛 일기토 수락 100% 실패 버그 수정 (2026-07-17)
--
-- 증상: 즉시(instant) 일기토를 수락하면 항상 "요청을 처리하지 못했어요".
-- 원인: _duel_go_live 의 관중 fan-out INSERT에서 컬럼과 값의 순서가 어긋남.
--   insert into notifications(user_id, type,         from_user,    ...)
--   select                    u,       d.challenger, 'duel_watch', ...
--                                      ↑uuid→type(text)  ↑text→from_user(uuid)
--   → ERROR: column "from_user" is of type uuid but expression is of type text (42804)
--   ★INSERT..SELECT 타입 불일치는 '행이 0개여도' plan 단계에서 터진다. 그래서
--     관중이 없어도 무조건 실패했고, duel_respond 전체가 예외로 롤백되어
--     프론트엔 reason 없는 '알 수 없는 오류'만 떴다.
--   예약(scheduled)은 이 함수를 안 타고, duel_challenge는 _duel_notify를 써서 멀쩡했음
--   → '즉시 대결 수락'만 실패하는 형태로 위장돼 원인 파악이 늦었다.
--
-- 수정: type/from_user 순서 정렬. 나머지 로직 동일.
-- =========================================================
create or replace function public._duel_go_live(p_duel bigint)
returns void
language plpgsql security definer set search_path to 'public'
as $function$
declare d duels%rowtype; v_nick text;
begin
  select * into d from duels where id = p_duel for update;
  if d.status not in ('pending','scheduled') then return; end if;
  update duels set status='live', live_started_at=now(),
    live_ends_at = now() + make_interval(secs => d.time_limit_secs)
   where id = p_duel;
  select nickname into v_nick from users where id = d.challenger;
  -- 파이터 알림
  perform _duel_notify(d.challenger, d.opponent, 'duel_live', '일기토 개시! ⚔️ 링에 입장하세요', p_duel);
  perform _duel_notify(d.opponent, d.challenger, 'duel_live', '일기토 개시! ⚔️ 링에 입장하세요', p_duel);
  -- 관중 fan-out: 그 이슈 참여자(투표/댓글)에게
  -- ⚠️ 컬럼 목록과 select 순서를 반드시 일치시킬 것 (예전에 type↔from_user가 뒤바뀌어
  --    즉시 대결 수락이 전부 실패했다). 명시적 캐스팅으로 재발도 방지.
  if d.issue_id is not null then
    insert into notifications(user_id, from_user, type, message, link)
    select distinct s.u, d.challenger, 'duel_watch'::text,
      '🔴 지금 일기토 생중계 — “'||left(d.topic,20)||'” 관전하러 가기',
      'duel.html?id='||p_duel
    from (
      select user_id u from votes where issue_id = d.issue_id
      union select user_id from comments where issue_id = d.issue_id
    ) s
    where s.u is not null and s.u <> d.challenger and s.u <> d.opponent
    limit 500;
  end if;
end $function$;
