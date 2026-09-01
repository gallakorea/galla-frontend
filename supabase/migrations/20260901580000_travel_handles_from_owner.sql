-- 사장님이 직접 확인해 준 채널 핸들 50개 (2026-09-01)
--
-- 💰 핸들은 channels.list?forHandle 로 **1유닛**이다. search.list(100유닛)를 안 쓴다.
-- ⚠️ 핸들이 틀리면 남의 채널이 붙는다. 등록된 핸들은 해석기가 이름 대조를 건너뛰므로
--    (사장님이 직접 확인한 값이라 믿는다) 해석 결과의 실제 채널명을 리포트로 확인한다.
update public.travel_channels set yt_handle = v.handle
  from (values
    ('jojocamping','@jojocamping'), ('kimstravel','@kimstravel'), ('teddytravel','@TeddyTravelog'),
    ('shinaromi','@sinaromi'), ('spark_world','@spax_spax'), ('sena_world','@세나SENA'),
    ('garden_world','@gaaardeeen'), ('gogomong','@GoGoMong'), ('yongjincamp','@YongZinCamp'),
    ('woongjin','@woongjingoway'), ('nakang','@nakang'), ('ajossi','@아조씨'),
    ('bangkokstory','@bangkokstory_'), ('showddary','@showddary'), ('yoobeer','@yoobeer'),
    ('planb_yeonguk','@PlanBYeonguk'), ('songsup','@song_forest'), ('nanajane','@nanajane'),
    ('sindywassong','@shindywassong'), ('birdmoi','@Birdmoi'), ('lerico','@letitgo_travel'),
    ('santatv','@SANTA_TV'), ('daenggu','@daenggu'), ('jayeobi','@JayTravelVid'),
    ('renee','@reneetoyou'), ('mwomga','@adventurer_kr'), ('mangukyuram','@manguktour'),
    ('sabang','@sabang_travel'), ('christam','@chris_ddam'), ('jogaem','@jogaem'),
    ('salranda','@salanda'), ('frogout','@frog_out'), ('bombi','@bombee_travel'),
    ('hwani','@hwani_travel'), ('traveljay','@TravelJ'), ('bcncomma','@comma_bcn'),
    ('doui','@dooi_travel'), ('yoondaein','@yoondaein'), ('taetaego','@taetaego'),
    ('changori','@changori'), ('johnny','@johnny_travel'), ('travelermin','@min_backpacking'),
    ('charlesalle','@charles_alle'), ('hglinetravel','@hangyelline'), ('badaduck','@badaxduck'),
    ('duvallo','@duvalo_world'), ('haesangang','@haesangang'), ('mireu','@mir_travelstory'),
    ('jeongssi','@jeong_gihaeng')
  ) as v(slug, handle)
 where travel_channels.slug = v.slug;

/* 앞서 업로드 목록 404 로 접었던 채널들도 핸들이 생겼으니 다시 켠다 */
update public.travel_channels set active = true
 where yt_handle is not null and yt_channel_id is null and not active;
