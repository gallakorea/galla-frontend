-- 인증 층 (2026-09-01) — 사장님: "맛집처럼 관광공사 추천 여행지 같은 걸로, 미슐랭처럼"
--
-- 맛집의 food_channels.kind='guide'(백년가게·미쉐린·블루리본)와 같은 자리다.
-- 크리에이터 발자국(주인공) 위에 **권위 있는 인증**을 뱃지로 얹는다. 섞지 않는다.
--
-- 1호는 **유네스코 세계유산**이다. 이유:
--   · 전 세계가 대상이라 우리 무대(전 세계)와 맞는다. 국내 인증만으론 해외가 빈다.
--   · 위키데이터(CC0)에 P1435=Q9259 로 3,383건이 있고 한국어 표기·좌표가 딸려 온다.
--   · 유네스코 공식 사이트는 클라우드플레어가 막아 직접 못 받는다(403 실측).
-- ⚠️ 한국관광 100선은 공공데이터포털에 **파일데이터로만** 있다(자동 API 미등록 — 404 실측).
--    받아오면 같은 구조에 code='kto100' 으로 얹으면 된다.
create table if not exists public.travel_cert_defs (
  code  text primary key,
  name  text not null,
  emoji text,
  blurb text,
  sort  int not null default 0
);
insert into public.travel_cert_defs(code, name, emoji, blurb, sort) values
  ('unesco', '유네스코 세계유산', '🏛', '유네스코가 지정한 인류 공동의 유산', 1),
  ('kto100', '한국관광 100선',   '🇰🇷', '문화체육관광부·한국관광공사 선정', 2)
on conflict (code) do update set name=excluded.name, emoji=excluded.emoji, blurb=excluded.blurb;

create table if not exists public.travel_certs (
  place_id uuid not null references public.travel_places(id) on delete cascade,
  code     text not null references public.travel_cert_defs(code) on delete cascade,
  year     int,
  ref      text,                       -- 위키데이터 QID 등 근거
  created_at timestamptz not null default now(),
  primary key (place_id, code)
);
create index if not exists travel_certs_code on public.travel_certs (code);

alter table public.travel_cert_defs enable row level security;
alter table public.travel_certs     enable row level security;
drop policy if exists travel_cert_defs_read on public.travel_cert_defs;
create policy travel_cert_defs_read on public.travel_cert_defs for select to anon, authenticated using (true);
drop policy if exists travel_certs_read on public.travel_certs;
create policy travel_certs_read on public.travel_certs for select to anon, authenticated using (true);
grant select, insert, update, delete on public.travel_certs to service_role;

/* 인증 적재 — 이미 있는 장소엔 뱃지만 붙이고, 없는 곳은 장소로 만든다(origin='gov').
   ⚠️ 세계유산을 장소로 넣는 건 '남의 편집물 복제'가 아니다. 유네스코 지정 사실과 좌표는
      사실이고 위키데이터는 CC0 다. 다만 우리 화면의 주인공은 여전히 크리에이터 발자국이다. */
create or replace function public.travel_cert_ingest(p_code text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare it jsonb; v_id uuid; v_new int := 0; v_tag int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    v_id := null;
    select id into v_id from travel_places
     where wikidata_qid = nullif(btrim(it->>'qid'),'') limit 1;

    if v_id is null then
      begin
        insert into travel_places(name, name_en, country_code, country, lat, lon,
                                  scale, kind, wikidata_qid, geo_source, photo, photo_credit,
                                  photo_source, origin, status)
        values (btrim(it->>'name'), nullif(btrim(it->>'name_en'),''),
                upper(nullif(btrim(it->>'country_code'),'')), nullif(btrim(it->>'country'),''),
                nullif(it->>'lat','')::numeric, nullif(it->>'lon','')::numeric,
                'spot', 'spot', nullif(btrim(it->>'qid'),''), 'wikidata',
                nullif(btrim(it->>'photo'),''), nullif(btrim(it->>'photo_credit'),''),
                case when nullif(btrim(it->>'photo'),'') is not null then 'commons' end,
                'gov', 'live')
        returning id into v_id;
        v_new := v_new + 1;
      exception when unique_violation then
        select id into v_id from travel_places
         where wikidata_qid = nullif(btrim(it->>'qid'),'') limit 1;
      end;
    end if;

    if v_id is not null then
      insert into travel_certs(place_id, code, year, ref)
      values (v_id, p_code, nullif(it->>'year','')::int, nullif(btrim(it->>'qid'),''))
      on conflict (place_id, code) do nothing;
      if found then v_tag := v_tag + 1; end if;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'new_places', v_new, 'tagged', v_tag);
end $fn$;
revoke all on function public.travel_cert_ingest(text,jsonb) from anon, authenticated;
