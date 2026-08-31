-- 맛집 메뉴판 (2026-08-31)
--
-- 앞서 "메뉴는 못 한다"고 잘라 말했는데 과했다. 정확히는 이렇다:
--   ❌ 완전한 메뉴 DB를 자동으로 채우는 건 불가 — 유튜브 메타데이터에 메뉴가 다 있지 않고,
--      네이버 플레이스의 메뉴를 긁는 건 저쪽 DB를 복제하는 것이라 안 한다.
--   ✅ 두 경로는 된다: (1) 유저 제보, (2) 영상 제목·설명에 가격이 적힌 경우 AI 추출.
--      먹방 채널은 "○○ 2천원" 식으로 본문에 가격을 적는 일이 잦다(김사원세끼 실측).
--
-- 그래서 출처를 남긴다 — 유저가 적은 값과 AI가 뽑은 값을 구분해야 신뢰도가 산다.

create table if not exists public.food_menus (
  id           bigserial primary key,
  place_id     uuid not null references public.food_places(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 60),
  price        int  check (price is null or (price >= 0 and price <= 10000000)),
  source       text not null default 'user' check (source in ('user','yt')),
  submitted_by uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);
-- 같은 집에 같은 메뉴명이 두 번 들어가지 않게(정규화해서 비교)
create unique index if not exists food_menus_uk
  on public.food_menus (place_id, lower(regexp_replace(name,'[[:space:]]','','g')));
create index if not exists food_menus_place on public.food_menus (place_id, id);

alter table public.food_menus enable row level security;

/* 유저 제보 — 한 번에 여러 줄. 도배 방지로 집당 40줄까지. */
create or replace function public.food_menu_add(p_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); it jsonb; n int := 0; v_cnt int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if not exists (select 1 from food_places where id=p_id and status='live') then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;
  select count(*) into v_cnt from food_menus where place_id = p_id;
  if v_cnt >= 40 then return jsonb_build_object('ok',false,'reason','full'); end if;

  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    exit when v_cnt + n >= 40;
    if length(btrim(coalesce(it->>'name',''))) = 0 then continue; end if;
    begin
      insert into food_menus(place_id, name, price, source, submitted_by)
      values (p_id, btrim(it->>'name'),
              nullif(regexp_replace(coalesce(it->>'price',''), '[^0-9]', '', 'g'),'')::int,
              'user', v_uid);
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('ok',true,'added',n);
end $fn$;
grant execute on function public.food_menu_add(uuid,jsonb) to authenticated;

/* 수집기 전용 — AI 가 영상에서 뽑은 가격 */
create or replace function public.food_menu_ingest(p_id uuid, p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    if length(btrim(coalesce(it->>'name',''))) = 0 then continue; end if;
    begin
      insert into food_menus(place_id, name, price, source)
      values (p_id, btrim(it->>'name'),
              nullif(regexp_replace(coalesce(it->>'price',''), '[^0-9]', '', 'g'),'')::int, 'yt');
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('ok',true,'added',n);
end $fn$;
revoke all on function public.food_menu_ingest(uuid,jsonb) from public, anon, authenticated;

/* 상세에 메뉴를 실어 보낸다 — 시트가 열릴 때 한 번에 오도록 */
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
    'menus', coalesce((select jsonb_agg(jsonb_build_object(
        'name', m.name, 'price', m.price, 'source', m.source) order by m.id)
      from food_menus m where m.place_id = p.id), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$fn$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;

select 'ok' as done;
