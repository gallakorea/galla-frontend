-- 참여 생태계 (2026-08-31)
--
-- 진단: 참여 창구(사진·메뉴·제보)를 다 만들었는데 실적이 0이다.
--   창구를 만드는 것과 참여가 도는 것은 다른 문제였다.
--   "빈 칸이 있으니 채워주세요"는 안 돈다 — 사람은 남의 빈 칸을 채워주지 않는다.
--
-- 갈라의 엔진은 데이터 입력이 아니라 **논쟁**이다. 사람은 기부하러 오지 않고 싸우러 온다.
--   → 데이터가 논쟁의 부산물로 쌓이게 만든다.
--
-- 지금 제일 큰 구멍: 판정과 댓글이 끊겨 있다. 맛없다를 누르고 그냥 끝난다.
--   근거를 안 남기니 다음 사람이 볼 게 없고, 반박할 대상도 없다.

/* ① 판정에 붙는 한 줄 근거 — 판정 직후 바로 남긴다.
   기존 food_say 는 별도 입력창이라 '한 번 더' 움직여야 했다. 이건 판정의 일부다. */
create or replace function public.food_judge_say(p_id uuid, p_verdict text, p_body text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_j jsonb; v_cid bigint;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  v_j := food_judge(p_id, p_verdict);
  if not (v_j->>'ok')::boolean then return v_j; end if;

  -- 진영을 취소한 경우(같은 걸 또 누름)엔 근거를 남기지 않는다
  if (v_j->>'mine') is not null and length(btrim(coalesce(p_body,''))) > 0 then
    insert into food_comments(place_id, user_id, body, faction)
    values (p_id, v_uid, btrim(p_body), v_j->>'mine')
    returning id into v_cid;
    perform food_recalc(p_id);
  end if;
  return v_j || jsonb_build_object('comment_id', v_cid);
end $fn$;
grant execute on function public.food_judge_say(uuid,text,text) to authenticated;

/* ② 기여자를 드러낸다 — 지금은 사진·메뉴가 익명으로 묻혀 아무도 알아주지 않는다.
   이름이 붙어야 다음 사람이 올린다. */
create or replace function public.food_place_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
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
        'nick', coalesce(u.nickname,'익명')) order by ph.id desc)
      from food_photos ph left join user_profiles u on u.user_id = ph.user_id
     where ph.place_id = p.id and ph.status='live'), '[]'::jsonb),
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.name, 'price', m.price, 'source', m.source,
        'nick', coalesce(u2.nickname,'익명')) order by m.id)
      from food_menus m left join user_profiles u2 on u2.user_id = m.submitted_by
     where m.place_id = p.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$fn$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;

/* ③ 결핍을 드러낸다 — "채워주세요"가 아니라 "이 동네에 아직 아무도 안 한 게 N개 있다".
   할 일이 눈에 보여야 손이 간다. 첫 기여자에겐 그 집의 대표가 된다는 보상이 있다. */
create or replace function public.food_gaps(p_region text default null)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true,
    'no_photo', count(*) filter (where not exists (
        select 1 from food_photos ph where ph.place_id = p.id and ph.status='live')),
    'no_vote',  count(*) filter (where not exists (
        select 1 from food_votes v where v.place_id = p.id)),
    'no_menu',  count(*) filter (where not exists (
        select 1 from food_menus m where m.place_id = p.id)),
    'total', count(*))
  from food_places p
  where p.status='live' and (p_region is null or p.region = p_region);
$fn$;
grant execute on function public.food_gaps(text) to anon, authenticated;

/* ④ 아직 아무도 손대지 않은 집 — '첫 번째가 되기' 목록 */
create or replace function public.food_untouched(p_region text default null, p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'category', p.category,
      'lat', p.lat, 'lon', p.lon,
      'video_id', (select fs.video_id from food_place_sources fs
                    where fs.place_id=p.id and fs.video_id is not null limit 1),
      'channels', coalesce((select jsonb_agg(distinct fs.channel)
                              from food_place_sources fs where fs.place_id=p.id), '[]'::jsonb),
      'need', case when not exists (select 1 from food_votes v where v.place_id=p.id) then 'vote'
                   else 'photo' end) x,
      p.created_at ord
    from food_places p
    where p.status='live'
      and (p_region is null or p.region = p_region)
      and not exists (select 1 from food_photos ph where ph.place_id=p.id and ph.status='live')
    order by p.created_at desc
    limit least(coalesce(p_limit,20), 60)
  ) q;
$fn$;
grant execute on function public.food_untouched(text,int) to anon, authenticated;

select food_gaps();
