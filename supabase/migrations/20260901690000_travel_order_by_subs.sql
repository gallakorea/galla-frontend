-- 크리에이터 정렬 = 구독자 순 (2026-09-01)
-- 사장님: "밑에 크리에이터 나오는 거 무슨 순서야? 구독자 순으로 가야 하는 거 아닌가? 최적으로 해."
--
-- 그동안은 '우리가 뽑아낸 장소 수' 순이었다. 그건 우리 수집 진도일 뿐 유저에겐 뜻이 없다 —
-- 어제는 고고몽이 2등, 오늘은 다른 사람이 2등이 된다.
-- → **구독자 순**으로 세운다(channels.list 로 87채널 실측, 2유닛).
-- ⚠️ 다만 점이 너무 적은 채널을 맨 앞에 두면 눌러도 선이 안 그려진다.
--    그래서 '경로가 될 만한가(점 3개 이상)'를 1차 기준, 구독자를 2차 기준으로 둔다.
--    구독자를 숨긴 채널은 subs 가 null 이라 같은 그룹 안에서 맨 뒤로 간다.
create or replace function public.travel_route_channels(p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'channels', coalesce(jsonb_agg(x order by ord, subs desc nulls last, n desc), '[]'::jsonb))
  from (
    select jsonb_build_object('slug', c.slug, 'name', c.name, 'thumb', c.thumb,
                              'n', count(distinct p.id), 'subs', c.subs) x,
           count(distinct p.id) n,
           c.subs,
           (count(distinct p.id) >= 3) is not true as ord     -- 점 3개 미만은 뒤로
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id
                          and p.status='live' and p.lat is not null and p.scale <> 'country'
     where c.active
     group by c.slug, c.name, c.thumb, c.subs
    having count(distinct p.id) >= 2
     order by (count(distinct p.id) >= 3) is not true, c.subs desc nulls last, count(distinct p.id) desc
     limit least(coalesce(p_limit, 20), 40)
  ) q;
$fn$;

/* '누가 갔나' 섹션도 같은 기준으로 — 화면마다 순서가 다르면 유저가 규칙을 못 읽는다. */
create or replace function public.travel_browse(p_per int default 10, p_channels int default 12)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u),
  ch as (
    select c.slug, c.name, c.thumb, c.lang, c.subs,
           count(distinct p.id) total,
           count(distinct p.id) filter (
             where exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) mine
      from travel_channels c
      join travel_place_sources ts on ts.channel = c.slug
      join travel_places p on p.id = ts.place_id and p.status = 'live' and p.scale = 'spot'
     where c.active
     group by c.slug, c.name, c.thumb, c.lang, c.subs
    having count(distinct p.id) > 0
     order by c.subs desc nulls last, count(distinct p.id) desc
     limit least(coalesce(p_channels, 12), 30)
  )
  select jsonb_build_object('ok', true, 'sections',
    coalesce(jsonb_agg(jsonb_build_object(
      'slug', ch.slug, 'name', ch.name, 'thumb', ch.thumb, 'lang', ch.lang,
      'subs', ch.subs, 'total', ch.total, 'visited', ch.mine,
      'pct', case when ch.total > 0 then round(ch.mine::numeric * 100 / ch.total) else 0 end,
      'places', coalesce(pl.arr, '[]'::jsonb)
    ) order by ch.subs desc nulls last, ch.total desc), '[]'::jsonb))
  from ch
  left join lateral (
    select jsonb_agg(x order by created_at desc) arr from (
      select jsonb_build_object(
        'id', p.id, 'name', p.name, 'city', coalesce(p.admin1, p.city), 'country', p.country,
        'country_code', p.country_code, 'scale', p.scale, 'kind', p.kind,
        'cover', travel_cover_video(p.id, ch.slug),
        'visited', exists (select 1 from travel_visits v
                            where v.place_id = p.id and v.user_id = (select u from me))) x,
        p.created_at
      from (
        select distinct p2.*
          from travel_place_sources ts2
          join travel_places p2 on p2.id = ts2.place_id
                               and p2.status = 'live' and p2.scale = 'spot'
         where ts2.channel = ch.slug
      ) p
      order by p.created_at desc
      limit least(coalesce(p_per, 10), 30)
    ) q
  ) pl on true;
$fn$;
