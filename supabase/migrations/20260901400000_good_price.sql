-- 착한가격업소 — 메뉴·가격의 '공짜' 공급원.
--
-- 왜 이걸 붙이나: 우리 가게 11,842곳 중 메뉴가 붙은 건 62곳뿐이었다. 유튜브 대본에서
-- LLM 으로 캐내는 방식은 영상 한 편에 메뉴 하나 나올까 말까고, 네이버는 메뉴를
-- 안 준다(지역검색 API 에 메뉴 필드가 없고, 플레이스 페이지 긁기는 금지다).
-- 행정안전부_착한가격업소 현황(데이터셋 3045247)은 전국 12,645행에 업소명·주소와
-- **메뉴·가격이 컬럼으로** 들어 있다. 분기 갱신, 다음 등록 2026-10-30.
--
-- 설계: 원본을 그대로 받아두는 표(food_goodprice)와, 우리 가게에 붙이는 일(link)을 나눈다.
--   ⓐ 12,645행을 통째로 food_places 에 밀어넣지 않는다 — 이미용업·목욕업이 섞여 있고,
--      좌표가 없어 한 건씩 네이버를 불러야 한다(오늘 한도를 다 태운 그 짓이다).
--   ⓑ 대신 **이미 있는 가게와 이름·시군구로 맞춰** 메뉴만 얹는다. API 호출 0.
--   ⓒ 못 맞춘 행은 버리지 않고 남긴다. 가게가 늘 때마다 link 를 다시 돌리면 붙는다.

create table if not exists food_goodprice (
  id         bigserial primary key,
  sido       text,
  sigun      text,
  cat        text,                                   -- 업종(한식/중식/이미용업 …)
  name       text not null,
  tel        text,
  address    text,
  menus      jsonb not null default '[]'::jsonb,     -- [{name, price}]
  place_id   uuid references food_places(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now()
);

-- 이름은 띄어쓰기·괄호가 판마다 달라진다("김밥 천국" / "김밥천국(본점)"). 정규화해서 비교한다.
create index if not exists food_goodprice_norm
  on food_goodprice (lower(regexp_replace(name, '[^가-힣a-zA-Z0-9]', '', 'g')));
create unique index if not exists food_goodprice_uk
  on food_goodprice (lower(regexp_replace(name, '[^가-힣a-zA-Z0-9]', '', 'g')),
                     coalesce(address, ''));
create index if not exists food_goodprice_unlinked on food_goodprice (id) where place_id is null;

alter table food_goodprice enable row level security;
drop policy if exists gp_read on food_goodprice;
create policy gp_read on food_goodprice for select using (true);
grant select on food_goodprice to anon, authenticated;

-- 가게에 '착한가격업소' 표식. 표 단위 select 권한이 이미 있으니 컬럼을 더해도 목록이 안 죽는다
-- (잠긴 표에 컬럼을 더하면 42501 로 목록이 통째로 백지가 된다 — 그 함정은 여기선 없다).
alter table food_places add column if not exists good_price boolean not null default false;
create index if not exists food_places_goodprice on food_places (good_price) where good_price;


-- ── 원본 적재 ────────────────────────────────────────────────────────────────
create or replace function food_goodprice_load(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare r jsonb; n int := 0; d int := 0;
begin
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    if length(btrim(coalesce(r->>'name',''))) = 0 then continue; end if;
    begin
      insert into food_goodprice(sido, sigun, cat, name, tel, address, menus)
      values (r->>'sido', r->>'sigun', r->>'cat', btrim(r->>'name'),
              nullif(btrim(coalesce(r->>'tel','')), ''),
              nullif(btrim(coalesce(r->>'address','')), ''),
              coalesce(r->'menus', '[]'::jsonb));
      n := n + 1;
    exception when unique_violation then
      -- 같은 업소가 다시 올라오면 메뉴만 최신으로 덮는다(분기마다 가격이 바뀐다)
      update food_goodprice
         set menus = coalesce(r->'menus', '[]'::jsonb),
             tel   = coalesce(nullif(btrim(coalesce(r->>'tel','')), ''), tel)
       where lower(regexp_replace(name, '[^가-힣a-zA-Z0-9]', '', 'g'))
             = lower(regexp_replace(btrim(r->>'name'), '[^가-힣a-zA-Z0-9]', '', 'g'))
         and coalesce(address,'') = coalesce(nullif(btrim(coalesce(r->>'address','')), ''), '');
      d := d + 1;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'new', n, 'updated', d);
end $$;


-- ── 우리 가게와 잇기(네이버 호출 0) ──────────────────────────────────────────
--
-- 이름이 같아도 딴 집일 수 있으니 **시군구가 같을 때만** 잇는다. 그리고 후보가 둘 이상이면
-- 잇지 않는다 — "김밥천국"처럼 흔한 이름을 아무 데나 붙이면 조용히 거짓말이 된다.
-- 못 이은 행은 place_id 를 비워 남겨둔다. 가게가 늘면 다시 돌려서 주우면 된다.
create or replace function food_goodprice_link(p_limit int default 4000)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  g record; pid uuid; cnt int; it jsonb;
  linked int := 0; ambig int := 0; miss int := 0; menus int := 0;
  gu text;
begin
  for g in
    select * from food_goodprice where place_id is null order by id limit greatest(p_limit, 1)
  loop
    -- '광진구' / '수원시 팔달구' 같은 값에서 마지막 토큰(구·군·시)만 쓴다
    gu := nullif(btrim(regexp_replace(coalesce(g.sigun,''), '^.*\s', '')), '');
    if gu is null then miss := miss + 1; continue; end if;

    select count(*), min(p.id) into cnt, pid
      from food_places p
     where lower(regexp_replace(p.name, '[^가-힣a-zA-Z0-9]', '', 'g'))
           = lower(regexp_replace(g.name, '[^가-힣a-zA-Z0-9]', '', 'g'))
       and coalesce(p.address,'') like '%' || gu || '%';

    if cnt = 0 then miss := miss + 1; continue; end if;
    if cnt > 1 then ambig := ambig + 1; continue; end if;

    update food_goodprice set place_id = pid, matched_at = now() where id = g.id;
    update food_places set good_price = true where id = pid and good_price = false;
    linked := linked + 1;

    for it in select * from jsonb_array_elements(g.menus) loop
      if length(btrim(coalesce(it->>'name',''))) = 0 then continue; end if;
      begin
        insert into food_menus(place_id, name, price, source)
        values (pid, btrim(it->>'name'),
                nullif(regexp_replace(coalesce(it->>'price',''), '[^0-9]', '', 'g'), '')::int,
                'goodprice');
        menus := menus + 1;
      exception when unique_violation then null;      -- 유튜브에서 이미 캔 메뉴면 둔다
      end;
    end loop;
  end loop;
  return jsonb_build_object('ok', true, 'linked', linked, 'menus', menus,
                            'ambiguous', ambig, 'unmatched', miss);
end $$;

revoke all on function food_goodprice_load(jsonb) from public, anon, authenticated;
revoke all on function food_goodprice_link(int)   from public, anon, authenticated;
grant execute on function food_goodprice_load(jsonb) to service_role;
grant execute on function food_goodprice_link(int)   to service_role;
