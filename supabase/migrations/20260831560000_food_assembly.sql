-- 국회의원이 정치자금으로 밥 먹은 집 — 갈라만 할 수 있는 축.
--
-- 출처: 오마이뉴스가 중앙선관위에 정보공개청구해 받은 국회의원 정치자금 수입지출보고서를
--   경향신문·뉴스타파와 공동 분석해 정리한 데이터(2012~2024). GitHub MIT 라이선스로
--   "자유롭게 이용" 명시. 남의 편집물(맛집 지도 사이트)을 복제한 게 아니라 원본 데이터다.
--
-- ⚖️ 노출 범위 원칙: **식당 단위 집계까지만.**
--   · 노출한다: 의원 N명이 M회 방문 · 총액 · 1인당 평균 · 정당 분포 · 기간
--   · 노출하지 않는다: "○○○ 의원이 언제 얼마 결제" 같은 개별 영수증 단위
--   집계는 이미 언론이 보도한 형태다. 개별 결제 건까지 펼치면 맛집 서비스가 아니라
--   개인 감시 도구가 된다. 갈라에 필요한 건 '세금으로 갈 만한 집인가'라는 판정 소재다.
--
-- ⚠️ 정당 분포는 진영 대립의 근거가 되므로 **집계 수치 그대로** 담는다(가공·해석 금지).
create table if not exists food_assembly (
  place_id    uuid primary key references food_places(id) on delete cascade,
  raw_name    text not null,          -- 원본 사용처 표기(검증 전 상호)
  mps         integer not null,       -- 다녀간 의원 수(고유)
  visits      integer not null,       -- 결제 건수
  amount      bigint  not null,       -- 총 지출액(원)
  parties     jsonb   not null default '{}'::jsonb,   -- {"국민의힘":8,"더불어민주당":4}
  year_from   integer,
  year_to     integer,
  updated_at  timestamptz not null default now()
);
create index if not exists food_assembly_mps on food_assembly(mps desc);

alter table food_assembly enable row level security;
create policy food_assembly_read on food_assembly for select to anon, authenticated using (true);
grant select on food_assembly to anon, authenticated;
grant select, insert, update, delete on food_assembly to service_role;

-- 집계를 통째로 넣는 관문. 장소는 food_ingest 가 만든 뒤 여기에 통계를 붙인다.
create or replace function food_assembly_set(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into food_assembly(place_id, raw_name, mps, visits, amount, parties, year_from, year_to, updated_at)
    values ((it->>'place_id')::uuid, it->>'raw_name',
            (it->>'mps')::int, (it->>'visits')::int, (it->>'amount')::bigint,
            coalesce(it->'parties','{}'::jsonb),
            nullif(it->>'y0','')::int, nullif(it->>'y1','')::int, now())
    on conflict (place_id) do update set
      raw_name = excluded.raw_name, mps = excluded.mps, visits = excluded.visits,
      amount = excluded.amount, parties = excluded.parties,
      year_from = excluded.year_from, year_to = excluded.year_to, updated_at = now();
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'n', n);
end $$;
grant execute on function food_assembly_set(jsonb) to service_role;

-- 국회 랭킹 — '의원이 많이 간 집' / '가장 비싼 집(1인당)'
create or replace function food_assembly_rank(p_kind text default 'mps', p_limit integer default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() u)
  select jsonb_build_object('ok', true, 'places', coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'category', p.category,
      'lat', p.lat, 'lon', p.lon, 'cover', food_cover(p.id),
      'mps', a.mps, 'visits', a.visits, 'amount', a.amount,
      'per_visit', case when a.visits > 0 then (a.amount / a.visits) else 0 end,
      'parties', a.parties, 'y0', a.year_from, 'y1', a.year_to,
      'good', coalesce(st.good,0), 'bad', coalesce(st.bad,0),
      'visited', exists (select 1 from food_visits v
                          where v.place_id = p.id and v.user_id = (select u from me))) x,
      case p_kind
        when 'spend' then (a.amount / greatest(a.visits,1))
        else a.mps
      end ord
    from food_assembly a
    join food_places p on p.id = a.place_id and p.status = 'live'
    left join food_stats st on st.place_id = p.id
    where (p_kind <> 'spend' or a.visits >= 3)   -- 표본이 적으면 1인당 금액이 우연이다
    order by ord desc
    limit least(coalesce(p_limit, 40), 200)
  ) q;
$$;
grant execute on function food_assembly_rank(text,integer) to anon, authenticated;
