/* 카운터가 어긋나는 경로는 '삭제'다.
   plaza_posts.up_count 는 vote_plaza_post 가, comments.*_count 는 battle_action 이 챙기는데
   둘 다 유저가 직접 부를 때만 돈다. 계정 삭제로 투표·전투 행이 CASCADE 로 사라지면
   카운터는 부풀린 채 남는다(실측: 광장 946개 중 1개, 댓글 150개 중 1개).
   삭제에만 재계산 트리거를 건다 — battle_action 은 증가식이라 INSERT 에 걸면 이중 계산이 난다. */

create or replace function public.trg_recount_plaza_votes() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update plaza_posts pp set
    up_count   = (select count(*) from plaza_votes v where v.post_id = pp.id and v.vote = 1),
    down_count = (select count(*) from plaza_votes v where v.post_id = pp.id and v.vote = -1)
  where pp.id = old.post_id;
  return old;
end $$;

drop trigger if exists recount_plaza_votes on public.plaza_votes;
create trigger recount_plaza_votes after delete on public.plaza_votes
  for each row execute function public.trg_recount_plaza_votes();

create or replace function public.trg_recount_comment_actions() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update comments c set
    attack_count  = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='attack'),
    defense_count = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='defend'),
    support_count = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='support')
  where c.id = old.comment_id;
  return old;
end $$;

drop trigger if exists recount_comment_actions on public.comment_actions;
create trigger recount_comment_actions after delete on public.comment_actions
  for each row execute function public.trg_recount_comment_actions();

-- 이미 어긋나 있는 것 보정
update plaza_posts pp set
  up_count   = (select count(*) from plaza_votes v where v.post_id=pp.id and v.vote=1),
  down_count = (select count(*) from plaza_votes v where v.post_id=pp.id and v.vote=-1)
where pp.up_count   is distinct from (select count(*) from plaza_votes v where v.post_id=pp.id and v.vote=1)
   or pp.down_count is distinct from (select count(*) from plaza_votes v where v.post_id=pp.id and v.vote=-1);

update comments c set
  attack_count  = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='attack'),
  defense_count = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='defend'),
  support_count = (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='support')
where c.attack_count  is distinct from (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='attack')
   or c.defense_count is distinct from (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='defend')
   or c.support_count is distinct from (select count(*) from comment_actions a where a.comment_id=c.id and a.action_type='support');
