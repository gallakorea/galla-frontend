-- 🕵️ 성향/포지션 익명 대량 역추적 차단(26.9.22) — anon(비로그인)에서 user_id 컬럼만 가림
-- ⚠️ 컬럼 회수는 테이블級 grant가 있으면 무효 → 테이블 SELECT 걷고 user_id 뺀 컬럼만 재부여(PII 잠금과 같은 패턴).
-- authenticated 무변경(프론트·집계·본인읽기·INSERT RETURNING 영향 0). 비로그인 배지/프로필유형은 널로 degrade.
do $$
declare r text; cols text;
begin
  foreach r in array array['votes','predict_bets','market_positions','travel_votes','remixes'] loop
    select string_agg(quote_ident(column_name), ',') into cols
      from information_schema.columns
      where table_schema='public' and table_name=r and column_name <> 'user_id';
    execute format('revoke select on public.%I from anon', r);
    execute format('grant select (%s) on public.%I to anon', cols, r);
  end loop;
end $$;
