-- 🌍 국제화 기반 (2026-08-09)
--
--  왜 지금인가: 오픈 전이라 데이터가 적을 때가 제일 싸다. 콘텐츠가 수백만 건 쌓인 뒤에
--  locale을 소급하면 마이그레이션·백필·인덱스 재구축이 전부 운영 중 작업이 된다.
--  지금은 유튜브 1,822 · 광장 519 · 뉴스 169 · 이슈 51건뿐이다.
--
--  ⚠️ 이 마이그레이션은 '번역'이 아니라 '넣을 자리'를 만드는 것이다.
--     화면 문구 5.8만 개 번역은 별개 작업이고, 지금 할 일이 아니다.
--
--  설계 원칙
--   · 기본값은 전부 'ko' — 기존 동작이 한 글자도 바뀌지 않는다(무중단).
--   · locale은 BCP-47 소문자 2자리(ko/en/ja/zh) + 필요시 지역(en-us). 짧게 쓰고 확장 여지를 둔다.
--   · 나라별로 다른 '값'(상담번호·통화·시간대)은 코드가 아니라 app_settings에 둔다 — 배포 없이 바꾼다.

-- ── 1. 유저의 언어 ────────────────────────────────────────────
--    users.region은 이미 있지만 '지역(시·도)' 용도라 언어와 다르다. 별도로 둔다.
alter table public.users add column if not exists locale text not null default 'ko';
create index if not exists idx_users_locale on public.users(locale);

-- ── 2. 콘텐츠의 언어 ──────────────────────────────────────────
--    피드·검색·추천이 전부 이 컬럼으로 갈린다. 없으면 해외 유저에게 한국 콘텐츠가 그대로 나간다.
do $$
declare t text;
begin
  foreach t in array array['issues','posts','plaza_posts','comments','news_articles',
                           'youtube_hot','predict_markets','rooms']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I add column if not exists locale text not null default ''ko''', t);
      execute format('create index if not exists %I on public.%I(locale)', 'idx_' || t || '_locale', t);
    end if;
  end loop;
end $$;

-- ── 3. 나라별 설정 — 코드에 박지 말 것 ────────────────────────
--    ⚠️ 위기 상담번호는 나라마다 다르다. 한국 번호를 해외 유저에게 주면 아무 도움이 안 된다.
--       (이번에 galla-friend에 109·1388·117을 하드코딩했는데, 그게 바로 소급 비용이 되는 종류다)
insert into public.app_settings (k, v) values ('locales', jsonb_build_object(
  'default', 'ko',
  'enabled', jsonb_build_array('ko'),          -- 여는 순간 여기에 추가한다
  'ko', jsonb_build_object(
    'name', '한국어', 'tz', 'Asia/Seoul', 'currency', 'KRW', 'currency_symbol', '₩',
    'crisis', jsonb_build_array(
      jsonb_build_object('label','자살예방 상담전화','tel','109','sub','24시간 · 익명 · 무료'),
      jsonb_build_object('label','정신건강 위기상담','tel','1577-0199','sub','24시간 상담')),
    'crisis_minor', jsonb_build_array(
      jsonb_build_object('label','청소년 전화','tel','1388','sub','24시간 · 익명 · 무료 · 문자도 가능'),
      jsonb_build_object('label','자살예방 상담전화','tel','109','sub','24시간 · 익명 · 무료'),
      jsonb_build_object('label','학교폭력 신고','tel','117','sub','24시간 신고·상담'))
  ),
  'en', jsonb_build_object(
    'name', 'English', 'tz', 'America/New_York', 'currency', 'USD', 'currency_symbol', '$',
    'crisis', jsonb_build_array(
      jsonb_build_object('label','988 Suicide & Crisis Lifeline','tel','988','sub','24/7 · free · confidential'),
      jsonb_build_object('label','Crisis Text Line','tel','741741','sub','Text HOME · 24/7')),
    'crisis_minor', jsonb_build_array(
      jsonb_build_object('label','988 Suicide & Crisis Lifeline','tel','988','sub','24/7 · free · confidential'),
      jsonb_build_object('label','Childhelp Hotline','tel','1-800-422-4453','sub','24/7 for kids & teens'))
  ),
  'ja', jsonb_build_object(
    'name', '日本語', 'tz', 'Asia/Tokyo', 'currency', 'JPY', 'currency_symbol', '¥',
    'crisis', jsonb_build_array(
      jsonb_build_object('label','いのちの電話','tel','0570-783-556','sub','24時間 · 匿名'),
      jsonb_build_object('label','こころの健康相談','tel','0570-064-556','sub','相談窓口')),
    'crisis_minor', jsonb_build_array(
      jsonb_build_object('label','チャイルドライン','tel','0120-99-7777','sub','18歳まで · 無料'),
      jsonb_build_object('label','いのちの電話','tel','0570-783-556','sub','24時間 · 匿名'))
  )
)) on conflict (k) do nothing;

-- ── 4. 조회 헬퍼 ──────────────────────────────────────────────
--    엣지 함수·클라이언트가 같은 정의를 쓰게 한다(각자 하드코딩하면 또 갈린다).
create or replace function public.locale_config(p_locale text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select v -> coalesce(nullif(p_locale, ''), v ->> 'default') from app_settings where k = 'locales'),
    (select v -> (v ->> 'default') from app_settings where k = 'locales'),
    '{}'::jsonb);
$$;
grant execute on function public.locale_config(text) to anon, authenticated;

--    유저의 locale — 없으면 기본값. 엣지 함수가 매번 users를 조회하지 않게.
create or replace function public.user_locale(p_uid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select coalesce((select nullif(u.locale, '') from users u where u.id = p_uid),
                  (select v ->> 'default' from app_settings where k = 'locales'), 'ko');
$$;
grant execute on function public.user_locale(uuid) to anon, authenticated;
