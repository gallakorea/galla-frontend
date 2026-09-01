-- 국가유산 인증 (2026-09-01) — 국보·보물·사적·명승·천연기념물
--
-- ⚠️ 종목별로 code 를 나눈다. '국가유산' 하나로 묶으면 화면에서 국보와 천연기념물이
--    같은 뱃지가 되는데, 그건 유저에게 다른 정보다.
insert into public.travel_cert_defs(code, name, emoji, blurb, sort) values
  ('nt',       '국보',       '🏆', '국가유산청 지정 국보',       3),
  ('treasure', '보물',       '🏵', '국가유산청 지정 보물',       4),
  ('historic', '사적',       '🏯', '국가유산청 지정 사적',       5),
  ('scenic',   '명승',       '⛰',  '국가유산청 지정 명승',       6),
  ('natmon',   '천연기념물', '🌲', '국가유산청 지정 천연기념물', 7)
on conflict (code) do update set name=excluded.name, emoji=excluded.emoji,
                                 blurb=excluded.blurb, sort=excluded.sort;

/* 국가유산 적재 — 위키데이터 경로(QID)와 달리 좌표+이름으로 중복을 가른다.
   ⚠️ 같은 이름이 전국에 흔하다('삼층석탑'). 이름만으로 묶으면 서로 다른 유산이 한 행이 된다.
      travel_places 의 기존 규칙(이름 + 100m 격자)을 그대로 따른다. */
create or replace function public.travel_heritage_ingest(p_code text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_tag int := 0; v_key text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    v_key := lower(regexp_replace(btrim(it->>'name'), '[[:space:]]', '', 'g'));
    select id into v_id from travel_places
     where norm_name = v_key and lat is not null
       and round(lat,3) = round((it->>'lat')::numeric,3)
       and round(lon,3) = round((it->>'lon')::numeric,3)
     limit 1;

    if v_id is null then
      begin
        insert into travel_places(name, country_code, country, admin1, city, lat, lon,
                                  category, scale, kind, geo_source, photo, photo_credit,
                                  photo_source, origin, status)
        values (btrim(it->>'name'), 'KR', '대한민국',
                nullif(btrim(it->>'admin1'),''), nullif(btrim(it->>'city'),''),
                (it->>'lat')::numeric, (it->>'lon')::numeric,
                nullif(btrim(it->>'category'),''), 'spot', 'spot', 'heritage',
                nullif(btrim(it->>'photo'),''), nullif(btrim(it->>'photo_credit'),''),
                case when nullif(btrim(it->>'photo'),'') is not null then 'heritage' end,
                'gov', 'live')
        returning id into v_id;
        v_new := v_new + 1;
      exception when unique_violation then
        select id into v_id from travel_places where norm_name = v_key and lat is not null limit 1;
      end;
    end if;

    if v_id is not null then
      insert into travel_certs(place_id, code, ref)
      values (v_id, p_code, nullif(btrim(it->>'ref'),''))
      on conflict (place_id, code) do nothing;
      if found then v_tag := v_tag + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new_places', v_new, 'tagged', v_tag);
end $fn$;
revoke all on function public.travel_heritage_ingest(text,jsonb) from anon, authenticated;
