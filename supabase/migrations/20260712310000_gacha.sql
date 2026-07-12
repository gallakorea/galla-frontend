-- 🎰 갈라 뽑기(가챠) — GP 소비 후 가중 랜덤 보상(코스메틱/부스트/GP). 강력한 반복 싱크
-- 비용 700GP. 기대값 < 비용(순 싱크)이나 코스메틱 대박 여지로 재미

create table if not exists public.gacha_pulls (
  id bigint generated always as identity primary key,
  user_id uuid not null, reward_type text not null, reward_key text, reward_gp int,
  created_at timestamptz not null default now()
);
alter table public.gacha_pulls enable row level security;
drop policy if exists gacha_pulls_self on public.gacha_pulls;
create policy gacha_pulls_self on public.gacha_pulls for select using (auth.uid() = user_id);

create or replace function public.gacha_draw()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  c_cost constant int := 700;
  v_bal double precision; v_roll double precision := random();
  v_type text; v_key text; v_gp int := 0; v_label text; v_grade text := 'common';
  v_pick text;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  insert into point_balances(user_id) values (v_user) on conflict do nothing;
  select balance into v_bal from point_balances where user_id=v_user for update;
  if coalesce(v_bal,0) < c_cost then return jsonb_build_object('ok',false,'reason','insufficient'); end if;
  update point_balances set balance = balance - c_cost, updated_at=now() where user_id=v_user;
  insert into point_ledger(user_id, delta, reason) values (v_user, -c_cost, 'gacha');

  -- 가중 추첨
  if v_roll < 0.40 then v_type:='gp'; v_gp:=100; v_label:='+100 GP';
  elsif v_roll < 0.65 then v_type:='gp'; v_gp:=300; v_label:='+300 GP';
  elsif v_roll < 0.80 then
    -- 스티커 팩(미보유 우선)
    select k into v_pick from (select unnest(array['sticker_pack_2','sticker_pack_3']) k) t
      where not exists (select 1 from user_items where user_id=v_user and item_key=t.k and qty>0) order by random() limit 1;
    if v_pick is not null then
      insert into user_items(user_id,item_key,qty) values(v_user,v_pick,1)
        on conflict (user_id,item_key) do update set qty=user_items.qty+1;
      v_type:='sticker'; v_key:=v_pick; v_grade:='rare';
      v_label:= case v_pick when 'sticker_pack_2' then '🔥 감정폭발 스티커팩!' else '💢 정시밈 스티커팩!' end;
    else v_type:='gp'; v_gp:=500; v_label:='+500 GP'; end if;
  elsif v_roll < 0.90 then v_type:='gp'; v_gp:=1000; v_label:='+1,000 GP'; v_grade:='rare';
  elsif v_roll < 0.97 then
    -- 칭호(미보유 중저가 우선)
    select k into v_pick from (select unnest(array['breaker','warrior','sniper','factbomb','spy']) k) t
      where not exists (select 1 from user_titles where user_id=v_user and title_key=t.k) order by random() limit 1;
    if v_pick is not null then
      insert into user_titles(user_id,title_key) values(v_user,v_pick) on conflict do nothing;
      v_type:='title'; v_key:=v_pick; v_grade:='epic';
      v_label:='🏷️ 칭호 획득: '||(select name from _title_info(v_pick));
    else v_type:='gp'; v_gp:=800; v_label:='+800 GP'; end if;
  elsif v_roll < 0.995 then
    -- 닉네임 스타일(미보유 우선)
    select k into v_pick from (select unnest(array['ice','neon','toxic','fire','royal']) k) t
      where not exists (select 1 from user_nickstyles where user_id=v_user and style_key=t.k) order by random() limit 1;
    if v_pick is not null then
      insert into user_nickstyles(user_id,style_key) values(v_user,v_pick) on conflict do nothing;
      v_type:='nickstyle'; v_key:=v_pick; v_grade:='epic';
      v_label:='🎨 닉 스타일 획득: '||(select name from _nickstyle_info(v_pick));
    else v_type:='gp'; v_gp:=1500; v_label:='+1,500 GP'; end if;
  else
    v_type:='gp'; v_gp:=5000; v_label:='💎 잭팟! +5,000 GP'; v_grade:='legendary';
  end if;

  if v_gp > 0 then
    update point_balances set balance = balance + v_gp, updated_at=now() where user_id=v_user;
    insert into point_ledger(user_id, delta, reason) values (v_user, v_gp, 'gacha_win');
  end if;
  insert into gacha_pulls(user_id, reward_type, reward_key, reward_gp) values (v_user, v_type, v_key, v_gp);

  select balance into v_bal from point_balances where user_id=v_user;
  return jsonb_build_object('ok',true,'type',v_type,'key',v_key,'gp',v_gp,'label',v_label,'grade',v_grade,'balance',round(v_bal));
end $$;
grant execute on function public.gacha_draw() to authenticated;
