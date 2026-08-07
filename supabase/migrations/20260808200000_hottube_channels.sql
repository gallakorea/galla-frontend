-- 📺 핫튜브 채널 풀 보강 + 카테고리 재편 (2026-08-08)
--  실측: 채널 수가 롱폼 편수를 거의 그대로 결정한다(카테고리 차트는 쇼츠 위주라 롱폼 공급원이 채널 수확).
--    game 15채널→180롱폼 / food 15→115 / tech 15→113  vs  beauty 4→19 / animal 4→19 / music 3(해석) →37
--  → 롱폼 기근 축(뷰티·동물·음악·여행)에 대표 채널을 추가한다. 채널 수확은 playlistItems 1유닛이라 매우 싸다.
--  ⚠️ 이름은 수집기가 search.list(100유닛)로 1회 해석 후 uploads_playlist를 캐시한다(런당 12개씩 분산).
--     '@핸들'은 channels.list?forHandle(1유닛)로 정확·저렴하니 가능하면 핸들로 넣는다.

-- 재편: drama 피드 폐지 → ent로 흡수 / life에서 여행을 travel로 분리
update public.youtube_channels set feed = 'ent'    where feed = 'drama';
update public.youtube_channels set feed = 'travel'
 where feed = 'life'
   and name in ('곽튜브 KwakTube', '원지의 하루 ONZI', '빠니보틀', '여락이들', '@yuuki_japan2', '@FranklyTravels');

insert into public.youtube_channels (name, feed) values
  -- 💄 뷰티·패션 (롱폼 19편 → 보강)
  ('@ssin_ssin', 'beauty'), ('@Directorpi', 'beauty'), ('@KIMCHINGU', 'beauty'),
  ('@yoo_tru', 'beauty'), ('@ninalulu2', 'beauty'), ('@hyoeeeee', 'beauty'),
  -- 🐾 동물 (롱폼 19편 → 보강)
  ('@sooricat', 'animal'), ('@haetnimi', 'animal'), ('@KoreanAnimalRescue', 'animal'),
  ('@dogtorSol', 'animal'), ('@bokjungdongmul', 'animal'),
  -- 🎵 음악 (해석 3채널 → 보강, K-pop 공식 채널은 임베드 차단이 많아 콘텐츠형 위주로)
  ('@stonemusicent', 'music'), ('@MnetKPOP', 'music'), ('@studioc1', 'music'),
  ('@hiphopplaya', 'music'), ('@AwesomeMusicOfficial', 'music'),
  -- ✈️ 여행 (신설 피드 — life에서 분리)
  ('@travelholic_kr', 'travel'), ('@ddulge', 'travel'), ('@worldtravelerkim', 'travel'),
  -- 🎬 예능·드라마(구 drama 흡수분 보강)
  ('@tvNdrama', 'ent'), ('@jtbcdrama', 'ent')
on conflict (name) do update set feed = excluded.feed;

-- 추가(2차): 여행 분리로 얇아진 '일상·취미' 보강 + 여행 확충
insert into public.youtube_channels (name, feed) values
  ('@haeyum_', 'life'), ('@sueddu', 'life'), ('@dailyseoul', 'life'), ('@jangsanhee', 'life'),
  ('@travelwithhoon', 'travel'), ('@yeosu_trip', 'travel')
on conflict (name) do update set feed = excluded.feed;
-- 3차: 추측 핸들 실패분 제거 후, 검색으로 확실히 찾히는 '실제 채널명'으로 재시드.
-- (search.list=100유닛이라 런당 12개씩 분산 해석된다 — 며칠에 걸쳐 자동으로 채워짐)
insert into public.youtube_channels (name, feed) values
  -- 🐾 동물
  ('TV동물농장 x 애니멀봐', 'animal'), ('루퐁이네', 'animal'), ('김하하', 'animal'),
  ('꼬부기아빠 TV', 'animal'), ('갱스터 고양이', 'animal'),
  -- 💄 뷰티·패션
  ('민스코 Minsco', 'beauty'), ('김습습', 'beauty'), ('하늘하늘 skyskysky', 'beauty'),
  ('예니 YENI', 'beauty'),
  -- 🎵 음악
  ('1theK (원더케이)', 'music'), ('KBS Kpop', 'music'), ('M2', 'music'), ('THEBLACKLABEL', 'music'),
  -- ✈️ 여행
  ('여행에미치다', 'travel'), ('트래블튜브', 'travel'), ('희철리즘 Heechulism', 'travel'),
  -- 🏠 일상·취미
  ('일주어터', 'life'), ('때잉', 'life'), ('아옳이', 'life')
on conflict (name) do update set feed = excluded.feed;
