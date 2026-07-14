-- ============================================================
-- 개인정보 최고등급 보안: PII 컬럼 공개조회 차단 + 본인조회 RPC + 인구통계 서버집계
-- 문제: users(phone,email,birth_date,gender,region)·user_profiles(real_name,ci,di,phone,birth_date…)가
--       anon/authenticated에게 전 컬럼 SELECT 허용 → 누구나 타인 개인정보·본인인증정보 조회 가능.
-- 해결: 컬럼 단위 권한으로 공개 표시용 컬럼만 노출, PII는 본인/관리자(SECURITY DEFINER)만.
-- ============================================================

-- ── users: 공개 조회는 안전 컬럼만 ──
revoke select on public.users from anon, authenticated;
grant  select (id, nickname, bio, level, avatar_url, exp, created_at) on public.users to anon, authenticated;

-- users 쓰기: anon 전면 차단, authenticated는 본인 표시정보만(레벨/exp/이메일/성별 등 조작 방지)
revoke insert, update, delete on public.users from anon;
revoke insert, update, delete on public.users from authenticated;
grant  update (nickname, bio, avatar_url, phone) on public.users to authenticated; -- 행 제한은 RLS(본인)

-- ── user_profiles: 공개 조회는 안전 컬럼만(real_name/ci/di/phone/birth_date 등 전면 차단) ──
revoke select on public.user_profiles from anon, authenticated;
grant  select (user_id, nickname, level, anonymous, gp, role, admin_flag, created_at) on public.user_profiles to anon, authenticated;
revoke insert, update, delete on public.user_profiles from anon, authenticated; -- 트리거/RPC(SECURITY DEFINER)만

-- ── 본인 계정정보 조회 RPC(설정·계정수정용) ──
create or replace function public.get_my_account()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'nickname', nickname, 'bio', bio, 'avatar_url', avatar_url,
    'phone', phone, 'email', email, 'region', region,
    'gender', gender, 'birth_date', birth_date
  ) from users where id = auth.uid();
$$;
grant execute on function public.get_my_account() to authenticated;

-- ── 이슈 투표자 인구통계: 서버에서 집계만 반환(원시 PII 미노출, 소표본 억제) ──
-- 정책: 참여자 30명 미만 잠금, 버킷 5명 미만 숨김(개인식별 방지) — 기존 프론트 규칙과 동일.
create or replace function public.issue_demographics(p_issue bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  with vd as (
    select v.type,
      case when u.gender in ('male','남성') then '남성'
           when u.gender in ('female','여성') then '여성' end as g,
      case when u.birth_date is null then null
           when date_part('year', age(u.birth_date)) < 20 then '10대'
           when date_part('year', age(u.birth_date)) < 30 then '20대'
           when date_part('year', age(u.birth_date)) < 40 then '30대'
           when date_part('year', age(u.birth_date)) < 50 then '40대'
           when date_part('year', age(u.birth_date)) < 60 then '50대'
           else '60대+' end as a,
      nullif(u.region,'') as r
    from votes v join users u on u.id = v.user_id
    where v.issue_id = p_issue
  )
  select case when (select count(*) from vd) < 30
    then jsonb_build_object('total', (select count(*) from vd), 'locked', true)
    else jsonb_build_object(
      'total', (select count(*) from vd),
      'gender', (select case when coalesce(sum(c),0) >= 5 then jsonb_build_object(
                   'male',   round(coalesce(sum(c) filter (where g='남성'),0) * 100.0 / sum(c)),
                   'female', round(coalesce(sum(c) filter (where g='여성'),0) * 100.0 / sum(c))) end
                 from (select g, count(*) c from vd where g is not null group by g) s),
      'age', (select coalesce(jsonb_agg(jsonb_build_object('label',a,'name',a,'percent',round(c*100.0/t)) order by a), '[]'::jsonb)
              from (select a, count(*) c, sum(count(*)) over () t from vd where a is not null group by a) s where c >= 5),
      'region', (select coalesce(jsonb_agg(jsonb_build_object('label',r,'name',r,'percent',round(c*100.0/t)) order by c desc), '[]'::jsonb)
              from (select r, count(*) c, sum(count(*)) over () t from vd where r is not null group by r) s where c >= 5),
      'gender_vote', (select coalesce(jsonb_agg(jsonb_build_object('label',g,'pro',round(pro*100.0/(pro+con)),'con',round(con*100.0/(pro+con)))), '[]'::jsonb)
              from (select g, count(*) filter (where type='pro') pro, count(*) filter (where type='con') con from vd where g is not null group by g) s where (pro+con) >= 5),
      'age_vote', (select coalesce(jsonb_agg(jsonb_build_object('label',a,'pro',round(pro*100.0/(pro+con)),'con',round(con*100.0/(pro+con))) order by a), '[]'::jsonb)
              from (select a, count(*) filter (where type='pro') pro, count(*) filter (where type='con') con from vd where a is not null group by a) s where (pro+con) >= 5),
      'region_vote', (select coalesce(jsonb_agg(jsonb_build_object('label',r,'pro',round(pro*100.0/(pro+con)),'con',round(con*100.0/(pro+con)))), '[]'::jsonb)
              from (select r, count(*) filter (where type='pro') pro, count(*) filter (where type='con') con from vd where r is not null group by r) s where (pro+con) >= 5)
    ) end;
$$;
grant execute on function public.issue_demographics(bigint) to anon, authenticated;

-- ── 내부 파이프라인 테이블 RLS 잠금(프론트 미사용, 엣지함수=service_role은 우회) ──
do $$
declare t text;
begin
  foreach t in array array[
    'community_trend_keywords','raw_trends','clusters','trending_keywords',
    'issue_arguments','issue_articles','trend_scores','issue_trends',
    'ai_news_jobs','external_trends','community_hot','community_trends',
    'realtime_keywords','news_issue_articles','final_news_feed'
  ] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=t and c.relkind='r') then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
