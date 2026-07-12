-- 📰 관련 보도 자동 매칭 — 내부 news_articles_raw(RSS 21만건)에서 이슈 키워드로 검색
-- 성능 핵심: 3글자+ 키워드로 trgm 인덱스 후보검색(빠름), 점수는 전체 키워드로 산정
create extension if not exists pg_trgm;
create index if not exists idx_news_raw_title_trgm on news_articles_raw using gin (title gin_trgm_ops);
create index if not exists idx_news_raw_pub on news_articles_raw (published_at desc);

create or replace function public.issue_related_news(p_issue_id bigint, p_limit int default 6)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_title text; v_all text[]; v_idx text[]; v jsonb;
  v_or text := ''; v_score text := ''; k text;
  c_stop text[] := array['논란','관련','대한','우리','오늘','속보','단독','종합','영상','사진',
                         '이번','대해','위해','있다','없다','문제','상황','네티즌','기자','뉴스'];
begin
  select title into v_title from issues where id = p_issue_id;
  if v_title is null then return jsonb_build_object('ok', false, 'reason', 'no_issue'); end if;

  select array_agg(w) into v_all from (
    select distinct w from (
      select unnest(regexp_split_to_array(regexp_replace(v_title, '[^가-힣a-zA-Z0-9 ]', ' ', 'g'), '\s+')) w
    ) t
    where length(w) >= 2 and not (w = any(c_stop))
    limit 8
  ) x;
  if v_all is null or array_length(v_all,1) is null then
    return jsonb_build_object('ok', true, 'rows', '[]'::jsonb);
  end if;

  -- 인덱스 활용 키워드(3글자+); 없으면 전체로 폴백
  select array_agg(w) into v_idx from unnest(v_all) w where length(w) >= 3;
  if v_idx is null then v_idx := v_all; end if;

  foreach k in array v_idx loop
    v_or := v_or || case when v_or = '' then '' else ' OR ' end || 'title ILIKE ' || quote_literal('%'||k||'%');
  end loop;
  foreach k in array v_all loop
    v_score := v_score || case when v_score = '' then '' else ' + ' end || '(title ILIKE ' || quote_literal('%'||k||'%') || ')::int';
  end loop;

  execute format($q$
    with cand as (
      select title, source, url, published_at, (%s) score
      from news_articles_raw
      where published_at > now() - interval '45 days' and (%s)
      order by published_at desc limit 500
    ), dedup as (
      select distinct on (regexp_replace(title,'\s+','','g')) title, source, url, published_at, score
      from cand order by regexp_replace(title,'\s+','','g'), score desc, published_at desc
    )
    select coalesce(jsonb_agg(jsonb_build_object(
             'title', title, 'source', source, 'url', url, 'published_at', published_at)), '[]'::jsonb)
    from (select * from dedup order by score desc, published_at desc limit %s) z
  $q$, v_score, v_or, p_limit) into v;

  return jsonb_build_object('ok', true, 'rows', v, 'keywords', to_jsonb(v_all));
end $$;

grant execute on function public.issue_related_news(bigint, int) to anon, authenticated;
