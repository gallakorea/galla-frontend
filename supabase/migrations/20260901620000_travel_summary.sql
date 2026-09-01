-- 여행지 설명란 (2026-09-01) — 사장님: "그 여행지에 대한 설명란이 상세에 들어가야 할 것 같다"
--
-- ⚖️ 설명은 **지어내지 않는다**. LLM 에게 쓰게 하면 안 가본 곳을 그럴듯하게 묘사하고,
--    그건 여행지 정보로서 거짓말이다. 실제 출처에서 가져오고 출처를 표시한다:
--      · 위키백과(한국어 우선, 없으면 영어) 도입부 — CC BY-SA, 출처 표시 의무
--      · 한국관광공사 detailCommon 개요 — 공공누리
--    둘 다 없는 곳(무명 식당 등)은 설명이 없다. 비워두는 게 지어내는 것보다 낫다.
alter table public.travel_places add column if not exists summary text;
alter table public.travel_places add column if not exists summary_src text;   -- wikipedia|tour
alter table public.travel_places add column if not exists summary_url text;
alter table public.travel_places add column if not exists summary_at timestamptz;

/* 설명이 필요한 곳 — 위키데이터 QID 가 있거나 국내(관광공사로 물어볼 수 있는) 곳부터.
   ⚠️ summary_at 은 결과와 무관하게 찍는다. '못 찾았다'와 '안 찾아봤다'를 안 가르면
      설명 없는 곳을 매 회차 다시 물어본다. */
create or replace function public.travel_places_needing_summary(p_limit int default 20)
returns table(id uuid, name text, name_en text, wikidata_qid text, country_code text)
language sql stable security definer set search_path to 'public' as $fn$
  select p.id, p.name, p.name_en, p.wikidata_qid, p.country_code
    from travel_places p
   where p.status = 'live' and p.summary_at is null
     and (p.wikidata_qid is not null or p.country_code = 'KR')
   order by (p.wikidata_qid is null), p.created_at desc
   limit greatest(coalesce(p_limit, 20), 1);
$fn$;

create or replace function public.travel_summary_save(p_items jsonb)
returns int language plpgsql security definer set search_path = public as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    update travel_places set
      summary = nullif(btrim(it->>'summary'),''),
      summary_src = nullif(btrim(it->>'src'),''),
      summary_url = nullif(btrim(it->>'url'),''),
      summary_at = now(), updated_at = now()
     where id = (it->>'id')::uuid;
    n := n + 1;
  end loop;
  return n;
end $fn$;

/* 상세에 설명을 실어 보낸다 */
create or replace function public.travel_place_info(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', p.id is not null,
    'place', jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_local', p.name_local, 'name_en', p.name_en,
      'city', coalesce(p.admin1, p.city), 'country', p.country, 'country_code', p.country_code,
      'address', p.address, 'lat', p.lat, 'lon', p.lon,
      'scale', p.scale, 'kind', p.kind, 'category', p.category, 'status', p.status,
      'cover', travel_cover(p.id), 'photo_credit', p.photo_credit,
      'geo_source', p.geo_source, 'wikidata_qid', p.wikidata_qid,
      'summary', p.summary, 'summary_src', p.summary_src, 'summary_url', p.summary_url),
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
               'channel', c.name, 'channel_slug', c.slug, 'thumb', c.thumb,
               'aired_at', ts.aired_at) order by ts.aired_at desc nulls last)
        from travel_place_sources ts
        join travel_channels c on c.slug = ts.channel
       where ts.place_id = p.id and ts.video_id is not null), '[]'::jsonb))
  from travel_places p
  left join travel_stats s on s.place_id = p.id
  where p.id = p_id and p.status in ('live','pending');
$fn$;

revoke all on function public.travel_places_needing_summary(int) from anon, authenticated;
revoke all on function public.travel_summary_save(jsonb)         from anon, authenticated;
grant execute on function public.travel_place_info(uuid) to anon, authenticated;
