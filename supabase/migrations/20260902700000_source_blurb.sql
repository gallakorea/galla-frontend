-- 영상마다 '이 집을 어떻게 소개했나'를 한 줄로 붙인다.
--
-- 왜: 상세를 열면 채널 로고와 영상 제목·썸네일만 있다. 제목은 "디저트 특집! 후식이 명란 밥!"
-- 처럼 그 집 얘기가 아니라 회차 제목이라, 이 집이 왜 나왔는지 눌러보기 전엔 모른다.
-- 눌러야 아는 건 미리보기가 아니다. 그리고 이 문장은 나중에 검색 대상이 된다.
--
-- 붙는 자리: 재생 영상 블록 안. 가게 단위가 아니라 **영상 단위**다 —
-- 같은 집이 여러 영상에 나오면 영상마다 다른 얘기를 하기 때문이다.
alter table food_place_sources add column if not exists blurb text;

-- 수확이 뽑아준 blurb 를 같이 저장한다. 새로 들어오는 건 이 경로로 채워진다(LLM 추가 호출 0).
create or replace function food_ingest(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare it jsonb; v_id uuid; v_new int := 0; v_dup int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    begin
      insert into food_places(name, address, lat, lon, category, phone, origin)
      values (btrim(it->>'name'), btrim(it->>'address'),
              nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
              nullif(it->>'category',''), nullif(it->>'phone',''),
              coalesce(nullif(it->>'origin',''),'yt'))
      returning id into v_id;
      v_new := v_new + 1;
    exception when unique_violation then
      select id into v_id from food_places
       where norm_name = lower(regexp_replace(btrim(it->>'name'),'[[:space:]]','','g'))
         and (
           regexp_replace(coalesce(address,''),'[[:space:]]','','g')
             = regexp_replace(btrim(coalesce(it->>'address','')),'[[:space:]]','','g')
           or (nullif(it->>'lat','') is not null and lat is not null
               and round(lat,3) = round((it->>'lat')::numeric,3)
               and round(lon,3) = round((it->>'lon')::numeric,3))
         )
       limit 1;
      v_dup := v_dup + 1;
    end;

    if v_id is not null and jsonb_typeof(it->'menus') = 'array' then
      insert into food_menus(place_id, name, price, source)
      select v_id, btrim(m->>'name'), (m->>'price')::integer, 'yt'
        from jsonb_array_elements(it->'menus') m
       where btrim(coalesce(m->>'name','')) <> ''
         and (m->>'price') ~ '^[0-9]+$'
      on conflict do nothing;
    end if;

    if v_id is not null and nullif(it->>'channel','') is not null then
      insert into food_place_sources(place_id, channel, video_id, video_title, aired_at, blurb)
      values (v_id, it->>'channel', nullif(it->>'video_id',''), nullif(it->>'video_title',''),
              nullif(it->>'aired_at','')::timestamptz, nullif(btrim(coalesce(it->>'blurb','')), ''))
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'new',v_new,'dup',v_dup);
end $$;

-- 상세가 blurb 를 같이 내려준다(영상 카드에 그릴 문장).
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
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$$;

-- 요약을 아직 못 받은 영상을 집어준다(배치용). 가게 목록을 같이 줘서 LLM 한 번에 처리한다.
create or replace function food_videos_to_blurb(p_limit int default 20)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select jsonb_build_object(
      'video_id', fs.video_id,
      'title', min(fs.video_title),
      'description', left(coalesce(min(v.description), ''), 2500),
      'places', jsonb_agg(jsonb_build_object('id', fs.place_id, 'name', p.name))
    ) x
      from food_place_sources fs
      join food_places p on p.id = fs.place_id and p.status = 'live'
      left join food_videos v on v.video_id = fs.video_id
     where fs.video_id is not null and fs.blurb is null
     group by fs.video_id
     limit greatest(coalesce(p_limit, 20), 1)
  ) q;
$$;

create or replace function food_blurb_set(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) loop
    if length(btrim(coalesce(r->>'blurb',''))) = 0 then continue; end if;
    update food_place_sources
       set blurb = left(btrim(r->>'blurb'), 200)
     where video_id = r->>'video_id' and place_id = (r->>'place_id')::uuid and blurb is null;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'set', n);
end $$;

revoke all on function food_videos_to_blurb(int) from public, anon, authenticated;
revoke all on function food_blurb_set(jsonb)     from public, anon, authenticated;
grant execute on function food_videos_to_blurb(int) to service_role;
grant execute on function food_blurb_set(jsonb)     to service_role;
