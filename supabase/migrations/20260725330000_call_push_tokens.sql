-- 통화 푸시용 기기 토큰 (CallKit/VoIP·FCM) — 잠금화면에서도 벨이 울리게.
-- 웹푸시(push_subscriptions)와 별개: VoIP 푸시는 APNs VoIP 토큰이 따로 필요하다.
create table if not exists call_device_tokens (
  user_id    uuid not null references public.users(id) on delete cascade,
  platform   text not null check (platform in ('ios','android')),
  token      text not null,           -- iOS=VoIP push token, android=FCM token
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);
create index if not exists idx_call_device_tokens_user on call_device_tokens (user_id);

alter table call_device_tokens enable row level security;
-- 본인 것만 읽고 쓴다. call-push 엣지 함수는 service_role로 조회.
drop policy if exists cdt_self on call_device_tokens;
create policy cdt_self on call_device_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 네이티브가 토큰을 받으면 프론트가 호출해 저장.
create or replace function save_call_token(p_platform text, p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_platform not in ('ios','android') or coalesce(p_token,'')='' then return; end if;
  insert into call_device_tokens(user_id, platform, token, updated_at)
    values (auth.uid(), p_platform, p_token, now())
  on conflict (user_id, platform) do update set token = excluded.token, updated_at = now();
end $$;

grant execute on function save_call_token(text, text) to authenticated;

-- 로그아웃/계정삭제 시 정리용(선택)
create or replace function clear_call_token(p_platform text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  delete from call_device_tokens
   where user_id = auth.uid() and (p_platform is null or platform = p_platform);
end $$;

grant execute on function clear_call_token(text) to authenticated;
