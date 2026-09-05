-- 🔴 채널이 아니라 **재생목록**을 등록 단위로 쓴다.
--
-- 왜 (실측 2026-09-05, 사장님이 주소를 눈으로 확인해 잡아냈다):
--   방송 프로는 방송사 채널에 다른 프로와 섞여 있다. 채널 전체를 긁으면 무관한 영상이 쏟아지고,
--   프로 이름으로 채널을 찾으면 **팬 채널**이 잡힌다. 실제로 10개가 가짜였고
--   그것들이 만든 '누가 다녀갔나' 2,263건이 전부 거짓이었다.
--   재생목록은 그 프로만 정확히 담는다. 그리고 압도적으로 많다:
--     식객 허영만의 백반기행  가짜 채널 31편  →  TV조선 공식 목록 **3,168편**
--     전현무계획              가짜 채널 177편 →  채널S 공식 목록 **894편**
--     동네 한 바퀴            가짜 채널 35편  →  KBS 교양 목록 33편
--
-- 비용은 같다 — playlistItems 는 50편당 1유닛으로 채널 업로드 목록과 동일하다.
alter table food_channels   add column if not exists yt_playlist_id text;
alter table travel_channels add column if not exists yt_playlist_id text;
comment on column food_channels.yt_playlist_id is
  '있으면 이 재생목록만 수집한다(프로 전용). 없으면 채널 업로드 전체를 훑는다.';

-- 사람이 확인한 공식 재생목록. ⚠️ 자동 해소는 껐다 — 여기 넣는 건 사람이 눈으로 본 것만.
update food_channels set yt_playlist_id = 'PLdL7USGieQC3EI1Of8ZR5klR3K2CPshZ-',
       active = true, harvest = true, name = '식객 허영만의 백반기행'
 where slug = 'baekban';
update food_channels set yt_playlist_id = 'PLrDHX3GYl0OVYZ2EUH8FR-WxFdbQYb0b7',
       active = true, harvest = true
 where slug = 'jeonhyeonmu';
update food_channels set yt_playlist_id = 'PLjEfM9iTt3gypt0uB0tuhCv45_NnTHPl6',
       active = true, harvest = true
 where slug = 'dongne';
-- sikgaek 은 baekban 과 같은 프로다(식객 허영만의 백반기행). 중복이라 접는다.
update food_channels set active = false, harvest = false where slug = 'sikgaek';
