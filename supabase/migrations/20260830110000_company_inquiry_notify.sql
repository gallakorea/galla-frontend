-- 문의가 들어오면 메일로 알린다 (company_inquiries → pg_net → inquiry-alert 엣지 함수)
-- ⚠️ 알림 실패가 접수를 막으면 안 된다. 예외는 전부 삼키고 행은 남긴다.
-- ⚠️ 공유 시크릿은 Vault(INQUIRY_SECRET)에 있고, 같은 값이 엣지 함수 시크릿으로도 등록돼 있다.
--    함수 소스에 직접 박으면 pg_proc 를 읽을 수 있는 누구에게나 노출된다.
create or replace function public.company_inq_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'INQUIRY_SECRET' limit 1;
  perform net.http_post(
    url := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/inquiry-alert',
    headers := jsonb_build_object('Content-Type','application/json','x-inq-secret', coalesce(secret,'')),
    body := jsonb_build_object('kind',new.kind,'name',new.name,'email',new.email,'body',new.body)
  );
  return new;
exception when others then
  return new;
end $$;

drop trigger if exists company_inq_notify_t on public.company_inquiries;
create trigger company_inq_notify_t after insert on public.company_inquiries
  for each row execute function public.company_inq_notify();
