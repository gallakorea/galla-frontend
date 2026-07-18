-- 📟 삐삐 확장: ① 음성+숫자 동봉 ② 번호로 걸기(다이얼)
--
-- 그 시절 삐삐의 핵심은 '번호만 알면 누구에게든' 칠 수 있었다는 것.
-- 번호는 공개돼도 개인정보가 아니다(무작위 발급, 실명·연락처와 무관).

-- 음성 호출에 숫자를 같이 실을 수 있게 — kind='voice'여도 code 허용
create or replace function public.pager_leave(p_to uuid, p_kind text, p_url text default null,
                                              p_dur int default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_to = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if p_kind not in ('voice','code') then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  if p_kind = 'voice' and coalesce(p_url,'') = '' then return jsonb_build_object('ok', false, 'reason', 'no_voice'); end if;
  if p_kind = 'code' and coalesce(p_code,'') !~ '^[0-9.]{1,10}$' then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  -- 음성에 동봉된 숫자는 선택 — 있으면 형식만 검사
  if p_kind = 'voice' and p_code is not null and p_code !~ '^[0-9.]{1,10}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad_code');
  end if;
  if exists (select 1 from dm_blocks where (user_id = p_to and blocked = me) or (user_id = me and blocked = p_to)) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  if (select count(*) from pager_messages
       where box_owner = p_to and sender_id = me and created_at > now() - interval '1 minute') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;

  insert into pager_messages(box_owner, sender_id, kind, voice_url, dur, code)
    values (p_to, me, p_kind, p_url, p_dur, p_code);

  begin
    insert into notifications(user_id, from_user, type, message, link)
    values (p_to, me, 'pager',
      case when p_kind = 'code' then '📟 삐삐: ' || p_code
           when p_code is not null then '📟 음성 + ' || p_code
           else '📟 음성이 도착했어요' end,
      'dm.html?pager=1');
  exception when others then null;
  end;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.pager_leave(uuid, text, text, int, text) to authenticated;

-- 코드 컬럼 제약도 소수점(뒤집어 읽기 0.7734) 허용으로 완화
alter table public.pager_messages drop constraint if exists pager_messages_code_check;
alter table public.pager_messages add constraint pager_messages_code_check
  check (code is null or code ~ '^[0-9.]{1,10}$');

-- 번호로 상대 찾기 — 차단 관계는 '없는 번호'처럼(차단 사실 비노출)
create or replace function public.pager_dial(p_number text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v record;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select b.user_id, u.nickname, b.greeting_url into v
    from pager_boxes b join users u on u.id = b.user_id
   where b.number = btrim(p_number);
  if not found or v.user_id = me
     or exists (select 1 from dm_blocks where (user_id = v.user_id and blocked = me) or (user_id = me and blocked = v.user_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'user_id', v.user_id, 'nickname', v.nickname,
                            'has_greeting', v.greeting_url is not null);
end $$;
grant execute on function public.pager_dial(text) to authenticated;
