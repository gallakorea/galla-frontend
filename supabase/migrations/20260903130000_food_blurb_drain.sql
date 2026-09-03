-- 맛집 영상 요약 큐가 영원히 빠지지 않던 버그
--
-- 왜: 큐는 `blurb is null` 로 뽑는데, LLM 이 근거를 못 찾아 빈 문자열을 주면
-- food_blurb_set 이 그 행을 **건너뛰었다**. 그러면 blurb 는 계속 null 이라
-- 10분 뒤 크론이 **같은 영상을 다시** 집는다. 실측(2026-09-03): 크론 20회가 돌았는데
-- 채워진 건 16,864 중 363 뿐이었다 — 큐 앞머리만 스무 번 씹은 것이다.
--
-- 고침: 시도했는데 못 만든 건 **빈 문자열('')** 로 표식을 남긴다(여행 gist 와 같은 규약).
-- 화면은 blurb 가 빈 문자열이면 안 그리므로 보이는 결과는 그대로다.
create or replace function public.food_blurb_set(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; m int := 0; t text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    t := left(btrim(coalesce(r->>'blurb','')), 200);
    update food_place_sources
       set blurb = t
     where video_id = r->>'video_id'
       and place_id = (r->>'place_id')::uuid
       and blurb is null;
    if t = '' then m := m + 1; else n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'set', n, 'marked', m);
end $$;

grant execute on function public.food_blurb_set(jsonb) to service_role;
