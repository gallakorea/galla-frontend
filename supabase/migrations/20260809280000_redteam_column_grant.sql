-- 🧪 문제은행: 컬럼 잠금 테이블의 SELECT 권한 누락 회귀 검사 (2026-08-09)
--
--  실제로 터진 사고를 케이스로 박는다. comments/plaza_comments/galla_news_comments/market_comments는
--  PII를 가리려고 **컬럼 단위**로만 SELECT를 준다. 여기에 컬럼을 추가하면 새 컬럼엔 권한이 없고,
--  프론트가 그 컬럼을 select에 넣는 순간 42501로 **댓글 목록 전체가 빈 화면**이 된다.
--  화면은 에러도 안 띄우고 그냥 비어 보여서, 눈으로 보기 전엔 아무도 모른다.
--
--  ⚠️ 이 검사는 '허용 목록'을 쓴다. user_id·PII는 일부러 안 주는 것이므로 제외한다.
--     새로 일부러 가리는 컬럼이 생기면 여기 목록에 추가해라 — 그게 '의도'라는 기록이 된다.

insert into public.redteam_cases (code, category, title, severity, script, assertions, origin, active)
values (
  'schema-column-select-grant',
  'schema',
  '컬럼 잠금 테이블에 SELECT 권한 없는 컬럼이 없어야 한다 (댓글 백지화 방지)',
  5,
  '["안녕"]'::jsonb,
  $$[{"t":"sql_true","q":"select count(*) = 0 as ok from (select c.table_name, col.column_name from (select c.table_name from information_schema.column_privileges c where c.table_schema='public' and c.grantee='anon' and c.privilege_type='SELECT' and not exists (select 1 from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.table_name and g.grantee='anon' and g.privilege_type='SELECT') group by 1) c join information_schema.columns col on col.table_schema='public' and col.table_name=c.table_name where not exists (select 1 from information_schema.column_privileges p where p.table_schema='public' and p.table_name=c.table_name and p.column_name=col.column_name and p.grantee='anon' and p.privilege_type='SELECT') and not (c.table_name in ('users','user_profiles') or col.column_name in ('user_id','email','phone','birth_date','birth_year','gender','region','real_name','ci','di','deleted_at'))) x"}]$$::jsonb,
  'incident-20260809',
  true
)
on conflict (code) do update set
  assertions = excluded.assertions,
  title      = excluded.title,
  severity   = excluded.severity,
  active     = true;
