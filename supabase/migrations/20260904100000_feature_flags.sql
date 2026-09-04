-- 🚦 범용 피처 플래그 (2026-09-04) — 순차 오픈용 스위치를 한 곳으로 모은다.
--
-- 왜 필요한가:
--   런칭은 "다 켜고 시작"이 아니라 "되는 것만 보여주고 하나씩 연다"이다.
--   그런데 지금까지 스위치가 제각각이었다 — 숏판·롱판은 app_settings.gallari_enabled,
--   창작 에이전트는 agent-hub.js 의 자바스크립트 상수 ENABLED, 통화는 아무 스위치도 없었다.
--   상수는 켜려면 배포가 필요하고, 배포는 PWA 캐시 전파까지 걸린다([[galla-version-propagation]]).
--   기능을 하나 열 때마다 배포를 타면 "지금 켜자"를 못 한다. → 서버 한 행으로 통일한다.
--
-- 🚨 app_settings 의 SELECT 정책은 {authenticated} 전용이다(anon 정책 없음).
--    비로그인 방문자도 화면을 보므로 테이블을 직접 읽게 하면 게스트에게만 기능이 안 보인다 —
--    food_map 에서 실제로 겪은 함정이다(로그인 유저만 네이버 지도, 게스트는 조용히 폴백).
--    RLS 를 풀면 가격·한도 같은 다른 키까지 새어나가므로, 플래그만 내리는 전용 RPC 를 판다.
--    플래그 값은 애초에 공개 정보다 — 화면에 기능이 보이는지 여부가 곧 그 값이다.

insert into public.app_settings (k, v) values
  ('features', jsonb_build_object(
     'calls',   false,   -- 육성톡·면상톡(1:1 P2P). 콜드스타트 한방향·링백 미해결이라 1차에선 닫는다
     'live',    false,   -- 라이브 난장(Cloudflare Calls SFU). 실기기 음성 검증 미완
     'agent',   false,   -- 갈비스 창작 에이전트. 2차 범위(종량과금 미부착)
     'gallari', false,   -- 숏판·롱판. 아래에서 기존 gallari_enabled 값으로 덮어쓴다
     '_note',   'true 로 바꾸면 배포 없이 즉시 열린다. 클라는 fail-closed — 못 읽으면 전부 꺼진 것으로 본다.'))
on conflict (k) do update set v = public.app_settings.v || excluded.v, updated_at = now();

-- 기존 gallari_enabled 를 features.gallari 로 승계한다.
-- (낱개 키는 지우지 않는다 — create.js·mypage.js 가 아직 그걸 읽고 있고,
--  둘을 한 번에 바꾸면 어느 쪽이 원인인지 못 가린다. 클라 전환 후 별도 마이그레이션에서 정리한다.)
update public.app_settings
   set v = v || jsonb_build_object(
         'gallari',
         coalesce((select (v = 'true'::jsonb or v = to_jsonb(true))
                     from public.app_settings where k = 'gallari_enabled'), false)),
       updated_at = now()
 where k = 'features';

-- 공개 플래그 RPC — 화이트리스트한 키만 내린다.
-- ⚠️ v 를 통째로 내리면 나중에 여기 추가한 내부 메모까지 같이 나간다. 키를 명시한다.
create or replace function public.app_features()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce((
    select jsonb_build_object(
      'calls',   coalesce((v->>'calls')::boolean,   false),
      'live',    coalesce((v->>'live')::boolean,    false),
      'agent',   coalesce((v->>'agent')::boolean,   false),
      'gallari', coalesce((v->>'gallari')::boolean, false))
    from app_settings where k = 'features'), '{}'::jsonb);
$fn$;

revoke all on function public.app_features() from public;
grant execute on function public.app_features() to anon, authenticated;

select public.app_features();
