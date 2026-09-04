-- 상세의 유도 버튼이 **그 방송 안에서** 묻게 채널을 같이 내려준다.
-- 아무 채널의 아무 영상을 물으면 맥락이 없다 — 이 집에 '갔다더라'는 그 방송을 묻는 게 맞다.
create or replace function food_place_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
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
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id
       and (fs.video_id is not null or c.kind not in ('yt','tv'))), '[]'::jsonb),
    'unknown_shows', (select count(distinct fs.channel) from food_place_sources fs
                        join food_channels c on c.slug = fs.channel
                       where fs.place_id = p.id and fs.video_id is null and c.kind in ('yt','tv')),
    'unknown_channel', (select fs.channel from food_place_sources fs
                          join food_channels c on c.slug = fs.channel and c.active
                         where fs.place_id = p.id and fs.video_id is null and c.kind in ('yt','tv')
                         limit 1))
  from food_places p where p.id = p_id and p.status = 'live';
$$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;
