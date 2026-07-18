-- ═══════════════════════════════════════════════════════════════
-- DM 고도화 1차 — "메시지의 기본과 보안"
-- 방향: 카카오톡 대체재. 1차는 텔레그램 '기본 채팅' 수준의 보안(전송 TLS + 서버 저장 +
--   빈틈없는 접근통제)과 메신저 기본기(보내기취소·답장·이미지·공유카드)를 만든다.
--   진짜 E2E(비밀대화)는 2차 — WebCrypto ECDH. 키 관리가 별개 프로젝트 규모라 분리.
--
-- 🔒 [치명] 수신자가 상대 메시지를 조작할 수 있던 구멍 수정
--   기존: authenticated에 전 컬럼 UPDATE 권한 + 수신자 정책이 with check(true)
--   → 수신자가 상대가 보낸 메시지의 body·sender_id·thread_id를 마음대로 바꿀 수 있었다
--     (읽음 처리용으로 열어둔 문이 본문 조작까지 허용). 실증 후 수정.
--   해법: 컬럼 단위 권한 — UPDATE는 read_at 한 컬럼만. 보내기취소는 RPC로만.
-- ═══════════════════════════════════════════════════════════════

-- ── 🔒 구멍 봉쇄: UPDATE를 read_at 한 컬럼으로 제한 ───────────────
revoke update on public.dm_messages from authenticated, anon;
grant  update (read_at) on public.dm_messages to authenticated;

-- 수신자 정책도 명시적으로 다시 못박는다 (컬럼 grant가 1차 방어, 정책이 2차)
drop policy if exists dm_messages_read on public.dm_messages;
create policy dm_messages_read on public.dm_messages
  for update using (
    sender_id <> auth.uid() and exists (
      select 1 from dm_threads t where t.id = thread_id and auth.uid() in (t.user_lo, t.user_hi)))
  with check (sender_id <> auth.uid());   -- true였다 — 뭘 넣어도 통과하는 문

-- ── 메시지 종류·답장·삭제 ──────────────────────────────────────
alter table public.dm_messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text','image','gif','share')),
  add column if not exists meta jsonb,                 -- image: {url} / share: {type,id,title,thumb}
  add column if not exists reply_to uuid references public.dm_messages(id) on delete set null,
  add column if not exists deleted_at timestamptz;

-- INSERT에 새 컬럼 허용(기존 grant는 컬럼 목록 고정이라 갱신 필요)
grant insert (thread_id, sender_id, body, kind, meta, reply_to) on public.dm_messages to authenticated;
grant select on public.dm_messages to authenticated;

-- 답장 대상은 같은 스레드의 메시지여야 한다(다른 방 메시지 인용으로 내용 유출 방지)
create or replace function public._dm_check_reply()
returns trigger language plpgsql as $$
begin
  if new.reply_to is not null and not exists (
    select 1 from dm_messages m where m.id = new.reply_to and m.thread_id = new.thread_id
  ) then
    raise exception 'reply_cross_thread';
  end if;
  return new;
end $$;
drop trigger if exists trg_dm_check_reply on public.dm_messages;
create trigger trg_dm_check_reply before insert on public.dm_messages
  for each row execute function public._dm_check_reply();

-- ── 보내기 취소 (카카오톡과 같은 5분 창) ─────────────────────────
-- 직접 UPDATE로 열면 컬럼 권한을 다시 넓혀야 해 구멍이 재발한다 → RPC로만.
create or replace function public.dm_unsend(p_msg uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); m dm_messages%rowtype;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into m from dm_messages where id = p_msg for update;
  if m.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if m.sender_id <> v_user then return jsonb_build_object('ok',false,'reason','not_sender'); end if;
  if m.deleted_at is not null then return jsonb_build_object('ok',true,'already',true); end if;
  if now() - m.created_at > interval '5 minutes' then
    return jsonb_build_object('ok',false,'reason','too_late');
  end if;
  -- 본문·메타를 지운다 — '삭제 표시'만 하고 내용이 남으면 삭제가 아니다
  update dm_messages set deleted_at = now(), body = '', meta = null where id = p_msg;
  -- 마지막 메시지였다면 목록 미리보기도 갱신
  update dm_threads set last_message = '삭제된 메시지입니다'
   where id = m.thread_id
     and not exists (select 1 from dm_messages x
                      where x.thread_id = m.thread_id and x.deleted_at is null
                        and x.created_at > m.created_at);
  return jsonb_build_object('ok',true);
end $$;
grant execute on function public.dm_unsend(uuid) to authenticated;

-- ── 스레드 미리보기: 종류별 문구 ────────────────────────────────
create or replace function public.dm_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_preview text;
begin
  v_preview := case new.kind
    when 'image' then '📷 사진'
    when 'gif'   then '🎬 GIF'
    when 'share' then '🔗 ' || coalesce(new.meta->>'title', '콘텐츠 공유')
    else new.body end;
  update dm_threads
     set last_message = left(v_preview, 120), last_sender = new.sender_id, last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;
