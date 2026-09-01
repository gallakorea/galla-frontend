/* 파이프라인 정비용 RPC 12개를 익명·로그인 유저에게서 걷는다.

   표와 같은 뿌리다 — pg_default_acl 이 **새 함수의 EXECUTE 를 anon·authenticated 에게 기본 부여**한다.
   그래서 맛집 수집기·정부지출 수집기의 정비 함수가 인터넷 아무나 호출할 수 있는 채로 서 있었다.
   SECURITY DEFINER 라 호출되면 소유자 권한으로 돈다(가드는 하나도 없다).

   실제로 가능했던 것:
     · places_take(p_want, p_cap) — 구글 Places 하루 한도(1,200)를 한 번에 태워버릴 수 있다
       → 사진 수집이 그날 통째로 멈춘다. (8/31 '한도 소진이 멀쩡한 식당 9,086곳을 영구 제외'
          사고와 같은 장부다 — 그때는 우리 버그였지만 밖에서도 건드릴 수 있었다.)
     · food_merge_place(keep, drop) — 식당 레코드를 합치며 출처 행을 지운다 = 원격 데이터 파괴.
     · food_videos_mark_harvested(ids) — 영상을 '수확 완료'로 찍어 영원히 건너뛰게 만든다.
     · naver_take/naver_refund · places_refund · food_* 나머지 — 같은 계열의 장부·병합 조작.
     · reap_stalled_agent_jobs(90) — 크론 정비 함수. 밖에서 부를 이유가 없다.

   호출자 확인(전수): 프론트 js/ 에서 부르는 곳 0곳. 전부 엣지 함수(service_role) 아니면 크론이다.
     ingest-assembly · link-food-videos · ingest-places-photos · harvest-creator-places ·
     ingest-gov-expense · cron(reap_stalled_agent_jobs)
   service_role 과 크론(postgres)은 이 revoke 의 영향을 받지 않는다.

   trg_recount_* 는 트리거 함수라 EXECUTE 권한과 무관하게 트리거로 돈다 — 직접 호출만 막는다.

   ⚠️ **`from anon, authenticated` 로는 안 걷힌다.** 함수 ACL 이 `=X/postgres`,
   즉 **PUBLIC 에 EXECUTE** 가 걸려 있어서 anon 은 그걸로 들어온다.
   실측: anon 명시 권한만 회수한 직후에도 anon 키로 `places_take` 가 그대로 `1` 을 돌려줬다
   (그 호출로 그날 한도 1칸을 실제로 태웠다). `from public` 으로 걷어야 42501/PGRST202 가 된다.
   확인은 `has_function_privilege('anon', oid, 'EXECUTE')` 로 한다 — 눈으로 ACL 읽지 말 것. */

revoke execute on function public.food_assembly_rows_add(p_items jsonb) from public;
revoke execute on function public.food_assembly_set(p_items jsonb) from public;
revoke execute on function public.food_link_videos_by_address(p_channel text) from public;
revoke execute on function public.food_merge_channel(p_keep text, p_drop text) from public;
revoke execute on function public.food_merge_place(p_keep uuid, p_drop uuid) from public;
revoke execute on function public.food_place_info_set(p_items jsonb) from public;
revoke execute on function public.food_videos_mark_harvested(p_ids text[]) from public;
revoke execute on function public.naver_refund(p_n integer) from public;
revoke execute on function public.naver_take(p_want integer, p_cap integer) from public;
revoke execute on function public.places_refund(p_n integer) from public;
revoke execute on function public.places_take(p_want integer, p_cap integer) from public;
revoke execute on function public.reap_stalled_agent_jobs(p_minutes integer) from public;
revoke execute on function public.trg_recount_comment_actions() from public;
revoke execute on function public.trg_recount_plaza_votes() from public;

/* 20260901270000 에서 anon·authenticated 만 걷었던 것 — PUBLIC 이 남아 실제로는 안 닫혔다. */
revoke execute on function public._sft_scrub(t text) from public;
