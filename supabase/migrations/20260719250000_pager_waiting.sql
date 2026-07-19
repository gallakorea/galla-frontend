-- 📟 미개통이어도 호출은 도착한다 — 개통식에서 '기다리는 호출 N통'을 알려준다
create or replace function public.pager_my_box()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v record;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into v from pager_boxes where user_id = me;
  if not found then
    return jsonb_build_object('ok', true, 'activated', false,
      'waiting', (select count(*) from pager_messages where box_owner = me and listened_at is null));
  end if;
  return jsonb_build_object('ok', true, 'activated', true, 'number', v.number,
    'greeting_url', v.greeting_url, 'greeting_dur', v.greeting_dur,
    'unread', (select count(*) from pager_messages where box_owner = me and listened_at is null));
end $$;
