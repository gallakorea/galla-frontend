-- 코스메틱 아이템 효과: 닉네임 골드(nick_deco) · 이모티콘(emoticon_pack)
-- 남들도 보이는 효과이므로 공개 조회용 플래그 테이블을 두고, 구매 시 트리거로 반영

create table if not exists public.user_cosmetics (
  user_id uuid primary key,
  nick_gold boolean not null default false,
  emoticon  boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.user_cosmetics enable row level security;

-- 코스메틱은 누구에게나 보여야 하므로 공개 조회 허용 (플래그만 있는 무해 데이터)
drop policy if exists user_cosmetics_read on public.user_cosmetics;
create policy user_cosmetics_read on public.user_cosmetics
  for select using (true);

-- user_items 변경 시 코스메틱 플래그 자동 반영 (nick_deco / emoticon_pack 보유 여부)
create or replace function public._sync_cosmetics(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_gold boolean; v_emo boolean;
begin
  select coalesce(max((item_key = 'nick_deco'    and qty > 0)::int),0)::boolean,
         coalesce(max((item_key = 'emoticon_pack' and qty > 0)::int),0)::boolean
    into v_gold, v_emo
    from user_items where user_id = p_user;
  insert into user_cosmetics (user_id, nick_gold, emoticon, updated_at)
    values (p_user, coalesce(v_gold,false), coalesce(v_emo,false), now())
  on conflict (user_id) do update
    set nick_gold = excluded.nick_gold, emoticon = excluded.emoticon, updated_at = now();
end $$;

create or replace function public._trg_sync_cosmetics()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._sync_cosmetics(coalesce(NEW.user_id, OLD.user_id));
  return NEW;
end $$;

drop trigger if exists trg_sync_cosmetics on public.user_items;
create trigger trg_sync_cosmetics after insert or update on public.user_items
  for each row execute function public._trg_sync_cosmetics();

-- 기존 보유자 백필
insert into public.user_cosmetics (user_id, nick_gold, emoticon)
select user_id,
       bool_or(item_key = 'nick_deco'    and qty > 0),
       bool_or(item_key = 'emoticon_pack' and qty > 0)
  from public.user_items
 group by user_id
on conflict (user_id) do update
  set nick_gold = excluded.nick_gold, emoticon = excluded.emoticon, updated_at = now();
