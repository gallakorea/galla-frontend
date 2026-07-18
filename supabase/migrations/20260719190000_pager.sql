-- ═══════════════════════════════════════════════════════════════
-- 📟 삐삐 — 음성사서함 (1990년대 감성)
--
-- 채팅과 절대 겹치지 않게 하는 것이 설계의 전부다:
--   채팅 = 즉시 · 실시간 · 읽음표시 · 입력중          (지금의 조급함)
--   삐삐 = 호출만 가고, 내용은 '사서함에 찾아가서' 듣는다 (그 시절의 기다림)
-- 그래서 여기엔 읽음표시도, 실시간 구독도, 답장 버튼도 없다. 일부러 없앴다.
--
-- 남기는 쪽도 조심스럽다: 녹음 → 스스로 한 번 들어보고 → 보낸다.
-- 보낸 뒤엔 목록에서 볼 수 없다(주워담을 수 없는 그 시절 그대로).
-- ═══════════════════════════════════════════════════════════════

-- 내 사서함: 삐삐 번호 + 인사말
create table if not exists public.pager_boxes (
  user_id uuid primary key references public.users(id) on delete cascade,
  number text not null unique,          -- 012-XXXX-XXX
  greeting_url text,                    -- 내가 녹음한 인사말
  greeting_dur int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pager_boxes enable row level security;
-- 번호·인사말은 공개(누가 나에게 남기려면 들을 수 있어야 한다)
drop policy if exists pager_boxes_read on public.pager_boxes;
create policy pager_boxes_read on public.pager_boxes for select to authenticated using (true);
drop policy if exists pager_boxes_own on public.pager_boxes;
create policy pager_boxes_own on public.pager_boxes for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select on public.pager_boxes to authenticated;
grant update (greeting_url, greeting_dur, updated_at) on public.pager_boxes to authenticated;

-- 도착한 호출/음성 — '받는 사람의 사서함'에만 쌓인다
create table if not exists public.pager_messages (
  id uuid primary key default gen_random_uuid(),
  box_owner uuid not null references public.users(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('voice','code')),
  voice_url text,
  dur int,
  code text check (code is null or code ~ '^[0-9]{1,10}$'),   -- 삐삐 암호(1004, 486…)
  listened_at timestamptz,              -- '들었다'는 나만 안다(발신자에게 안 알려준다)
  created_at timestamptz not null default now()
);
create index if not exists idx_pager_msgs_box on public.pager_messages(box_owner, created_at desc);
alter table public.pager_messages enable row level security;
-- ★ 받는 사람만 볼 수 있다. 보낸 사람도 자기가 보낸 걸 다시 볼 수 없다 —
--   "보내고 나면 어쩔 수 없는" 그 시절 감성이자, 채팅과의 결정적 차이.
drop policy if exists pager_msgs_read on public.pager_messages;
create policy pager_msgs_read on public.pager_messages for select to authenticated
  using (box_owner = auth.uid());
drop policy if exists pager_msgs_upd on public.pager_messages;
create policy pager_msgs_upd on public.pager_messages for update to authenticated
  using (box_owner = auth.uid()) with check (box_owner = auth.uid());
drop policy if exists pager_msgs_del on public.pager_messages;
create policy pager_msgs_del on public.pager_messages for delete to authenticated
  using (box_owner = auth.uid());
grant select, delete on public.pager_messages to authenticated;
grant update (listened_at) on public.pager_messages to authenticated;
-- INSERT는 RPC로만(차단 관계 확인·자기 자신 방지)

-- ── 번호 발급: 처음 삐삐를 열면 012-XXXX-XXX를 하나 받는다 ──
create or replace function public.pager_my_box()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); v record; n text; i int := 0;
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  select * into v from pager_boxes where user_id = me;
  if not found then
    loop
      i := i + 1;
      n := '012-' || lpad((floor(random() * 10000))::int::text, 4, '0')
                  || '-' || lpad((floor(random() * 1000))::int::text, 3, '0');
      exit when not exists (select 1 from pager_boxes where number = n) or i > 20;
    end loop;
    insert into pager_boxes(user_id, number) values (me, n)
      on conflict (user_id) do nothing;
    select * into v from pager_boxes where user_id = me;
  end if;
  return jsonb_build_object('ok', true, 'number', v.number,
    'greeting_url', v.greeting_url, 'greeting_dur', v.greeting_dur,
    'unread', (select count(*) from pager_messages where box_owner = me and listened_at is null));
end $$;
grant execute on function public.pager_my_box() to authenticated;

-- ── 남기기: 음성 또는 숫자 ──
create or replace function public.pager_leave(p_to uuid, p_kind text, p_url text default null,
                                              p_dur int default null, p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  if p_to = me then return jsonb_build_object('ok', false, 'reason', 'self'); end if;
  if p_kind not in ('voice','code') then return jsonb_build_object('ok', false, 'reason', 'bad_kind'); end if;
  if p_kind = 'voice' and coalesce(p_url,'') = '' then return jsonb_build_object('ok', false, 'reason', 'no_voice'); end if;
  if p_kind = 'code' and coalesce(p_code,'') !~ '^[0-9]{1,10}$' then return jsonb_build_object('ok', false, 'reason', 'bad_code'); end if;
  -- 차단은 DM과 같은 벽을 쓴다
  if exists (select 1 from dm_blocks where (user_id = p_to and blocked = me) or (user_id = me and blocked = p_to)) then
    return jsonb_build_object('ok', false, 'reason', 'blocked');
  end if;
  -- 도배 방지: 같은 사람에게 1분에 3통까지
  if (select count(*) from pager_messages
       where box_owner = p_to and sender_id = me and created_at > now() - interval '1 minute') >= 3 then
    return jsonb_build_object('ok', false, 'reason', 'too_fast');
  end if;

  insert into pager_messages(box_owner, sender_id, kind, voice_url, dur, code)
    values (p_to, me, p_kind, p_url, p_dur, p_code);

  -- 알림은 채팅과 다른 타입으로 — 프론트가 삐삐 액정 팝업을 띄운다
  begin
    insert into notifications(user_id, from_user, type, message, link)
    values (p_to, me, 'pager',
      case when p_kind = 'code' then '📟 삐삐: ' || p_code else '📟 음성이 도착했어요' end,
      'dm.html?pager=1');
  exception when others then null;
  end;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.pager_leave(uuid, text, text, int, text) to authenticated;

-- 인사말은 본인만 바꾼다(위 grant + 정책으로 이미 강제). 사서함 없으면 만들어 준다.
create or replace function public.pager_set_greeting(p_url text, p_dur int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then return jsonb_build_object('ok', false, 'reason', 'unauthorized'); end if;
  perform pager_my_box();
  update pager_boxes set greeting_url = p_url, greeting_dur = p_dur, updated_at = now()
   where user_id = me;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.pager_set_greeting(text, int) to authenticated;
