-- 여행 「누가 다녀갔나」 모아보기 (2026-09-12 사장님: "여행도 맛집처럼 누가 갔나를 맨 위에")
-- 맛집 food_channel_stats 의 여행판. 맨 위 아바타 줄 + '누구 고르기' 시트(이름 검색·한국/해외 묶음)가 쓴다.
-- 목록 96명 전부를 한 번에 준다 — 장소 카드는 안 싣고(travel_browse 몫) 이름·로고·장소 수만.
-- 장소 수는 미리 세어 둔 place_n(live spot+city, 20분 크론) — 크리에이터 페이지·「N곳」과 같은 기준.

create or replace function public.travel_channel_stats()
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select jsonb_build_object('ok', true, 'channels', coalesce(jsonb_agg(jsonb_build_object(
      'slug', c.slug, 'name', c.name, 'thumb', c.thumb, 'lang', c.lang, 'total', c.place_n
    ) order by c.place_n desc, c.slug), '[]'::jsonb))
  from travel_channels c
  where c.active and c.place_n > 0;
$function$;

grant execute on function public.travel_channel_stats() to anon, authenticated;
