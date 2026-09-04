-- 🔴 근거 없는 '누가 다녀갔나'를 화면에서 내린다.
--
-- 유튜버·방송 출처 7,467건(가게 6,012곳)이 **어느 회차인지 모르는 채로** 떠 있었다.
-- 사장님 제보가 정확히 이거였다 — "다녀갔다는데 영상 안 붙은 게 많다".
-- 근거 있는 것과 같은 모양으로 두면 **근거 있는 3,804곳까지 같이 의심받는다.**
--
-- ⚠️ 다 내리면 안 된다. 인증(guide: 백년가게·블루리본)과 공직자(gov: 업무추진비)는
--    **영상이 원래 없는 게 정상**이다. 인증서지 방송이 아니다.
--    → 영상을 요구하는 건 kind in ('yt','tv') 뿐이다.
--
-- ⚠️ 행은 지우지 않는다. 퀴즈로 진짜 회차가 밝혀지면 그 자리를 대체하고,
--    지워버리면 '이 채널이 갔다더라'는 실마리까지 없어진다. 화면에서만 뺀다.
--
-- 대가: 가게 4,662곳에서 '누가 다녀갔나'가 통째로 사라진다. 없는 걸 없다고 보여주는 게 맞다.
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
    -- 퀴즈 진입로: 이 집에 '회차를 모르는 방송 주장'이 남아 있는가
    'unknown_shows', (select count(distinct fs.channel) from food_place_sources fs
                        join food_channels c on c.slug = fs.channel
                       where fs.place_id = p.id and fs.video_id is null and c.kind in ('yt','tv')))
  from food_places p where p.id = p_id and p.status = 'live';
$$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;
