-- =========================================================
-- 피드 랭킹 — hot_score 계산 엔진
--
-- 실측한 문제: hot_score 컬럼은 있는데 아무도 계산하지 않는다(53행 전부 0).
--   읽는 코드만 있고(galla-friend, jarvis) 쓰는 코드가 없다.
--   그래서 메인 피드는 created_at 순 80개가 전부다 —
--   좋은 콘텐츠가 위로 갈 방법이 없었다.
--
-- ── 설계 ────────────────────────────────────────────────
--   hot = (1 + 참여도)^0.8 / (나이_시간 + 2)^1.4  × 보너스
--
--   ① 참여도에 0.8 승 압축
--      한 콘텐츠가 참여를 독식해도 점수가 무한히 커지지 않는다.
--      (등급 GI 에서 쓴 것과 같은 이유 — 독주를 구조로 누른다)
--
--   ② 나이에 1.4 승 감쇠
--      HN/Reddit 계열. 참여가 0이면 식이 1/(age+2)^1.4 로 줄어
--      '그냥 최신순'이 된다 — 데이터가 희박한 지금도 자연스럽게 동작하고,
--      쌓이면 알아서 순위가 갈린다.
--
--   ③ 접전 보너스 (이슈 전용, 갈라 고유)
--      찬반이 팽팽할수록 가산. 50:50 이 갈라에서 가장 재미있는 상태다.
--      표가 10개 미만이면 적용하지 않는다(초반 우연을 증폭하지 않기 위해).
--
--   ④ 신규 노출 보장
--      3시간 미만 콘텐츠에 가산. 이게 없으면 새 글이 순위에 진입할 기회를
--      얻지 못하고 묻힌다(콜드스타트).
--
--   ⑤ 조회수는 log 로 눌러 낮은 가중
--      새로고침으로 부풀리기 쉬운 지표라 신뢰도가 낮다.
--
-- ⚠️ 컬럼 추가 전 확인함 — issues/posts/plaza_posts 는 테이블 단위 grant 라
--    컬럼 grant 가 따로 필요 없다. (컬럼 단위 잠금 테이블이었다면 새 컬럼에
--    grant select 를 빠뜨려 목록 전체가 42501 로 죽는다)
-- =========================================================

alter table public.posts       add column if not exists hot_score numeric not null default 0;
alter table public.plaza_posts add column if not exists hot_score numeric not null default 0;

create index if not exists issues_hot_idx      on public.issues      (hot_score desc, created_at desc);
create index if not exists posts_hot_idx       on public.posts       (hot_score desc, created_at desc);
create index if not exists plaza_posts_hot_idx on public.plaza_posts (hot_score desc, created_at desc);

/* 공통 시간 감쇠 — 나이(시간) → 분모 */
create or replace function public._hot_decay(p_created timestamptz)
returns numeric language sql immutable as $$
  select power(greatest(extract(epoch from (now() - p_created)) / 3600.0, 0) + 2, 1.4);
$$;

/* 신규 노출 보장 — 3시간 미만이면 1.5배. 없으면 새 글이 순위에 못 들어온다. */
create or replace function public._hot_fresh(p_created timestamptz)
returns numeric language sql immutable as $$
  select case when now() - p_created < interval '3 hours' then 1.5 else 1.0 end;
$$;

-- ---------------------------------------------------------
-- 전체 재계산. 최근 p_days 일 것만 —
-- 오래된 글은 감쇠로 이미 0에 수렴해 순위에 영향이 없다.
-- ---------------------------------------------------------
create or replace function public.compute_hot_scores(p_days int default 30)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_i int; v_p int; v_z int; t0 timestamptz := clock_timestamp();
begin
  /* 🗳 이슈 — 참전(투표)이 가장 무겁다. 갈라의 본질이 '어느 편이냐'다. */
  with eng as (
    select i.id,
           (coalesce(i.pro_count,0) + coalesce(i.con_count,0)) * 5
         + coalesce(i.like_count,0) * 3
         + coalesce((select count(*) from comments c
                      where c.issue_id = i.id and c.status <> 'deleted'), 0) * 4
         + coalesce((select count(*) from comment_actions a
                      join comments c on c.id = a.comment_id
                     where c.issue_id = i.id), 0) * 2
         + log(2, 1 + coalesce(i.view_count,0)) * 2                   as e,
           coalesce(i.pro_count,0) as pro, coalesce(i.con_count,0) as con,
           i.created_at
      from issues i
     where i.created_at > now() - (p_days || ' days')::interval
       and coalesce(i.status,'normal') <> 'deleted'
  )
  update issues x set hot_score = round(
      power(1 + greatest(eng.e, 0), 0.8) / _hot_decay(eng.created_at)
      /* ⚔️ 접전 보너스 — 팽팽할수록 위로. 표 10개 미만이면 적용 안 함. */
      * case when eng.pro + eng.con >= 10
             then 1 + 0.4 * (1 - abs(eng.pro - eng.con)::numeric / (eng.pro + eng.con))
             else 1 end
      * _hot_fresh(eng.created_at) * 1000, 4)
    from eng where x.id = eng.id;
  get diagnostics v_i = row_count;

  /* 🎬 갈라리 — 콘텐츠는 댓글이 좋아요보다 무겁다(더 큰 참여) */
  with eng as (
    select p.id,
           coalesce(p.like_count,0) * 3 + coalesce(p.comment_count,0) * 5
         + log(2, 1 + coalesce(p.view_count,0)) * 2 as e, p.created_at
      from posts p
     where p.created_at > now() - (p_days || ' days')::interval
       and p.is_published and coalesce(p.moderation_status,'ok') <> 'blocked'
  )
  update posts x set hot_score = round(
      power(1 + greatest(eng.e,0), 0.8) / _hot_decay(eng.created_at)
      * _hot_fresh(eng.created_at) * 1000, 4)
    from eng where x.id = eng.id;
  get diagnostics v_p = row_count;

  /* 🎪 광장 — 추천에서 비추천을 뺀다. 여긴 찬반이 아니라 품질 신호다. */
  with eng as (
    select z.id,
           greatest(coalesce(z.up_count,0) - coalesce(z.down_count,0), 0) * 3
         + coalesce((select count(*) from plaza_comments c where c.post_id = z.id), 0) * 2
         + log(2, 1 + coalesce(z.view_count,0)) * 2 as e, z.created_at
      from plaza_posts z
     where z.created_at > now() - (p_days || ' days')::interval
  )
  update plaza_posts x set hot_score = round(
      power(1 + greatest(eng.e,0), 0.8) / _hot_decay(eng.created_at)
      * _hot_fresh(eng.created_at) * 1000, 4)
    from eng where x.id = eng.id;
  get diagnostics v_z = row_count;

  return jsonb_build_object('ok', true, 'issues', v_i, 'posts', v_p, 'plaza', v_z,
    'ms', round(extract(epoch from (clock_timestamp()-t0))*1000));
end $$;

select cron.schedule('hot_scores', '*/10 * * * *', $$select public.compute_hot_scores();$$)
 where not exists (select 1 from cron.job where jobname='hot_scores');

grant execute on function public.compute_hot_scores(int) to service_role;

comment on function public.compute_hot_scores(int) is
  '피드 랭킹 — (1+참여도)^0.8 / (나이+2)^1.4 × 접전보너스 × 신규보너스. 10분마다 크론.';
