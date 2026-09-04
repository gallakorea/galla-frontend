-- 블로그 역추적은 **대상을 골라야** 값이 난다.
--
-- 실측 2026-09-04(또간집 8편): 블로그 검색은 잘 되는데(10건씩 나온다) 건진 상호가 0이었다.
-- 질의를 열어보니 이유가 분명했다 — 영상 제목이 '조롱잔치', '👼옛다', '쫄?', '겸손해라' 였다.
-- 예능 쇼츠라 식당 얘기가 아니다. '또간집 조롱잔치'로 검색하니 성경 주석과 코인 뉴스가 나왔다.
-- 방법이 틀린 게 아니라 대상이 틀렸다.
--
-- 쓸 수 있는 영상은 **지역이 적힌 것**이다 — '겨울에 통영 가야하는 이유' 같은 회차.
-- 블로거들은 그런 회차를 두고 글을 쓴다. 지역이 없으면 블로그 질의 자체가 성립하지 않는다.
-- 네이버 블로그 검색은 하루 25,000건이라 무한하지 않다. 될 것에만 쓴다.

create table if not exists kr_region_names(name text primary key);
insert into kr_region_names(name)
select distinct regexp_replace(m[1], '(시|군|구)$', '')
  from food_places, lateral regexp_match(coalesce(address,''), '([가-힣]{2,6}(?:시|군|구))') m
 where m[1] is not null and length(regexp_replace(m[1], '(시|군|구)$', '')) >= 2
on conflict do nothing;

create or replace function public.food_videos_blog_targets(p_channel text, p_limit integer default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x order by published_at desc nulls last), '[]'::jsonb) from (
    select v.published_at,
           jsonb_build_object('video_id', v.video_id, 'title', v.title,
                              'channel', v.channel, 'published_at', v.published_at,
                              'region', g.name) x
      from food_videos v
      join lateral (
        select r.name from kr_region_names r
         where (coalesce(v.title,'') || ' ' || coalesce(v.description,'') || ' ' || coalesce(v.tags,''))
               like '%' || r.name || '%'
         order by length(r.name) desc limit 1     -- 긴 지명 우선('남구'보다 '통영')
      ) g on true
     where v.harvested_at is null
       and (p_channel is null or v.channel = p_channel)
       and length(coalesce(v.title,'')) >= 6
     order by v.published_at desc nulls last
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;
revoke all on function public.food_videos_blog_targets(text, integer) from public, anon;
