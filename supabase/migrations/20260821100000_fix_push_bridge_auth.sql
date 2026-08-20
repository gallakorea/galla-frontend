/* ══ 알림 → 푸시 브릿지가 통째로 죽어 있었다 ═══════════════════
   trg_notify_push 가 Authorization 에 vault push_svc_key(47자, 비-JWT)를 실었다.
   Supabase 게이트웨이는 Authorization 을 JWT로 파싱하므로
   401 UNAUTHORIZED_INVALID_JWT_FORMAT 으로 함수 실행 전에 끊긴다.
   반대로 유효 JWT를 실으면 send-push 자체 검사(auth.includes(BRIDGE_SECRET))에서 403.
   → 두 조건이 배타적이라 어떤 알림도 푸시가 안 나갔다(DM 포함).

   해결: Authorization = 유효 JWT(svc_role_key), 브릿지 시크릿 = 전용 헤더 x-push-key.
   send-push 는 두 방식 모두 허용하도록 같이 배포했다(하위호환). */

create or replace function public.trg_notify_push()
returns trigger language plpgsql security definer
set search_path to 'public', 'vault', 'net' as $fn$
declare k text; jwt text;
begin
  select decrypted_secret into k   from vault.decrypted_secrets where name = 'push_svc_key' limit 1;
  select decrypted_secret into jwt from vault.decrypted_secrets where name = 'svc_role_key' limit 1;
  if k is null or jwt is null then return NEW; end if;
  perform net.http_post(
    url     := 'https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || jwt,   -- 플랫폼 통과용(유효 JWT여야 한다)
                 'x-push-key', k),                    -- 함수 자체 인증용(비-JWT여도 된다)
    body    := jsonb_build_object('kind', 'notify', 'id', NEW.id),
    timeout_milliseconds := 8000);
  return NEW;
exception when others then return NEW;
end $fn$;

do $chk$
begin
  if (select count(*) from vault.decrypted_secrets where name in ('push_svc_key','svc_role_key')) <> 2 then
    raise exception 'vault 키가 둘 다 있어야 한다';
  end if;
  if not exists (select 1 from pg_proc p
                  where p.proname = 'trg_notify_push'
                    and pg_get_functiondef(p.oid) like '%x-push-key%') then
    raise exception '트리거 보강 실패';
  end if;
  raise notice '푸시 브릿지 인증 분리 완료';
end $chk$;
