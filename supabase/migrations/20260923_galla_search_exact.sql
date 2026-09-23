-- 🔎 검색 정확도(26.9.23) — ivfflat 근사 인덱스 제거, 정확(exact) KNN 사용.
-- 이유: 콘텐츠 규모(수천~수만)에서 ivfflat(lists=100·probes=1)은 엉뚱한 이웃을 반환해
--       "부동산 뉴스"·"북한 뉴스"가 똑같은 정치 뉴스로 나왔다. 이 규모엔 정확 스캔이 빠르고 정확하다.
drop index if exists issues_vec_idx;
drop index if exists plaza_vec_idx;
drop index if exists food_vec_idx;
drop index if exists travel_vec_idx;
drop index if exists news_vec_idx;
