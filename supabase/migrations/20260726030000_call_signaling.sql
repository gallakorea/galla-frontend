-- 📞 통화 신뢰 시그널링(카톡급) — best-effort broadcast의 유실/조인지연을 없애기 위한
--    Postgres Changes 기반 신뢰 전송. 로그인 시 상시 구독하고, offer/answer/ice/hangup을
--    이 테이블 INSERT로 배달(유실 없음). 기존 broadcast는 빠른 경로로 병행.
create table if not exists public.call_sig (
  id bigserial primary key,
  to_uid uuid not null,
  from_uid uuid not null,
  t text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists call_sig_to_idx on public.call_sig(to_uid, id);
alter table public.call_sig enable row level security;
drop policy if exists call_sig_ins on public.call_sig;
drop policy if exists call_sig_sel on public.call_sig;
create policy call_sig_ins on public.call_sig for insert to authenticated with check (from_uid = auth.uid());
create policy call_sig_sel on public.call_sig for select to authenticated using (to_uid = auth.uid());
-- realtime 발행(구독자는 RLS로 to_uid=본인 행만 수신)
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='call_sig') then
    execute 'alter publication supabase_realtime add table public.call_sig';
  end if;
end $$;
-- 신호 삽입 + 오래된 행 정리(테이블 항상 작게 유지)
create or replace function public.send_call_sig(p_to uuid, p_t text, p_payload jsonb)
returns void language plpgsql security definer set search_path=public as $$
begin
  insert into public.call_sig(to_uid, from_uid, t, payload) values (p_to, auth.uid(), p_t, p_payload);
  delete from public.call_sig where created_at < now() - interval '3 minutes';
end $$;
grant execute on function public.send_call_sig(uuid,text,jsonb) to authenticated;
