-- =========================================================
-- 갈라뉴스 완전 재편 — 홈 피드 집계 + 조회수 추적
--   섹션: 속보 / 실시간 베스트 / 주요 뉴스 / 카테고리별 / 많이 본 / 댓글 많은
-- =========================================================

-- ── 1) 조회수 컬럼 + 증가 RPC ─────────────────────────────
alter table public.galla_news add column if not exists view_count int not null default 0;
create index if not exists galla_news_view_idx on public.galla_news (view_count desc);
create index if not exists galla_news_pub_idx  on public.galla_news (published_at desc);
create index if not exists galla_news_cat_pub_idx on public.galla_news (category, published_at desc);

-- 기사 열 때 1 증가 (익명 OK — 프론트에서 세션당 1회로 스로틀)
create or replace function public.bump_news_view(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update galla_news set view_count = view_count + 1 where id = p_id;
$$;
grant execute on function public.bump_news_view(uuid) to anon, authenticated;

-- ── 2) 홈 피드 (한 번의 호출로 전 섹션) ───────────────────
-- 최근 3일치(썸네일 있는 것)만 후보로 삼아 참여수를 조인한다. 7천 행 전체가 아니라
-- 후보 집합에만 집계 → 빠르다. 반환은 섹션별 jsonb 배열 하나로 묶는다.
create or replace function public.galla_news_home()
returns jsonb
language sql stable security definer set search_path = public as $$
with base as (
  select n.id, n.title, n.category, n.hero_image, n.published_at,
         coalesce(n.source_count,0) source_count, n.view_count
  from galla_news n
  where n.status = 'published'
    and n.hero_image is not null and n.hero_image <> ''
    and n.published_at > now() - interval '3 days'
),
agg as (
  select b.*,
         coalesce(c.cnt,0) c_count,
         coalesce(r.likes,0) likes,
         coalesce(r.dislikes,0) dislikes
  from base b
  left join (
    select news_id, count(*) cnt from galla_news_comments group by news_id
  ) c on c.news_id = b.id
  left join (
    select news_id,
           count(*) filter (where value = 1)  likes,
           count(*) filter (where value = -1) dislikes
    from galla_news_reactions group by news_id
  ) r on r.news_id = b.id
),
scored as (
  -- 실시간 베스트 점수: 참여(좋아요+댓글*3+시간가중) + 보도량(source_count).
  -- 참여가 아직 적어 초반엔 source_count·최신순이 주도한다(합리적 '지금 뜨는' 대용).
  select *,
    (likes + c_count*3 + dislikes)
    + source_count * 0.6
    + greatest(0, 12 - extract(epoch from (now()-published_at))/3600) * 0.8   -- 12h 이내 최신 가산
    as hot
  from agg
),
row_j as (  -- 카드 1개를 json으로
  select id, jsonb_build_object(
    'id', id, 'title', title, 'category', category, 'hero_image', hero_image,
    'published_at', published_at, 'source_count', source_count,
    'view_count', view_count, 'cCount', c_count, 'likes', likes, 'dislikes', dislikes
  ) j, category, published_at, view_count, c_count, hot, source_count
  from scored
)
select jsonb_build_object(
  -- 속보: 최신 발행 스트립
  'breaking', (select coalesce(jsonb_agg(j order by published_at desc),'[]'::jsonb)
               from (select j, published_at from row_j order by published_at desc limit 10) t),
  -- 실시간 베스트: hot 상위
  'best', (select coalesce(jsonb_agg(j order by hot desc),'[]'::jsonb)
           from (select j, hot from row_j order by hot desc limit 10) t),
  -- 주요 뉴스: 보도 언론사 많은 순(=큰 사건)
  'major', (select coalesce(jsonb_agg(j order by source_count desc),'[]'::jsonb)
            from (select j, source_count from row_j order by source_count desc, published_at desc limit 6) t),
  -- 많이 본
  'mostViewed', (select coalesce(jsonb_agg(j order by view_count desc),'[]'::jsonb)
                 from (select j, view_count from row_j where view_count>0 order by view_count desc limit 10) t),
  -- 댓글 많은
  'mostCommented', (select coalesce(jsonb_agg(j order by c_count desc),'[]'::jsonb)
                    from (select j, c_count from row_j where c_count>0 order by c_count desc limit 10) t),
  -- 카테고리별 최신
  'byCategory', (
    select coalesce(jsonb_object_agg(category, arr),'{}'::jsonb) from (
      select category, jsonb_agg(j order by published_at desc) arr from (
        select category, j, published_at,
               row_number() over (partition by category order by published_at desc) rn
        from row_j
      ) x where rn <= 8 group by category
    ) y
  )
);
$$;
grant execute on function public.galla_news_home() to anon, authenticated;
