/* delete_issue 는 이슈를 하드 삭제하면서 자식들을 손으로 지운다. 그 목록에도
   ON DELETE CASCADE 에도 없는 표가 일곱 개였다 —
   battle_hp · battle_merits · duels · issue_arguments · remixes · ai_news_jobs · ai_trends.
   이슈를 지우면 그대로 고아가 된다. 실제로 ai_news_jobs 3행 · ai_trends 3행이 이미 그랬다.
   손으로 챙기는 목록은 표가 늘 때마다 또 빠진다. FK 로 못박는다.

   ⚠️ 일곱 중 넷(ai_news_jobs · ai_trends · issue_arguments · remixes)은 마이그레이션 없이
   DB 에서 직접 만들어진 표다. 처음부터 재생하면 존재하지 않으므로 전부 건너뛸 수 있게 감쌌다.
   (ai_trends 는 이후 20260831370000 에서 드롭됐다 — 여기서는 여전히 건너뛰기 대상이다.) */
do $$
declare
  t   text;
  act text;
  -- 표 → 삭제 시 동작. 일기토만 SET NULL 이다: 이미 정산된 GP 와 응원 베팅이
  -- 매달려 있어 기록은 지키고 맥락만 끊는다.
  spec text[][] := array[
    array['ai_news_jobs',    'cascade'],
    array['ai_trends',       'cascade'],
    array['battle_hp',       'cascade'],
    array['battle_merits',   'cascade'],
    array['issue_arguments', 'cascade'],
    array['remixes',         'cascade'],
    array['duels',           'set null']
  ];
begin
  for i in 1..array_length(spec, 1) loop
    t := spec[i][1]; act := spec[i][2];
    if to_regclass('public.' || t) is null then
      raise notice '건너뜀 — % 없음', t; continue;
    end if;
    if exists (select 1 from pg_constraint
                where conrelid = ('public.' || t)::regclass
                  and conname  = t || '_issue_fk') then
      raise notice '건너뜀 — % FK 이미 있음', t; continue;
    end if;

    -- FK 를 걸려면 먼저 고아를 치워야 한다
    execute format(
      'delete from public.%I x where x.issue_id is not null'
      ' and not exists (select 1 from public.issues i where i.id = x.issue_id)', t);

    execute format(
      'alter table public.%I add constraint %I foreign key (issue_id)'
      ' references public.issues(id) on delete %s', t, t || '_issue_fk', act);
  end loop;
end $$;
