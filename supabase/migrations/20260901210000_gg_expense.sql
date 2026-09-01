-- 경기도 업무추진비 → '경기도 공무원이 다녀간 집'.
--
-- ⚠️ 서울시와 데이터 모양이 다르다. 서울 EXEC_LOC 은 '상호(도로명주소)' 였는데
--    경기 USE_LOC 은 **상호만** 있다(실측 40건 중 주소 포함 0건).
--    주소가 없으면 동명 상호를 못 가른다 — '본당' '온담' 같은 두 글자는 전국에 널렸다.
--    → 지역 힌트를 '경기'로 주고, 네이버가 돌려준 주소에 '경기'가 없으면 버린다.
--    → 상호가 짧으면 아예 안 묻는다(정규화 4자 미만 제외). 못 붙이는 게 엉뚱한 집을
--      붙이는 것보다 낫다 — '누가 갔나'가 거짓말이 되면 이 서비스는 끝이다.
--
-- 다행히 지점명이 위치를 담는 경우가 많다('선비칼국수 광교중앙역점', '개수리 막국수 경기도청점').
-- 도청이 수원 광교라 결제가 그 주변에 몰려 있어, 지역 힌트만으로도 정확도가 버틴다.

insert into food_channels (slug, name, kind, active) values
  ('gg_gov', '경기도 공무원', 'gov', true)
on conflict (slug) do update set name = excluded.name, active = true;

insert into gov_ingest_cursor (source, next_offset) values ('gg_TBGGHPEXECDESCM', 1)
on conflict (source) do nothing;
