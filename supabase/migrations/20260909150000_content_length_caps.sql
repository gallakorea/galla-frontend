-- 본문 길이 서버 상한 — QA 0909.
-- comments(1000)·plaza_posts(300) 말고는 **서버 제한이 없었다**. 클라이언트만 maxlength 로 막고 있어서
-- 요청을 직접 만들면 2만 자 제목이 그대로 저장됐다(실측: issues.title·posts.title 20,000자 통과).
-- 긴 제목은 저장만 되는 게 아니라 **모든 피드 카드·검색 결과·공유 카드에서 레이아웃을 무너뜨린다**.
-- 기존 데이터 최장은 issues.title 56 / posts.title 102 / description 611 이라 아래 값은 넉넉하다.
do $$
declare r record;
begin
  for r in
    select * from (values
      ('issues','title',300),('issues','one_line',300),('issues','description',10000),
      ('posts','title',300),('posts','caption',5000),
      ('galla_news_comments','content',1000),
      ('market_comments','content',1000),
      ('post_comments','body',1000),
      ('dm_messages','body',5000)
    ) as t(tbl,col,lim)
  loop
    if to_regclass('public.'||r.tbl) is null then continue; end if;
    if not exists (select 1 from information_schema.columns
                    where table_schema='public' and table_name=r.tbl and column_name=r.col) then continue; end if;
    execute format('alter table public.%I drop constraint if exists %I', r.tbl, r.tbl||'_'||r.col||'_len');
    execute format('alter table public.%I add constraint %I check (char_length(%I) <= %s)',
                   r.tbl, r.tbl||'_'||r.col||'_len', r.col, r.lim);
  end loop;
end $$;
