-- 여행지 유형 분류 (2026-09-02)
--
-- 왜: '어디 갈래' 풀 302곳에 방콕 노점·시장·역이 섞여 있는데 걸러낼 수가 없었다.
--     category 는 46%가 비고 나머지는 국가유산 종목명('보물'·'사적')이라 여행 유형과 무관하다.
--     이름만으로는 절과 국수집을 못 가른다.
-- ⚠️ category 는 **그대로 둔다** — 출처가 준 라벨이고 국가유산 종목 정보를 잃으면 안 된다.
--    새 축(genre)을 따로 만든다.
--
-- 이 축이 여는 것 셋:
--   ① 어디 갈래 풀에서 식당·숙소·교통을 뺀다
--   ② 둘러보기 필터(자연만 / 유적만)
--   ③ 설계 때 못 만든 '도시 ↔ 자연' 성향축(outdoorsy)

alter table travel_places add column if not exists genre text;
create index if not exists travel_places_genre_idx on travel_places (genre) where genre is not null;

create table if not exists travel_genre_defs (
  code      text primary key,
  label     text not null,
  emoji     text,
  sort      int  not null default 100,
  in_pool   boolean not null default true,   -- '가고 싶은 곳'으로 물어도 되는 유형인가
  outdoorsy int  not null default 0          -- +1 자연 / 0 중립 / -1 도시
);
alter table travel_genre_defs enable row level security;
drop policy if exists travel_genre_defs_read on travel_genre_defs;
create policy travel_genre_defs_read on travel_genre_defs for select using (true);

insert into travel_genre_defs (code, label, emoji, sort, in_pool, outdoorsy) values
  ('nature',   '자연',          '🏞', 10, true,   1),
  ('heritage', '유적·궁',       '🏯', 20, true,   0),
  ('temple',   '사찰·성당',     '⛩', 30, true,   0),
  ('museum',   '박물관·미술관', '🖼', 40, true,  -1),
  ('landmark', '전망·랜드마크', '🗼', 50, true,  -1),
  ('theme',    '테마파크·체험', '🎡', 60, true,  -1),
  ('spa',      '온천·휴양',     '♨️', 70, true,   1),
  ('market',   '시장·거리',     '🛍', 80, true,  -1),
  /* 아래 셋은 '가고 싶은 곳'을 묻는 대상이 아니다 —
     식당·숙소는 그 자체가 목적지가 아니고, 교통은 이태원역 승강장이다. */
  ('food',     '식당·카페',     '🍜', 90, false, -1),
  ('stay',     '숙소',          '🛏', 95, false,  0),
  ('transit',  '교통',          '🚉', 98, false,  0),
  ('etc',      '기타',          '📍', 99, false,  0)
on conflict (code) do update
  set label = excluded.label, emoji = excluded.emoji, sort = excluded.sort,
      in_pool = excluded.in_pool, outdoorsy = excluded.outdoorsy;

grant select on travel_genre_defs to anon, authenticated;

/* 분류가 필요한 곳을 준다. 쓸모 순서대로 — 사진이 있고 한글 이름인 곳이 먼저다
   (그게 화면에 실제로 나오는 곳이다). */
create or replace function travel_places_to_classify(p_limit int default 40)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select p.id, p.name, p.name_en, p.country, coalesce(p.city, p.admin1) area,
           p.category, left(coalesce(p.summary, ''), 180) summary,
           coalesce((select string_agg(s.video_title, ' / ')
                       from (select video_title from travel_place_sources
                              where place_id = p.id and video_title is not null
                              limit 3) s), '') videos
      from travel_places p
     where p.status in ('live','pending')
       and p.genre is null
       and p.name is not null
     order by (p.photo is not null and p.name ~ '[가-힣]') desc,
              (p.scale = 'spot') desc,
              p.updated_at desc
     limit greatest(least(p_limit, 60), 1)
  ) x;
$$;

create or replace function travel_genre_save(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it jsonb; n int := 0; g text;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    g := nullif(btrim(it->>'genre'), '');
    /* 모델이 없는 코드를 만들어 낼 수 있다 — 정의에 있는 것만 받는다. */
    if g is null or not exists (select 1 from travel_genre_defs d where d.code = g) then
      g := 'etc';
    end if;
    update travel_places set genre = g, updated_at = now()
     where id = (it->>'id')::uuid and genre is null;
    if found then n := n + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'saved', n);
end $$;

revoke all on function travel_places_to_classify(int) from public, anon, authenticated;
revoke all on function travel_genre_save(jsonb) from public, anon, authenticated;
