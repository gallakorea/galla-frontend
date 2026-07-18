-- ═══════════════════════════════════════════════════════════════
-- 📞 통화 인프라: 서버 전용 KV(TURN 키 보관) + 통화 기록 미리보기
-- ═══════════════════════════════════════════════════════════════

-- 서버(서비스 롤) 전용 KV — RLS on + 정책 없음 = 클라이언트는 어떤 행도 못 본다
create table if not exists public.app_private_kv (
  k text primary key,
  v jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_private_kv enable row level security;
revoke all on public.app_private_kv from anon, authenticated;

-- 통화 기록(kind='call')의 인박스 미리보기
create or replace function public.dm_touch_thread()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_preview text;
begin
  v_preview := case new.kind
    when 'image' then '📷 사진'
    when 'gif'   then '🎬 GIF'
    when 'share' then '🔗 ' || coalesce(new.meta->>'title', '콘텐츠 공유')
    when 'e2e'   then '🔒 비밀 메시지'
    when 'call'  then '📞 ' || case when new.meta->>'video' = 'true' then '페이스톡' else '보이스톡' end
    else new.body end;
  update dm_threads
     set last_message = left(v_preview, 120), last_sender = new.sender_id, last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;
