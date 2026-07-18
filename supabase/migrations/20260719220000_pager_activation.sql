-- 📟 개통 경험: 첫 진입 시 자동 발급하지 않는다 — '개통식'을 거친다
--   pager_my_box()        : 조회만. 없으면 {activated:false} (더는 몰래 만들지 않음)
--   pager_activate_random(): 랜덤 번호로 개통(기존 발급 로직 이관)
--   pager_pick_number()   : 사서함이 없으면 '그 번호로' 새로 개통(선택 개통)

create or replace function public.pager_my_box()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v record;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into v from pager_boxes where user_id = me;
  if not found then
    return jsonb_build_object('ok', true, 'activated', false);
  end if;
  return jsonb_build_object('ok', true, 'activated', true, 'number', v.number,
    'greeting_url', v.greeting_url, 'greeting_dur', v.greeting_dur,
    'unread', (select count(*) from pager_messages where box_owner = me and listened_at is null));
end $$;

create or replace function public.pager_activate_random()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d text; n text; i int := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if exists (select 1 from pager_boxes where user_id = me) then
    return (select jsonb_build_object('ok', true, 'number', number) from pager_boxes where user_id = me);
  end if;
  loop
    i := i + 1;
    d := lpad((floor(random() * 10000000))::bigint::text, 7, '0');
    n := '012-' || substr(d, 1, 3) || '-' || substr(d, 4);
    exit when not exists (select 1 from pager_boxes where number = n) or i > 30;
  end loop;
  insert into pager_boxes(user_id, number) values (me, n) on conflict (user_id) do nothing;
  return (select jsonb_build_object('ok', true, 'number', number) from pager_boxes where user_id = me);
end $$;
grant execute on function public.pager_activate_random() to authenticated;

-- 선택 개통: 사서함 없으면 그 번호로 신규 개통(있으면 번호 변경)
create or replace function public.pager_pick_number(p_digits text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d text; n text; allow7 boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  d := regexp_replace(coalesce(p_digits, ''), '[^0-9]', '', 'g');
  if d !~ '^[0-9]{7,8}$' then return jsonb_build_object('ok', false, 'reason', 'bad_format'); end if;
  select coalesce((v->>'allow7')::boolean, true) into allow7 from app_settings where k = 'pager';
  if length(d) = 7 and not coalesce(allow7, true) then
    return jsonb_build_object('ok', false, 'reason', 'need8');
  end if;
  n := case when length(d) = 7
        then '012-' || substr(d, 1, 3) || '-' || substr(d, 4)
        else '012-' || substr(d, 1, 4) || '-' || substr(d, 5) end;
  if exists (select 1 from pager_boxes where number = n and user_id <> me) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  insert into pager_boxes(user_id, number) values (me, n)
    on conflict (user_id) do update set number = excluded.number, updated_at = now();
  return jsonb_build_object('ok', true, 'number', n);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'taken');
end $$;
