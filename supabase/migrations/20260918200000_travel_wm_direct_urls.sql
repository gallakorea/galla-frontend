-- 여행 사진 Special:FilePath(리다이렉트 2번) → 직접 썸네일 주소(26.9.18, 스크립트로 적용 완료).
-- 대응표 public._wm_url_map(old→new, 8,448쌍)이 백업이다. 되돌리기:
--   update travel_places t set photo=m.old from _wm_url_map m where m.new=t.photo;
--   update travel_area_photos t set photo=m.old from _wm_url_map m where m.new=t.photo;
create table if not exists public._wm_url_map (old text primary key, new text not null);
alter table public._wm_url_map enable row level security;
update travel_places t set photo = m.new from _wm_url_map m where m.old = t.photo;
update travel_area_photos t set photo = m.new from _wm_url_map m where m.old = t.photo;
