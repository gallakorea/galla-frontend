-- 판정 선택지 정리 (2026-09-01) — 사장님: "이거 선택지가 너무 많은데"
--
-- 넷은 많다. 게다가 유저에게 '나는 가본 사람인가'를 먼저 분류시키는 구조라 한 번 더 생각하게 한다.
-- → 화면은 둘로 줄인다: **또 간다 / 한 번이면 족**.
--   '가고 싶다'는 판정이 아니라 **찜**이다(하트). '관심 없다'는 누를 이유가 없어 없앤다.
--
-- ⚠️ 과대평가 지표(hype)가 want/pass 비율에 기대고 있었다. pass 가 안 들어오면 want_rate 가
--    항상 1이 되어 지표가 망가진다. 정의를 바꾼다:
--        hype = (1 − 또간다율) × ln(1 + 가고싶다 수)
--    "가고 싶어 하는 사람은 많은데(want), 가본 사람은 또 안 간다(1−again_rate)" — 뜻이 더 곧다.
--    verdict 의 'pass' 는 제약에 남겨둔다(옛 표가 있고, 지우면 통계가 깨진다).
create or replace function public.travel_recalc(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare a int; o int; w int; p int; c int; v int; ar numeric;
begin
  select count(*) filter (where verdict='again'), count(*) filter (where verdict='once'),
         count(*) filter (where verdict='want'),  count(*) filter (where verdict='pass')
    into a, o, w, p from travel_votes where place_id = p_id;
  /* 찜(travel_saves)도 '가고 싶다'로 센다 — 화면에서 하트가 그 역할을 한다 */
  w := w + coalesce((select count(*) from travel_saves s where s.place_id = p_id), 0);
  select count(*) into c from travel_comments where place_id = p_id and status='live';
  v := a + o;
  ar := case when v = 0 then null else a::numeric / v end;

  insert into travel_stats(place_id, again, once, want, pass, comments, heat, hype, updated_at)
  values (p_id, a, o, w, p, c,
          case when v = 0 then 0 else (1 - abs(a - o)::numeric / v) * ln(1 + v) end,
          case when ar is null or w = 0 then 0 else (1 - ar) * ln(1 + w) end,
          now())
  on conflict (place_id) do update set
    again = excluded.again, once = excluded.once,
    want = excluded.want, pass = excluded.pass,
    comments = excluded.comments, heat = excluded.heat, hype = excluded.hype,
    updated_at = now();
end $fn$;

/* 찜 토글 — 하트가 부른다. 찜은 판정이 아니라서 '투표해야 말할 수 있다'와 무관하다. */
create or replace function public.travel_save(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_on boolean;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  delete from travel_saves where place_id = p_id and user_id = v_uid;
  if found then v_on := false; else
    insert into travel_saves(user_id, place_id) values (v_uid, p_id) on conflict do nothing;
    v_on := true;
  end if;
  perform travel_recalc(p_id);
  return jsonb_build_object('ok',true,'saved',v_on) ||
    (select jsonb_build_object('want',want) from travel_stats where place_id = p_id);
end $fn$;
grant execute on function public.travel_save(uuid) to authenticated;

/* 상세에 '내가 찜했나'를 실어 보낸다 */
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
      'geo_source', p.geo_source, 'wikidata_qid', p.wikidata_qid),
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
grant execute on function public.travel_place_info(uuid) to anon, authenticated;
