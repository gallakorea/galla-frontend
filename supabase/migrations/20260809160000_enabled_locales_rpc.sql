-- 🌍 지원 언어 목록 조회 RPC (2026-08-09)
--   설정 화면이 app_settings를 직접 읽게 만들었는데, 그 테이블은 RLS로 막혀 있어
--   목록이 영영 안 채워졌다(실측: 브라우저에서 빈 결과).
--   ⚠️ 테이블 권한을 여는 대신 **필요한 것만 주는 RPC**를 만든다 —
--      app_settings엔 요금·마진·모델 설정이 함께 있어 통째로 열면 안 된다.
create or replace function public.enabled_locales()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select jsonb_build_object(
      'default', v ->> 'default',
      'enabled', v -> 'enabled',
      'names', (select jsonb_object_agg(code, coalesce(v -> code ->> 'name', code))
                  from jsonb_array_elements_text(v -> 'enabled') code))
      from app_settings where k = 'locales'),
    jsonb_build_object('default','ko','enabled', jsonb_build_array('ko'),
                       'names', jsonb_build_object('ko','한국어')));
$$;
grant execute on function public.enabled_locales() to anon, authenticated;
