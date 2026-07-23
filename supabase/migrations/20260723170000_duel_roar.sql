-- =========================================================
-- 🦁 사자후(獅子吼) — 3초 음성 공격 아이템 (2026-07-23)
--  채팅방 음성(삐삐/DM)과 동일 구조: MediaRecorder→R2 업로드→URL 저장.
--  판당 1회, 고가(2000GP). duel_message에 음성으로 실려 옥타곤에 재생 가능하게.
-- =========================================================

alter table public.duels
  add column if not exists chal_roar boolean not null default false,   -- 도전자 사자후 사용
  add column if not exists opp_roar  boolean not null default false;   -- 응전자 사자후 사용
alter table public.duel_messages
  add column if not exists is_roar  boolean not null default false,    -- 🦁 사자후 발화
  add column if not exists roar_url text;                              -- 음성 파일 URL(R2)

-- 🦁 사자후 — 라이브 중 파이터가 1회, 3초 음성을 발사
create or replace function public.duel_roar(p_duel bigint, p_url text, p_dur int default 3)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); d duels%rowtype; v_side text; v_is_chal boolean; v_used boolean;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if coalesce(btrim(p_url),'')='' then return jsonb_build_object('ok',false,'reason','no_audio'); end if;
  select * into d from duels where id=p_duel for update;
  if d.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if d.status <> 'live' then return jsonb_build_object('ok',false,'reason','not_live'); end if;
  if d.live_ends_at is not null and now() >= d.live_ends_at then
    perform duel_resolve(p_duel);
    return jsonb_build_object('ok',false,'reason','time_over');
  end if;
  if v_user = d.challenger then v_side:='challenger'; v_is_chal:=true; v_used:=d.chal_roar;
  elsif v_user = d.opponent then v_side:='opponent'; v_is_chal:=false; v_used:=d.opp_roar;
  else return jsonb_build_object('ok',false,'reason','not_fighter'); end if;
  if v_used then return jsonb_build_object('ok',false,'reason','roar_used'); end if;

  if not _consume_item(v_user, 'duel_roar_pass', p_duel) then
    return jsonb_build_object('ok',false,'reason','no_roar'); end if;

  update duels set chal_roar = chal_roar or v_is_chal,
                   opp_roar  = opp_roar  or (not v_is_chal) where id=p_duel;

  insert into duel_messages(duel_id, user_id, side, body, is_roar, roar_url)
    values (p_duel, v_user, v_side, '🦁 사자후 '||greatest(1,least(coalesce(p_dur,3),5))||'초', true, p_url);
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.duel_roar(bigint,text,int) to authenticated;
revoke all on function public.duel_roar(bigint,text,int) from anon;
