-- ═══════════════════════════════════════════════════════════════
-- ⏳ 사라지는 메시지 — 메타데이터 최소화(텔레그램 비밀채팅 문법)
-- 타이머가 지난 메시지는 서버에서 '물리 삭제'된다(소프트 삭제 아님).
-- 대화가 전부 사라지면 스레드의 시간·미리보기도 지워서
-- '누가 누구와 언제 대화했는지'의 '언제' 흔적까지 소멸시킨다.
-- (스레드 쌍 자체는 남는다 — 그것까지 지우려면 대화방 나가기. 정직한 한계.)
-- ═══════════════════════════════════════════════════════════════

-- '언제' 흔적을 지우려면 시간이 null일 수 있어야 한다
alter table public.dm_threads alter column last_message_at drop not null;

alter table public.dm_threads add column if not exists expire_secs int
  check (expire_secs is null or expire_secs in (3600, 86400, 604800));

-- 타이머는 대화 참여자 누구든 바꿀 수 있다(카톡 오픈채팅·텔레그램과 동일)
grant update (expire_secs) on public.dm_threads to authenticated;
drop policy if exists dm_threads_upd_expire on public.dm_threads;
create policy dm_threads_upd_expire on public.dm_threads for update to authenticated
  using (auth.uid() in (user_lo, user_hi))
  with check (auth.uid() in (user_lo, user_hi));

create or replace function public.dm_expire_sweep()
returns void language plpgsql security definer set search_path = public as $$
begin
  -- 기한 지난 메시지 물리 삭제
  delete from dm_messages m using dm_threads t
   where t.id = m.thread_id
     and t.expire_secs is not null
     and m.created_at < now() - make_interval(secs => t.expire_secs);
  -- 전부 사라진 스레드: 시간·미리보기·발신자 흔적 소거
  update dm_threads t
     set last_message = null, last_message_at = null, last_sender = null
   where t.expire_secs is not null
     and t.last_message_at is not null
     and not exists (select 1 from dm_messages m where m.thread_id = t.id);
end $$;

-- 5분마다 청소 (pg_cron)
do $$ begin
  perform cron.schedule('dm-expire-sweep', '*/5 * * * *', 'select public.dm_expire_sweep()');
exception when others then null; end $$;
