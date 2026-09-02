-- 엉뚱한 채널 하나를 통째로 걷어낸다 (2026-09-02)
--
-- 사장님이 잡아냈다: "트래블튜브 사이트 이거 맞아? 이건 여행이 아닌데?"
-- 우리가 붙인 UCc4OuY3PeWklqBzQ3ySi3xA 는 **국뽕·스포츠 이슈 채널**이었다:
--   "캐나다, 한국에 80조 올인 폭탄소식에 발칵뒤집힌 주변국들"
--   "손흥민 멀티골 폭발 토트넘 선수단 한국에 빠져들며 난리나버린 상황"
-- 영상 1,999편이 통째로 오염이었고, 거기서 뽑힌 '장소' 24곳도 기사 속 지명을
-- 다녀간 곳으로 잘못 읽은 것이다 — 멕시코시티 국제공항·해운대역·차이나타운·인천공항전망대.
--
-- 🔎 원인: collect-travel-videos 의 **search 폴백에 이름 검증이 없다.**
--    핸들 경로에는 sameChannelName() 관문이 있는데, search.list 결과는 items[0] 을
--    그대로 받는다. '트래블튜브'로 검색해 나온 첫 채널을 그냥 붙인 것이다.
--    (같은 커밋에서 그 관문을 search 경로에도 붙인다.)
--
-- ⚠️ 지우기 전에 세었다: 영상 1,999 · 장소 소스 24 · 이 채널만 가진 장소 4곳.
--    나머지 20곳은 다른 크리에이터도 갔으므로 **장소는 남기고 소스만 뗀다.**
-- ⚠️ 마카다TV 도 여행 채널이 아니지만 **남긴다**(사장님 판단). 국내 오지 사찰·명소
--    71곳이 그 채널에만 있고, 장소 데이터 자체는 진짜다.

do $$
declare v_ch text; n_place int; n_src int; n_vid int;
begin
  select slug into v_ch from travel_channels where yt_channel_id = 'UCc4OuY3PeWklqBzQ3ySi3xA';
  if v_ch is null then raise notice '이미 없음'; return; end if;

  /* ① 이 채널만 근거인 장소를 먼저 지운다. 채널을 먼저 지우면 소스가 캐스케이드로
        사라지면서 근거 없는 장소가 유령으로 남는다. */
  with orphan as (
    delete from travel_places p
     where exists (select 1 from travel_place_sources s where s.place_id = p.id and s.channel = v_ch)
       and not exists (select 1 from travel_place_sources s2 where s2.place_id = p.id and s2.channel <> v_ch)
    returning 1)
  select count(*) into n_place from orphan;

  with s as (delete from travel_place_sources where channel = v_ch returning 1)
  select count(*) into n_src from s;

  with v as (delete from travel_videos where channel = v_ch returning 1)
  select count(*) into n_vid from v;

  delete from travel_channels where slug = v_ch;

  raise notice '폐기: 채널 % · 장소 % · 소스 % · 영상 %', v_ch, n_place, n_src, n_vid;
end $$;
