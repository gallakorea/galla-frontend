-- 지도 제공자 설정 (2026-08-31) — 배포 없이 교체 가능하게 app_settings 로 뺀다.
--   naver_client_id 를 채우면 즉시 네이버 지도로 전환된다(사장님 지시).
--   비어 있으면 Leaflet + OSM 으로 돈다. 네이버 SDK 인증 실패 시에도 자동으로 여기로 내려간다.
--   ⚠️ param: NCP 가 쿼리 파라미터명을 바꾼 이력이 있다(ncpClientId → ncpKeyId).
--      콘솔에서 주는 스니펫과 다르면 이 값만 고치면 된다.
insert into public.app_settings (k, v) values
  ('food_map', jsonb_build_object(
     'provider', 'naver',
     'naver_client_id', '',
     'param', 'ncpKeyId',
     'tile_url', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
     'tile_attr', '&copy; OpenStreetMap',
     '_note', 'naver_client_id 를 채우면 네이버 지도로 전환. 비면 Leaflet 폴백.'))
on conflict (k) do update set v = excluded.v, updated_at = now();
select v from public.app_settings where k='food_map';
-- 지도 설정 공개 RPC (2026-08-31)
--
-- 🚨 app_settings 의 SELECT 정책은 {authenticated} 전용이다(anon 정책 없음).
--    그래서 비로그인 방문자는 설정을 못 읽고 네이버 지도가 영영 안 켜졌다 —
--    로그인 유저만 네이버, 게스트는 조용히 Leaflet 폴백. 눈치채기 어려운 버그다(실측).
-- → 공유 설정 테이블의 RLS 를 건드리면 다른 값(가격·한도 등)까지 새어나갈 위험이 있어
--   지도에 필요한 공개 필드만 내리는 전용 RPC 를 판다.
--   naver_client_id 는 애초에 공개값이다(스크립트 URL 에 박혀 모든 방문자 브라우저로 나간다).
--   보호 수단은 비밀유지가 아니라 NCP 콘솔의 등록 도메인 제한이다.
create or replace function public.food_map_config()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'provider',        v->>'provider',
      'naver_client_id', v->>'naver_client_id',
      'param',           v->>'param',
      'tile_url',        v->>'tile_url',
      'tile_attr',       v->>'tile_attr'))
    from app_settings where k = 'food_map'), '{}'::jsonb);
$fn$;
grant execute on function public.food_map_config() to anon, authenticated;
select food_map_config();
update public.app_settings
   set v = v || jsonb_build_object('naver_style_id', '',
             '_style_note', 'NCP 콘솔 > Maps > Style Editor 에서 다크 스타일을 만들고 그 ID를 여기 넣으면 지도가 다크로 바뀐다. CSS 필터 반전 금지(NAVER 로고까지 반전됨).'),
       updated_at = now()
 where k = 'food_map';
create or replace function public.food_map_config()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'provider',        v->>'provider',
      'naver_client_id', v->>'naver_client_id',
      'naver_style_id',  nullif(v->>'naver_style_id',''),
      'param',           v->>'param',
      'tile_url',        v->>'tile_url',
      'tile_attr',       v->>'tile_attr'))
    from app_settings where k = 'food_map'), '{}'::jsonb);
$fn$;
grant execute on function public.food_map_config() to anon, authenticated;
select food_map_config();
