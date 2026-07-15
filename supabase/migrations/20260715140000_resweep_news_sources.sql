-- =========================================================
-- 기존 갈라뉴스 관련기사/썸네일 정리
--   AI 클러스터링이 무관 기사(김수현 기사에 음바페 등)를 소스로 묶은 것을
--   '기사 제목과 소스 제목의 단어 겹침'으로 걸러 제거하고 히어로를 재선정.
-- =========================================================

-- 제목 토큰(2글자 이상)
create or replace function public.news_tokens(t text)
returns text[] language sql immutable as $$
  select array(
    select w from unnest(
      regexp_split_to_array(regexp_replace(coalesce(t,''), '[^가-힣A-Za-z0-9]', ' ', 'g'), '\s+')
    ) w where length(w) >= 2
  )
$$;

-- 최근 p_days 발행분 재정리
create or replace function public.resweep_news(p_days int default 3)
returns jsonb language plpgsql as $$
declare removed int; updated int;
begin
  -- 소스별 제목 겹침 점수
  create temp table _sov on commit drop as
  select s.id sid, s.news_id, s.thumbnail_url,
    cardinality(array(
      select unnest(news_tokens(n.title)) intersect select unnest(news_tokens(s.title))
    )) ov
  from galla_news n
  join galla_news_sources s on s.news_id = n.id
  where n.status = 'published' and n.published_at > now() - (p_days || ' days')::interval;

  create temp table _rank on commit drop as
  select *, row_number() over (
    partition by news_id
    order by ov desc, (thumbnail_url is not null and thumbnail_url <> '') desc, sid
  ) rn from _sov;

  -- 겹침 0인 무관 소스 제거(단, 뉴스당 최상위 1개는 보존)
  delete from galla_news_sources d using _rank r
  where d.id = r.sid and r.ov = 0 and r.rn > 1;
  get diagnostics removed = row_count;

  -- 남은(관련) 소스로 히어로·source_count 재산정
  with rem as (
    select s.news_id,
      (array_agg(s.thumbnail_url order by
        cardinality(array(select unnest(news_tokens(n.title)) intersect select unnest(news_tokens(s.title)))) desc)
        filter (where s.thumbnail_url is not null and s.thumbnail_url <> ''))[1] hero,
      count(*) cnt
    from galla_news_sources s
    join galla_news n on n.id = s.news_id
    where n.status = 'published' and n.published_at > now() - (p_days || ' days')::interval
    group by s.news_id
  )
  update galla_news g
  set hero_image = coalesce(rem.hero, g.hero_image), source_count = rem.cnt
  from rem where g.id = rem.news_id;
  get diagnostics updated = row_count;

  return jsonb_build_object('removed', removed, 'updated', updated);
end $$;
