-- 다이닝코드 출처 전부 삭제 (2026-09-12 사장님: "전혀 상관 없는 채널임 다 지워 버려")
--
-- 다이닝코드(diningcode.com)는 블로그 후기 기반 맛집 검색 서비스인데, 우리 DB 의 '다이닝코드' 출처는
-- 그 서비스의 데이터가 아니었다. 08-31 발견 함수(discover-food-places)가 네이버 블로그·뉴스·웹문서를
-- '다이닝코드 ○○ 맛집'으로 검색해 AI 가 뽑은 상호를 이 출처로 적었을 뿐이다(136행, 영상 근거 0).
-- 한때 붙어 있던 유튜브 채널(UCaZ3mHt1z5ZAcgoKYhl_F5w, 영상 0편)도 무관 — 09-04 에 이미 비웠다.
--
-- 지우는 것(삭제 전 실측, 가드로 정확히 이 수일 때만 커밋):
--   · food_channels 'diningcode' 1행  (food_place_sources·food_videos·food_playlists 는 CASCADE)
--   · food_place_sources channel='diningcode' 136행
--   · 다이닝코드 출처로만 생긴 가게 74곳 — 사용자 활동(투표·방문·저장·사용자 사진·댓글) 0건.
--     다른 진짜 출처가 붙은 62곳은 남긴다(출처만 빠진다).
-- food_quiz_answers 는 channel FK 에 CASCADE 가 없어 채널을 지우기 전에 먼저 지운다.

do $$
declare n_src int; n_only int; n_ch int; n_act int; n_quiz int; n_del_places int; n_del_ch int;
begin
  create temp table _dc_only on commit drop as
    select d.place_id from (select distinct place_id from food_place_sources where channel = 'diningcode') d
     where not exists (select 1 from food_place_sources o where o.place_id = d.place_id and o.channel <> 'diningcode');

  select count(*) into n_src  from food_place_sources where channel = 'diningcode';
  select count(*) into n_only from _dc_only;
  select count(*) into n_ch   from food_channels where slug = 'diningcode';
  select (select count(*) from food_votes    where place_id in (select place_id from _dc_only))
       + (select count(*) from food_visits   where place_id in (select place_id from _dc_only))
       + (select count(*) from food_saves    where place_id in (select place_id from _dc_only))
       + (select count(*) from food_comments where place_id in (select place_id from _dc_only))
       + (select count(*) from food_photos   where place_id in (select place_id from _dc_only) and source = 'user')
    into n_act;
  if n_src <> 136 or n_only <> 74 or n_ch <> 1 or n_act <> 0 then
    raise exception 'guard: src=% only=% ch=% user_activity=%', n_src, n_only, n_ch, n_act;
  end if;

  delete from food_quiz_answers where channel = 'diningcode' or place_id in (select place_id from _dc_only);
  get diagnostics n_quiz = row_count;

  delete from food_places where id in (select place_id from _dc_only);        -- 출처·통계 등은 CASCADE
  get diagnostics n_del_places = row_count;
  delete from food_channels where slug = 'diningcode';                           -- 남은 출처 62행 CASCADE
  get diagnostics n_del_ch = row_count;

  if n_del_places <> 74 or n_del_ch <> 1 then
    raise exception 'delete mismatch: places=% channel=%', n_del_places, n_del_ch;
  end if;
  if exists (select 1 from food_place_sources where channel = 'diningcode') then
    raise exception 'sources left';
  end if;
  raise notice 'diningcode purge: places %, channel %, quiz answers %', n_del_places, n_del_ch, n_quiz;
end $$;
