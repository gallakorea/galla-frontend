-- 🌍 해외 뉴스·트렌드 수집 소스 (2026-08-09)
--
--  수집기에 한국이 코드로 박혀 있었다(collect-rss-news의 FEEDS 배열, collect-youtube-hot의 REGION="KR").
--  ⚠️ 소스를 코드에 두면 언어를 열 때마다 배포가 필요하다 → 설정으로 뺀다.
--     수집기는 locales.enabled에 있는 언어만 돈다. 지금은 ko뿐이라 **동작이 하나도 안 바뀐다.**
--
--  ⚠️ 뉴스·유튜브의 locale은 '소스의 언어'다. 유저 언어가 아니다
--     (영어권 유저가 담았다고 한국 기사를 en으로 찍으면 안 된다).

insert into public.app_settings (k, v) values ('collect_sources', jsonb_build_object(
  'ko', jsonb_build_object(
    'youtube_region', 'KR',
    'rss', jsonb_build_array()          -- 빈 배열 = 코드의 기존 FEEDS를 그대로 쓴다(회귀 방지)
  ),
  'en', jsonb_build_object(
    'youtube_region', 'US',
    'rss', jsonb_build_array(
      jsonb_build_array('BBC', 'https://feeds.bbci.co.uk/news/rss.xml'),
      jsonb_build_array('BBC', 'https://feeds.bbci.co.uk/news/world/rss.xml'),
      jsonb_build_array('BBC', 'https://feeds.bbci.co.uk/news/business/rss.xml'),
      jsonb_build_array('BBC', 'https://feeds.bbci.co.uk/news/technology/rss.xml'),
      jsonb_build_array('NPR', 'https://feeds.npr.org/1001/rss.xml'),
      jsonb_build_array('Guardian', 'https://www.theguardian.com/world/rss'),
      jsonb_build_array('Guardian', 'https://www.theguardian.com/us-news/rss'),
      jsonb_build_array('Sky News', 'https://feeds.skynews.com/feeds/rss/world.xml'),
      jsonb_build_array('CBS', 'https://www.cbsnews.com/latest/rss/main')
    )
  ),
  'ja', jsonb_build_object(
    'youtube_region', 'JP',
    'rss', jsonb_build_array(
      jsonb_build_array('NHK', 'https://www.nhk.or.jp/rss/news/cat0.xml'),
      jsonb_build_array('NHK', 'https://www.nhk.or.jp/rss/news/cat1.xml'),
      jsonb_build_array('NHK', 'https://www.nhk.or.jp/rss/news/cat5.xml'),
      jsonb_build_array('ITmedia', 'https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml'),
      jsonb_build_array('東洋経済', 'https://toyokeizai.net/list/feed/rss'),
      jsonb_build_array('ライブドア', 'http://news.livedoor.com/topics/rss/int.xml')
    )
  ),
  'zh-TW', jsonb_build_object(
    'youtube_region', 'TW',
    'rss', jsonb_build_array(
      jsonb_build_array('中央社', 'https://feeds.feedburner.com/rsscna/intworld'),
      jsonb_build_array('中央社', 'https://feeds.feedburner.com/rsscna/politics'),
      jsonb_build_array('中央社', 'https://feeds.feedburner.com/rsscna/finance'),
      jsonb_build_array('自由時報', 'https://news.ltn.com.tw/rss/all.xml'),
      jsonb_build_array('公視', 'https://news.pts.org.tw/xml/newsfeed.xml'),
      jsonb_build_array('關鍵評論網', 'https://feeds.feedburner.com/TheNewsLens')
    )
  )
)) on conflict (k) do update set v = excluded.v;

-- 🔎 수집기가 읽는 헬퍼 — '열린 언어'만 돌려준다. 코드가 목록을 직접 알 필요가 없다.
create or replace function public.collect_targets()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'locale', code,
           'youtube_region', coalesce(src -> code ->> 'youtube_region', 'KR'),
           'rss', coalesce(src -> code -> 'rss', '[]'::jsonb))), '[]'::jsonb)
    from (select (select v from app_settings where k = 'collect_sources') src,
                 (select v -> 'enabled' from app_settings where k = 'locales') en) t,
         jsonb_array_elements_text(t.en) code;
$$;
