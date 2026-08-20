/* ══ 등급: 이름 정리 + 칸 늘리기 ═══════════════════════════════
   1) '판벌이/판잡이/판몰이' → '단골/고수/터줏대감'
      이유 ①: 이제 '판'이 영역 이름이다(숏판·롱판). "숏판 · 판몰이"처럼 겹친다.
      이유 ②: 셋이 너무 비슷해 어느 게 위인지 안 읽혔다.
   2) 판별 등급을 5칸 → 13칸(이름당 III/II/I). 외울 단어는 그대로 5개다.
      이유: 꼭대기가 700 GI 라 가장 활발한 계정이 20일에 357 — 한 달이면 천장이고
      그 위로는 3,000을 찍어도 배지가 같았다. 시즌 내내 올라갈 게 없어진다.
      ⚠️ tier_lv(0/10/20/30/40)은 그대로 두고 div(3/2/1)를 따로 둔다.
         tier_lv 을 쪼개면 혜택표(PERKS)·season_tiers 조인이 전부 깨진다.
   3) '갈라 대장군'(lv50) 행 삭제 — 왕 위에 또 왕은 없다. 40에서 다음은 왕이다. */

drop function if exists public.domain_tiers();
create or replace function public.domain_tiers()
returns table(tier_lv int, div int, key text, name text, label text,
              emoji text, sub text, floor_gi int)
language sql immutable as $$
  select v.tier_lv, v.div, v.key, v.name,
         v.name || case when v.div > 0 then ' ' || repeat('I', v.div) else '' end,
         v.emoji, v.sub, v.floor_gi
    from (values
      (0,  0, 'spark',     '눈팅러',   '🌱', '이 판은 아직 구경만',        0),
      (10, 3, 'breaker',   '참견러',   '🔥', '못 참고 한마디 얹기 시작',    30),
      (10, 2, 'breaker',   '참견러',   '🔥', '못 참고 한마디 얹기 시작',    60),
      (10, 1, 'breaker',   '참견러',   '🔥', '못 참고 한마디 얹기 시작',   100),
      (20, 3, 'vanguard',  '단골',     '🎪', '이 판에 자주 온다',         150),
      (20, 2, 'vanguard',  '단골',     '🎪', '이 판에 자주 온다',         220),
      (20, 1, 'vanguard',  '단골',     '🎪', '이 판에 자주 온다',         300),
      (30, 3, 'authority', '고수',     '🎯', '이 판을 읽고 끌고 간다',     400),
      (30, 2, 'authority', '고수',     '🎯', '이 판을 읽고 끌고 간다',     520),
      (30, 1, 'authority', '고수',     '🎯', '이 판을 읽고 끌고 간다',     660),
      (40, 3, 'dominion',  '터줏대감', '🌪️', '이 판의 주인. 다음은 왕좌',  820),
      (40, 2, 'dominion',  '터줏대감', '🌪️', '이 판의 주인. 다음은 왕좌', 1000),
      (40, 1, 'dominion',  '터줏대감', '🌪️', '이 판의 주인. 다음은 왕좌', 1200)
    ) v(tier_lv, div, key, name, emoji, sub, floor_gi);
$$;
grant execute on function public.domain_tiers() to authenticated, anon;

/* 혜택 기준은 여전히 '이름 단위'(0/10/20/30/40) — 잘게 쪼갠 건 표시용이다. */
create or replace function public.domain_tier_lv(p_gi numeric)
returns int language sql immutable as $$
  select coalesce((select max(t.tier_lv) from domain_tiers() t
                    where coalesce(p_gi,0) >= t.floor_gi), 0);
$$;
grant execute on function public.domain_tier_lv(numeric) to authenticated, anon;

/* 통합 등급표도 같은 이름으로 맞춘다 — 여기만 옛 이름이면 헤더와 줄이 어긋난다.
   lv50(갈라 대장군)은 뺀다: 40 다음은 등급이 아니라 왕이다. */
drop function if exists public.season_tiers();
create or replace function public.season_tiers()
returns table(tier_lv int, key text, name text, sub text, emoji text,
              top_pct numeric, floor_gi int)
language sql immutable as $$
  values
    (0,  'spark',     '🌱 눈팅러',   '일단 스크롤만 내리는 구경꾼', '🌱', 100.0::numeric, 0),
    (10, 'breaker',   '🔥 참견러',   '못 참고 한마디 얹는 사람',   '🔥',  60.0::numeric, 150),
    (20, 'vanguard',  '🎪 단골',     '이 판에 자주 오는 사람',     '🎪',  30.0::numeric, 600),
    (30, 'authority', '🎯 고수',     '판을 읽고 끌고 가는 사람',   '🎯',  10.0::numeric, 1800),
    (40, 'dominion',  '🌪️ 터줏대감', '판의 주인. 다음은 왕좌',     '🌪️',   2.0::numeric, 3500)
$$;
grant execute on function public.season_tiers() to authenticated, anon;

do $chk$
declare n int; v jsonb;
begin
  select count(*) into n from domain_tiers();
  if n <> 13 then raise exception '판별 등급이 13칸이 아니다: %', n; end if;
  select count(distinct name) into n from domain_tiers();
  if n <> 5 then raise exception '이름이 5개가 아니다: %', n; end if;
  /* 경계: 이름 단위 lv 는 그대로여야 혜택표가 안 깨진다 */
  if domain_tier_lv(0) <> 0 or domain_tier_lv(30) <> 10 or domain_tier_lv(149) <> 10
     or domain_tier_lv(150) <> 20 or domain_tier_lv(400) <> 30 or domain_tier_lv(820) <> 40
     or domain_tier_lv(99999) <> 40 then
    raise exception '이름 단위 경계 어긋남';
  end if;
  if (select count(*) from season_tiers() where tier_lv = 50) <> 0 then
    raise exception '갈라 대장군이 남아 있다'; end if;
  if (select count(*) from season_tiers() s
       where not exists (select 1 from domain_tiers() d where d.tier_lv = s.tier_lv)) > 0 then
    raise exception '통합/판별 등급 lv 집합이 어긋난다'; end if;
  perform refresh_gallian_cache();
  select gallian_of((select user_id from gallian_cache order by gi_season desc limit 1)) into v;
  if (v->'tier'->>'name') is null then raise exception '헤더 등급 이름이 비었다: %', v->'tier'; end if;
  raise notice '등급 13칸 OK — 대표등급 %', v->'tier'->>'name';
end $chk$;
