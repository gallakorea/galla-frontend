-- 🗑 계정 삭제 시 잔존 개인정보 파기 보강 (2026-08-08 QA8)
--  실측: users PII·프로필·갈비스 기억·위기기록·잔액은 파기되지만
--   ▸ withdrawals의 **계좌번호·예금주가 평문 잔존**(users FK가 NO ACTION이라 툼스톤과 함께 남음)
--   ▸ client_errors.user_id(식별자) 잔존
--   ▸ 기기 토큰/웹푸시 구독/E2E 키는 auth.users CASCADE로 지워지나, 툼스톤 경로에선 방어적으로 한 번 더 정리
--  정책: 정산 완료·거절 건은 계좌번호를 뒤 4자리만 남기고 마스킹(전자상거래법상 거래기록은 보존, 식별성만 제거).
--        미지급(pending/processing)은 지급 의무가 있어 그대로 둔다 — 관제에서 처리 후 다음 파기 대상.
create or replace function public.anonymize_account(p_uid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $function$
begin
  if not (coalesce(auth.role(),'') = 'service_role' or auth.uid() = p_uid) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.users set
    nickname   = '탈퇴한회원',
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

  -- 💳 금융 식별정보 마스킹 — 지급 끝난 건만(미지급은 지급 후 파기 대상)
  update public.withdrawals
     set account_number = case
           when coalesce(account_number,'') = '' then account_number
           else repeat('*', greatest(char_length(account_number) - 4, 0))
                || right(account_number, 4) end,
         holder = '탈퇴한회원'
   where user_id = p_uid
     and status in ('done','completed','rejected');

  -- 🧹 식별자만 남은 로그 — 익명화(통계는 유지)
  update public.client_errors set user_id = null where user_id = p_uid;

  -- 📱 기기·키 — CASCADE 경로가 있어도 방어적으로 정리(푸시 오발송·키 잔존 방지)
  delete from public.push_subscriptions where user_id = p_uid;
  delete from public.call_device_tokens where user_id = p_uid;
  delete from public.user_e2e_keys where user_id = p_uid;
end $function$;
