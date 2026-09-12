-- 꺼 둔 출처가 가게 상세·랭킹에 남아 보이던 것 (2026-09-12 인증 정리 QA에서 발견)
-- 미쉐린·블루리본을 끄고(20260912080000) 확인해 보니 '피양옥' 상세에 '미쉐린가이드 서울'이 그대로 떴다.
-- food_place_detail 의 sources·unknown_shows 와 food_rank 의 channels·과대평가 조건이 채널 active 를 안 봤다.
-- (지도 food_map·누구 고르기 food_channel_stats·퀴즈는 이미 active 만 본다) → 전부 같은 기준으로 맞춘다.
-- 시그니처 그대로라 오버로드 없음.

CREATE OR REPLACE FUNCTION public.food_place_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('ok', p.id is not null,
    'place', to_jsonb(p) - 'norm_name' - 'submitted_by',
    'visited', exists (select 1 from food_visits v where v.place_id=p.id and v.user_id=auth.uid()),
    'saved',   exists (select 1 from food_saves  s where s.place_id=p.id and s.user_id=auth.uid()),
    'stats', coalesce((select jsonb_build_object('good', st.good, 'bad', st.bad,
                                                 'heat', round(st.heat,2), 'comments', st.comments)
                         from food_stats st where st.place_id = p.id),
                      jsonb_build_object('good',0,'bad',0,'heat',0,'comments',0)),
    'mine', (select v.verdict from food_votes v where v.place_id = p.id and v.user_id = auth.uid()),
    'photos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', ph.id, 'url', ph.url, 'mine', ph.user_id = auth.uid(),
        'source', ph.source, 'credit', ph.credit,
        'nick', coalesce(u.nickname,'익명'))
        order by (ph.source = 'user') desc, ph.id desc)
      from food_photos ph left join user_profiles u on u.user_id = ph.user_id
     where ph.place_id = p.id and ph.status='live'), '[]'::jsonb),
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.name, 'price', m.price, 'source', m.source,
        'nick', coalesce(u2.nickname,'익명')) order by m.id)
      from food_menus m left join user_profiles u2 on u2.user_id = m.submitted_by
     where m.place_id = p.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at,
        'blurb', fs.blurb)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel and c.active
     where fs.place_id = p.id
       and (fs.video_id is not null or c.kind not in ('yt','tv'))), '[]'::jsonb),
    'unknown_shows', (select count(distinct fs.channel) from food_place_sources fs
                        join food_channels c on c.slug = fs.channel and c.active
                       where fs.place_id = p.id and fs.video_id is null and c.kind in ('yt','tv')),
    'unknown_channel', (select fs.channel from food_place_sources fs
                          join food_channels c on c.slug = fs.channel and c.active
                         where fs.place_id = p.id and fs.video_id is null and c.kind in ('yt','tv')
                         limit 1))
  from food_places p where p.id = p_id and p.status = 'live';
$function$;

CREATE OR REPLACE FUNCTION public.food_rank(p_kind text DEFAULT 'controversial'::text, p_region text DEFAULT NULL::text, p_min_votes integer DEFAULT 5, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object('ok', true, 'kind', p_kind, 'places',
    coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category,
      'good', s.good, 'bad', s.bad, 'total', s.good + s.bad,
      'heat', round(s.heat, 2), 'comments', s.comments,
      'pct', case when s.good + s.bad > 0
                  then round(s.good::numeric * 100 / (s.good + s.bad)) else 0 end,
      'channels', coalesce((select jsonb_agg(distinct fs.channel)
                              from food_place_sources fs join food_channels c on c.slug = fs.channel and c.active where fs.place_id = p.id), '[]'::jsonb)) x,
      case p_kind
        when 'loved'     then -(s.good - s.bad)::numeric
        when 'overrated' then -(s.bad - s.good)::numeric
        else             -s.heat
      end ord
    from food_places p
    join food_stats s on s.place_id = p.id
    where p.status = 'live'
      and s.good + s.bad >= greatest(coalesce(p_min_votes, 5), 1)
      and (p_region is null or p.region = p_region)
      -- 과대평가는 '방송에 나온 집'이면서 맛없다가 이긴 곳만. 그래야 의미가 있다.
      and (p_kind <> 'overrated' or (s.bad > s.good
           and exists (select 1 from food_place_sources fs join food_channels c on c.slug = fs.channel and c.active where fs.place_id = p.id)))
      and (p_kind <> 'loved' or s.good > s.bad)
    order by ord
    limit least(coalesce(p_limit, 30), 100)
  ) q;
$function$;
