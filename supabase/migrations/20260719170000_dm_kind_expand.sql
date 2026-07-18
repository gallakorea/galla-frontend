-- 🚨 dm_messages.kind CHECK가 text/image/gif/share만 허용하고 있었다.
-- 그 뒤로 추가한 종류(e2e 비밀메시지·call 통화기록·voice 음성메시지)는
-- INSERT가 조용히 거부돼 "녹음은 되는데 안 간다"로 나타났다.
-- 새 kind를 추가할 때 이 제약을 같이 늘리는 걸 잊지 말 것.
alter table public.dm_messages drop constraint if exists dm_messages_kind_check;
alter table public.dm_messages add constraint dm_messages_kind_check
  check (kind = any (array['text','image','gif','share','voice','e2e','call','video','file']));

-- 난장·단체 채팅도 같은 함정이 있는지 확인 후 맞춰둔다
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid='public.open_messages'::regclass and conname='open_messages_kind_check') then
    alter table public.open_messages drop constraint open_messages_kind_check;
  end if;
  alter table public.open_messages add constraint open_messages_kind_check
    check (kind = any (array['text','image','gif','share','voice','video','file']));
exception when others then null;
end $$;
