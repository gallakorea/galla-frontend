-- 계정 삭제가 두 번째부터 항상 실패하던 것 — 탈퇴자 닉네임이 '탈퇴한회원' 고정이라
-- users_nickname_norm_uniq(부분 유니크 인덱스)에 걸려 anonymize_account 가 23505 로 죽었다.
-- (26.9.16 실측: delete-account → {"reason":"anonymize_failed","detail":"duplicate key ... users_nickname_norm_uniq"})
-- 탈퇴자 닉네임에 계정 고유값을 붙여 겹치지 않게 한다. 표시 문구는 그대로 '탈퇴한회원…'.
create or replace function public.anonymize_account(p_uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_nick text := '탈퇴한회원' || substr(replace(p_uid::text, '-', ''), 1, 6);
begin
  if not (coalesce(auth.role(),'') = 'service_role' or auth.uid() = p_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.users set
    nickname   = v_nick,
    bio        = null,
    phone      = null,
    email      = null,
    avatar_url = null,
    region     = null,
    birth_year = null,
    birth_date = null,
    gender     = null,
    deleted_at = now()
  where id = p_uid;

  delete from public.user_profiles where user_id = p_uid;

  update public.withdrawals
     set account_number = case
           when coalesce(account_number,'') = '' then account_number
           else repeat('*', greatest(char_length(account_number) - 4, 0))
                || right(account_number, 4) end,
         holder = '탈퇴한회원'
   where user_id = p_uid
     and status in ('done','completed','rejected');

  update public.client_errors set user_id = null where user_id = p_uid;

  delete from public.push_subscriptions where user_id = p_uid;
  delete from public.call_device_tokens where user_id = p_uid;
  delete from public.user_e2e_keys      where user_id = p_uid;

  delete from public.dm_messages     where sender_id = p_uid;
  delete from public.dm_settings     where user_id = p_uid;
  delete from public.dm_blocks       where user_id = p_uid;
  delete from public.dm_hidden       where user_id = p_uid;
  delete from public.dm_favs         where user_id = p_uid;
  delete from public.dm_thread_prefs where user_id = p_uid;
  delete from public.dm_poll_votes   where user_id = p_uid;
  update public.dm_threads
     set last_message = null, last_message_at = null, last_sender = null
   where last_sender = p_uid;

  delete from public.webauthn_challenges where user_id = p_uid;
  delete from public.presence            where user_id = p_uid;
  delete from public.activity_pings      where user_id = p_uid;
  delete from public.login_logs          where user_id = p_uid;

  delete from public.support_tickets where user_id = p_uid;
  delete from public.tips            where user_id = p_uid;

  update public.content_daily_views set user_id = null where user_id = p_uid;
  delete from public.ai_spend          where user_id = p_uid;
  delete from public.translation_usage where user_id = p_uid;
  -- 금전 기록(gc_*·gp_charges·withdrawals)은 전자상거래법 §6 보존 대상이라 남긴다.
end $$;
