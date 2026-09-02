-- 상세 RPC 가 영상 한 줄 요약을 같이 준다 (2026-09-02)
-- ⚠️ 원본 정의를 pg_get_functiondef 로 그대로 떠서 한 필드만 끼웠다.
--    기억으로 다시 쓰면 videos 블록 같은 데서 조용히 달라진다(전에 한 번 틀렸다).
CREATE OR REPLACE FUNCTION public.travel_place_info(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', p.id is not null,
    'place', jsonb_build_object(
      'id', p.id, 'slug', p.slug, 'sid', p.sid, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', coalesce(p.admin1, p.city), 'country', p.country, 'country_code', p.country_code,
      'address', p.address, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'category', p.category, 'status', p.status,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source, 'wikidata_qid', p.wikidata_qid,
      'summary', p.summary, 'summary_src', p.summary_src, 'summary_url', p.summary_url,
      'certs', coalesce((select jsonb_agg(jsonb_build_object(
                            'code', d.code, 'name', d.name, 'emoji', d.emoji, 'blurb', d.blurb)
                            order by d.sort)
                          from travel_certs tc join travel_cert_defs d on d.code = tc.code
                         where tc.place_id = p.id), '[]'::jsonb)),
    'stats', jsonb_build_object(
      'again', coalesce(s.again,0), 'once', coalesce(s.once,0),
      'want', coalesce(s.want,0), 'comments', coalesce(s.comments,0),
      'heat', round(coalesce(s.heat,0),2), 'hype', round(coalesce(s.hype,0),2)),
    'mine', (select v.verdict from travel_votes v
              where v.place_id = p.id and v.user_id = (select u from me)),
    'saved', exists (select 1 from travel_saves sv
                      where sv.place_id = p.id and sv.user_id = (select u from me)),
    'videos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'video_id', ts.video_id, 'title', ts.video_title,
               /* 사장님: "재생 중인 영상의 상세에 붙어야지."
                  유튜브 제목은 낚시성이라 뭘 하는 영상인지 안 보인다 —
                  수확 때 같은 AI 호출에서 덤으로 받아 둔 한 줄을 같이 내보낸다. */
               'gist', (select v.gist from travel_videos v
                         where v.video_id = ts.video_id and v.channel = ts.channel),
               'channel', c.name, 'channel_slug', c.slug, 'thumb', c.thumb,
               'aired_at', ts.aired_at) order by ts.aired_at desc nulls last)
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id and ts.video_id is not null), '[]'::jsonb))
  from travel_places p
  left join travel_stats s on s.place_id = p.id
  where p.id = p_id and p.status in ('live','pending');
$function$
;
