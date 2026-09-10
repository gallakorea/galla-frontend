-- 사라지는 메시지가 '켠 뒤 보낸 메시지'만 지우게 한다(2026-09-11 QA 6-2-14).
-- 문제: dm_expire_sweep() 이 타이머 켜진 스레드의 created_at < now() - expire_secs 메시지를 전부 물리 삭제했다.
--       켜기 전 대화도 조건에 걸려, 1시간을 켜면 5분(크론 */5) 안에 양쪽 과거 대화가 영구 삭제된다.
--       롤백 드라이런: QA 스레드에 1시간 → 기존 3건 중 3건 삭제 대상. 실사용 타이머 스레드는 0개(피해 없음).
-- 수정: 메시지마다 보낼 때의 만료 시각(expires_at)을 박고, 청소는 그것만 본다.
--       · 켜기 전 메시지 = expires_at null → 절대 안 지운다
--       · 타이머를 바꾸면 그 뒤 메시지부터 새 값(카톡·시그널과 같은 문법)
-- ⚠️ dm_messages 는 테이블 단위 INSERT 권한이 있어 클라가 expires_at 을 실어 보낼 수 있다 →
--    BEFORE INSERT 트리거가 **항상** 덮어쓴다(보낸 값 무시). UPDATE 는 read_at 컬럼만 열려 있어 사후 조작 불가.

alter table public.dm_messages add column if not exists expires_at timestamptz;

create or replace function public.dm_set_expires_at()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare s integer;
begin
  select t.expire_secs into s from dm_threads t where t.id = new.thread_id;
  new.expires_at := case when s is not null then now() + make_interval(secs => s) else null end;
  return new;
end
$function$;

drop trigger if exists trg_dm_set_expires_at on public.dm_messages;
create trigger trg_dm_set_expires_at
  before insert on public.dm_messages
  for each row execute function public.dm_set_expires_at();

create or replace function public.dm_expire_sweep()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- 기한 지난 메시지 물리 삭제 — 보낼 때 박힌 만료 시각만 본다(켜기 전 메시지는 null 이라 안 걸린다)
  delete from dm_messages m
   where m.expires_at is not null
     and m.expires_at < now();
  -- 전부 사라진 스레드: 시간·미리보기·발신자 흔적 소거
  update dm_threads t
     set last_message = null, last_message_at = null, last_sender = null
   where t.expire_secs is not null
     and t.last_message_at is not null
     and not exists (select 1 from dm_messages m where m.thread_id = t.id);
end
$function$;

create index if not exists dm_messages_expires_at_idx
  on public.dm_messages (expires_at)
  where expires_at is not null;
