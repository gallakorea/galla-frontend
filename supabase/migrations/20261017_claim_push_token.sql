-- 📱 기기 알림 토큰 '이 기기는 지금 이 계정' 으로 묶기(26.10.17)
-- 한 폰에서 계정을 바꿔 쓰면 예전 계정 행에도 같은 토큰이 남아, 남의 계정 알림이 이 폰에 떴다.
-- 내 토큰으로 등록하면서 같은 토큰을 가진 다른 계정 행을 지운다(RLS 로는 남의 행을 못 지워서 definer).
create or replace function public.claim_native_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or coalesce(p_token, '') = '' or p_platform not in ('ios', 'android') then return; end if;
  delete from native_push_tokens where token = p_token and user_id <> auth.uid();
  insert into native_push_tokens (user_id, platform, token, updated_at)
  values (auth.uid(), p_platform, p_token, now())
  on conflict (user_id, platform) do update set token = excluded.token, updated_at = now();
end $$;
revoke all on function public.claim_native_push_token(text, text) from public, anon;
grant execute on function public.claim_native_push_token(text, text) to authenticated;

-- 로그아웃할 때 이 기기 토큰을 내 계정에서 뗀다(로그아웃한 폰에 알림이 계속 오지 않게)
create or replace function public.release_native_push_token(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from native_push_tokens where user_id = auth.uid() and token = p_token;
$$;
revoke all on function public.release_native_push_token(text) from public, anon;
grant execute on function public.release_native_push_token(text) to authenticated;
