-- 📟 삐삐 번호 체계 확정: 012-XXX-XXXX (7자리, 뒷자리 4개) — 핸드폰처럼 '골라서 개통'
-- 초기엔 7자리, 공간이 차면 8자리(012-XXXX-XXXX)로 — app_settings로 무배포 전환.
-- 012는 실제 통신망 번호가 아니라 앱 내 가상 식별자(발신 불가)라 번호자원 규정과 무관.

insert into public.app_settings(k, v) values
  ('pager', jsonb_build_object('allow7', true))
on conflict (k) do nothing;

-- ── 기존 번호를 새 포맷으로 재정렬 (012-6659-196 → 012-665-9196) ──
update public.pager_boxes
   set number = '012-' || substr(d, 1, 3) || '-' || substr(d, 4)
  from (select user_id as uid, replace(replace(number, '012-', ''), '-', '') as d
          from public.pager_boxes) x
 where user_id = x.uid and length(x.d) = 7
   and number !~ '^012-[0-9]{3}-[0-9]{4}$';

-- ── 자동 발급도 새 포맷(7자리) ──
create or replace function public.pager_my_box()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v record; d text; n text; i int := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into v from pager_boxes where user_id = me;
  if not found then
    loop
      i := i + 1;
      d := lpad((floor(random() * 10000000))::bigint::text, 7, '0');
      n := '012-' || substr(d, 1, 3) || '-' || substr(d, 4);
      exit when not exists (select 1 from pager_boxes where number = n) or i > 30;
    end loop;
    insert into pager_boxes(user_id, number) values (me, n)
      on conflict (user_id) do nothing;
    select * into v from pager_boxes where user_id = me;
  end if;
  return jsonb_build_object('ok', true, 'number', v.number,
    'greeting_url', v.greeting_url, 'greeting_dur', v.greeting_dur,
    'unread', (select count(*) from pager_messages where box_owner = me and listened_at is null));
end $$;

-- ── 번호 선택 개통: 숫자 7자리(또는 8자리) — 중복은 여기서 최종 검증(경합 방어) ──
create or replace function public.pager_pick_number(p_digits text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); d text; n text; allow7 boolean;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  d := regexp_replace(coalesce(p_digits, ''), '[^0-9]', '', 'g');
  if d !~ '^[0-9]{7,8}$' then return jsonb_build_object('ok', false, 'reason', 'bad_format'); end if;
  select coalesce((v->>'allow7')::boolean, true) into allow7 from app_settings where k = 'pager';
  if length(d) = 7 and not coalesce(allow7, true) then
    return jsonb_build_object('ok', false, 'reason', 'need8');   -- 7자리 시대 종료 후
  end if;
  n := case when length(d) = 7
        then '012-' || substr(d, 1, 3) || '-' || substr(d, 4)
        else '012-' || substr(d, 1, 4) || '-' || substr(d, 5) end;
  perform pager_my_box();   -- 사서함 없으면 만들고
  if exists (select 1 from pager_boxes where number = n and user_id <> me) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  update pager_boxes set number = n, updated_at = now() where user_id = me;
  return jsonb_build_object('ok', true, 'number', n);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'taken');   -- 동시 개통 경합
end $$;
grant execute on function public.pager_pick_number(text) to authenticated;
