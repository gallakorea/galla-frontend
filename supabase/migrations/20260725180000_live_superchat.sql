-- 💸 라이브 슈퍼챗 — GC(현금성)로 호스트 후원. gc_donate 미러(20/50/30·self차단). 게임 GP 아님.
alter table public.donations add column if not exists live_room_id uuid references public.open_rooms(id) on delete set null;

create or replace function public.gc_donate_live(p_room uuid, p_amount int, p_message text default null, p_anonymous boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_creator uuid; v_bal int; v_fee int; v_charity int; v_net int; v_tier text; v_id uuid;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  -- 소액 쏘기 유도: 100원부터(사람들은 큰돈을 잘 안 쓴다 → 마이크로 팁으로 진입장벽 낮춤)
  if p_amount is null or p_amount < 100 or p_amount > 1000000 then return jsonb_build_object('ok',false,'reason','bad_amount'); end if;
  select owner_id into v_creator from open_rooms where id=p_room and kind='live';
  if v_creator is null then return jsonb_build_object('ok',false,'reason','no_room'); end if;
  if v_creator = v_uid then return jsonb_build_object('ok',false,'reason','self'); end if;

  select balance into v_bal from gc_balances where user_id=v_uid for update;
  if coalesce(v_bal,0) < p_amount then return jsonb_build_object('ok',false,'reason','insufficient','balance',coalesce(v_bal,0)); end if;

  v_fee := floor(p_amount * 0.2)::int; v_charity := floor(p_amount * 0.3)::int; v_net := p_amount - v_fee - v_charity;
  begin v_tier := _donation_tier(p_amount); exception when others then v_tier := 'live'; end;

  update gc_balances set balance = balance - p_amount, updated_at=now() where user_id=v_uid;
  insert into donations(live_room_id, creator_id, supporter_id, amount, fee, charity, net,
                        message, is_anonymous, tier, status, method, paid_at)
    values (p_room, v_creator, v_uid, p_amount, v_fee, v_charity, v_net,
            nullif(btrim(left(coalesce(p_message,''),200)),''), coalesce(p_anonymous,false), v_tier, 'paid', 'gc', now())
    returning id into v_id;
  insert into gc_ledger(user_id, delta, reason, ref_id) values (v_uid, -p_amount, 'gc:donate_live', v_id);
  return jsonb_build_object('ok',true,'donation_id',v_id,'amount',p_amount,'net',v_net,'tier',v_tier,'balance',v_bal-p_amount);
end $$;
grant execute on function public.gc_donate_live(uuid,int,text,boolean) to authenticated;
