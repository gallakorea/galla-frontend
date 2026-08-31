-- 개별 결제 내역 — 어느 의원이 언제 얼마 썼는지.
--
-- ⚖️ 왜 개인 단위까지 여는가
--   · 국회의원은 공인이고, 정치자금은 **법이 공개를 강제**하는 정보다(정치자금법).
--   · 이 데이터 자체가 중앙선관위 정보공개 → 오마이뉴스·경향신문·뉴스타파가
--     MIT 라이선스로 전체 공개한 것이다. 우리가 새로 캐낸 사생활이 아니다.
--   · 그래도 우리가 지킬 선은 있다: **기록에 적힌 것만** 보여준다.
--     추정·해석·점수화를 붙이지 않는다. 판단은 이용자의 판정(맛있다/맛없다)으로 한다.
--
-- ⚠️ OCR 자료라 정제 수준이 항목마다 다르다(원본 README 고지). 금액·날짜·의원명은
--    신뢰도가 높고 주소·사업자번호는 낮다 — 그래서 우리는 후자를 아예 안 쓴다.
create table if not exists food_assembly_rows (
  id         bigserial primary key,
  place_id   uuid not null references food_places(id) on delete cascade,
  mp         text not null,           -- 의원명(동명이인은 원본이 지역 표기로 구분)
  party      text,
  spent_on   date,
  amount     bigint not null,
  memo       text,                    -- 원본 '내역'
  category   text,                    -- 원본 '분류'(간담회_식대 등)
  created_at timestamptz not null default now()
);
create index if not exists food_assembly_rows_place on food_assembly_rows(place_id, spent_on desc);
create unique index if not exists food_assembly_rows_dedupe
  on food_assembly_rows(place_id, mp, spent_on, amount, coalesce(memo,''));

alter table food_assembly_rows enable row level security;
create policy food_assembly_rows_read on food_assembly_rows for select to anon, authenticated using (true);
grant select on food_assembly_rows to anon, authenticated;
grant select, insert, update, delete on food_assembly_rows to service_role;

create or replace function food_assembly_rows_add(p_items jsonb)
returns jsonb language sql security definer set search_path = public as $$
  with ins as (
    insert into food_assembly_rows(place_id, mp, party, spent_on, amount, memo, category)
    select (x->>'place_id')::uuid, x->>'mp', nullif(x->>'party',''),
           nullif(x->>'spent_on','')::date, (x->>'amount')::bigint,
           nullif(x->>'memo',''), nullif(x->>'category','')
      from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    on conflict do nothing
    returning 1)
  select jsonb_build_object('ok', true, 'n', (select count(*) from ins));
$$;
grant execute on function food_assembly_rows_add(jsonb) to service_role;

-- 한 식당의 결제 내역(최신순). 기본 40건 — 상세 시트에서 '더 보기'로 늘린다.
create or replace function food_assembly_detail(p_id uuid, p_limit integer default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ok', true,
    'stat', (select jsonb_build_object(
        'mps', a.mps, 'visits', a.visits, 'amount', a.amount,
        'parties', a.parties, 'y0', a.year_from, 'y1', a.year_to)
      from food_assembly a where a.place_id = p_id),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'mp', r.mp, 'party', r.party, 'date', r.spent_on,
        'amount', r.amount, 'memo', r.memo) order by r.spent_on desc nulls last, r.id desc)
      from (select * from food_assembly_rows where place_id = p_id
             order by spent_on desc nulls last, id desc
             limit least(coalesce(p_limit,40), 300)) r), '[]'::jsonb),
    'total', (select count(*) from food_assembly_rows where place_id = p_id));
$$;
grant execute on function food_assembly_detail(uuid,integer) to anon, authenticated;
