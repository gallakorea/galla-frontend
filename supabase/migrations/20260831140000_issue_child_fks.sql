/* delete_issue 는 이슈를 하드 삭제하면서 자식들을 손으로 지운다.
   그 목록에도, ON DELETE CASCADE 에도 없는 표들이 있었다 —
   battle_hp · battle_merits · duels · issue_arguments · remixes · ai_news_jobs · ai_trends.
   이슈를 지우면 그대로 고아가 된다. 실제로 ai_news_jobs 3행 · ai_trends 3행이 이미 그랬다.
   손으로 챙기는 목록은 언젠가 또 빠진다. FK 로 못박는다. */

delete from ai_news_jobs x where not exists (select 1 from issues i where i.id = x.issue_id);
delete from ai_trends    x where not exists (select 1 from issues i where i.id = x.issue_id);

alter table public.ai_news_jobs    add constraint ai_news_jobs_issue_fk    foreign key (issue_id) references public.issues(id) on delete cascade;
alter table public.ai_trends       add constraint ai_trends_issue_fk       foreign key (issue_id) references public.issues(id) on delete cascade;
alter table public.battle_hp       add constraint battle_hp_issue_fk       foreign key (issue_id) references public.issues(id) on delete cascade;
alter table public.battle_merits   add constraint battle_merits_issue_fk   foreign key (issue_id) references public.issues(id) on delete cascade;
alter table public.issue_arguments add constraint issue_arguments_issue_fk foreign key (issue_id) references public.issues(id) on delete cascade;
alter table public.remixes         add constraint remixes_issue_fk         foreign key (issue_id) references public.issues(id) on delete cascade;

/* 일기토는 이슈가 사라져도 남는다 — 이미 정산된 GP 와 응원 베팅이 매달려 있다.
   맥락만 끊고 기록은 지키다. */
alter table public.duels           add constraint duels_issue_fk           foreign key (issue_id) references public.issues(id) on delete set null;
