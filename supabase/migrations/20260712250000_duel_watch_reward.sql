-- 🗳️ 관전 보상: 관중이 승자 투표 시 소액 GP 지급(첫 투표만, 일일 상한으로 파밍 방지)
-- _award(reason,cap) 재사용 — reason별 일일 횟수 상한

create or replace function public.duel_vote(p_duel bigint, p_choice text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_first boolean := false;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_choice not in ('challenger','opponent') then return jsonb_build_object('ok',false,'reason','bad_choice'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status not in ('live','voting') then return jsonb_build_object('ok',false,'reason','not_open'); end if;
  if v_user = d.challenger or v_user = d.opponent then return jsonb_build_object('ok',false,'reason','is_party'); end if;

  if not exists (select 1 from duel_votes where duel_id=p_duel and voter=v_user) then v_first := true; end if;
  insert into duel_votes(duel_id, voter, choice) values (p_duel, v_user, p_choice)
    on conflict (duel_id, voter) do update set choice = excluded.choice;

  update duels set
    vote_challenger=(select count(*) from duel_votes where duel_id=p_duel and choice='challenger'),
    vote_opponent  =(select count(*) from duel_votes where duel_id=p_duel and choice='opponent')
  where id=p_duel;

  -- 첫 투표 관전 보상 15GP (일 20회 상한)
  if v_first then perform _award(v_user, 15, 'duel_watch', 20); end if;
  return jsonb_build_object('ok',true,'rewarded',v_first);
end $$;

grant execute on function public.duel_vote(bigint,text) to authenticated;
