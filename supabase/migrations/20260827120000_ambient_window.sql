-- =========================================================
-- 갈비스가 먼저 거는 턴(ambient)에도 한도를 준다
--
-- 무료를 5턴으로 조이고 나니 구멍이 드러났다: **갈비스가 먼저 말 거는 턴에는 한도가 없다.**
--   ai_gate 는 그 등급에 규칙이 없는 fn 을 '제한 없음'으로 통과시킨다.
--   free 에만 규칙이 있고 나머지 다섯 등급엔 없었다 — 즉 사실상 무제한이었다.
--
-- 왜 문제인가
--   ① 원가: 사용자가 아무 말 안 해도 돈이 나간다. 실측으로 3턴 대화에 갈비스가 8번 먼저 걸었다.
--   ② 전환: 무료 5턴으로 조인 의미가 없다 — 갈비스가 스스로 말 걸어 대화를 이어가면
--      사용자는 한도에 부딪히지 않고, 부딪혀야 올릴 생각을 한다.
--
-- ⚠️ 그렇다고 0 으로 막으면 안 된다. 먼저 말 거는 건 갈비스를 갈비스로 만드는 것이다 —
--    침묵하는 친구는 친구가 아니다. 등급에 비례해서 주되 사용자 몫보다 훨씬 적게.
-- =========================================================

update app_settings set v = (
  select jsonb_object_agg(t.k,
    jsonb_set(t.val, '{windows,galla-friend-ambient}',
      jsonb_build_object('n',
        case t.k
          when 'guest'               then 1
          when 'free'                then 2
          when 'companion_sometimes' then 6
          when 'companion_daily'     then 10
          when 'companion_plus'      then 10
          when 'companion_always'    then 20
          else 2 end,
        'hours', 24)))
  from jsonb_each(v) t(k, val)
) where k = 'ai_tiers';

do $$
declare r record;
begin
  for r in select t.k as tier,
                  (a.v -> t.k -> 'windows' -> 'galla-friend-ambient' ->> 'n')::int as amb,
                  (a.v -> t.k -> 'windows' -> 'galla-friend' ->> 'n')::int as own
             from app_settings a, lateral jsonb_object_keys(a.v) t(k)
            where a.k = 'ai_tiers'
  loop
    if r.amb is null then raise exception '% 에 ambient 한도가 없다 — 무제한이 된다', r.tier; end if;
    -- 갈비스가 먼저 거는 게 사용자 몫보다 많으면 한도의 주인이 뒤바뀐다
    if r.own is not null and r.amb > r.own then
      raise exception '% : ambient(%) 가 사용자 몫(%) 보다 많다', r.tier, r.amb, r.own;
    end if;
  end loop;
end $$;
