-- =========================================================
-- 갈라리안 등급 v3 — "여론 논객도 높은 거 아냐? 너무 쉽게 올라간 것 같은데"
--
-- v2 에서 성과 가중으로 옮겼지만 사장님 GI 2,226 중 1,060(48%)이 여전히
-- '이슈를 53개 썼다'는 기본점이었다. 개수가 아직 절반을 쥐고 있었다.
--
-- 레버가 둘인데 하나만 당겼던 셈이다:
--   ① 기본점(쓴 개수) 비중  → 더 낮춘다
--   ② 등급 임계값 자체      → 올린다  ← "너무 쉽게 오른다"는 이쪽이었다
--
-- 임계값은 실유저 분포로 못 정한다(아직 실사용자가 사실상 혼자다).
-- 그래서 '각 등급이 어떤 사람이어야 하는가'를 먼저 정하고 거기서 역산했다:
--
--   눈팅 뉴비   0        가입하고 투표 몇 번
--   발끈러      100      일주일 눈팅하다 댓글 10개, 좋아요 좀 받음
--   키보드 전사 1,000    한 달 매일 옴. 댓글 100개·전투 참여·이슈도 몇 개
--   여론 논객   6,500    반응을 얻기 시작. 올린 이슈에 수백 명 참전
--   갈라 선동가 30,000   판을 만드는 사람. 이슈마다 천 단위 참전
--   갈라 대장군 130,000  전체에서 손꼽히는 몇 명
--
-- 검산: 사장님 계정(이슈 53·참전 46·댓글 92 = 혼자 열심히 쓴 상태)
--       → 1,205 GI → Lv.20 키보드 전사. '활동은 많지만 아직 반응은 없다'는
--       실제 상태와 일치한다. (v1 선동가 → v2 여론논객 → v3 키보드전사)
--
-- 오르는 맛은 유지했다: Lv.2 = 1 GI(투표 한 번), Lv.5 = 20, Lv.10 = 100.
-- 초반은 몇 분마다 오르고 위로 갈수록 급격히 가팔라진다.
-- =========================================================

/* 밴드(10레벨) 경계 = 새 등급 임계값. 밴드 안은 등비로 채운다.
   ⚠️ 첫 밴드는 1→10 이라 폭이 9다 — lead() 로 잡아야 Lv.2~9 가 null 이 안 된다(v2 버그). */
create or replace function public.gi_for_level(p_lv integer)
returns bigint language sql immutable as $$
  with b as (
    select lv, gi, lead(lv) over (order by lv) nlv, lead(gi) over (order by lv) ngi
      from (values (1,0::numeric),(10,100),(20,1000),(30,6500),(40,30000),(50,130000)) v(lv,gi)
  )
  select case
    when p_lv <= 1 then 0
    when p_lv >= 50 then round(130000 * power(3.1623, (p_lv - 50)::numeric / 10))
    else (select case when b.gi = 0
                      then round(b.ngi * power((p_lv - b.lv)::numeric / (b.nlv - b.lv), 2))
                      else round(b.gi * power(b.ngi / b.gi, (p_lv - b.lv)::numeric / (b.nlv - b.lv)))
                 end
            from b where b.nlv is not null and p_lv >= b.lv and p_lv < b.nlv limit 1)
  end::bigint;
$$;

-- ---------------------------------------------------------
-- 성과 가중 GI — 기본점을 최소로, 반응이 주가 되게
--
-- v2 대비: 발의 20→3, 댓글 3→1, 광장글 8→2, 전투액션 3→2
--          받은 참전 3→5, 받은 좋아요 2→4, 받은 반응 2→4, 댓글좋아요 5→8
--
-- 아무도 안 본 이슈 3점  vs  100명 참전한 이슈 503점 → 168배.
-- '많이 쓴 사람'이 아니라 '판을 움직인 사람'만 올라간다.
-- ---------------------------------------------------------
create or replace function public._user_gi(p_user uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select (
      coalesce((select count(*) * 3                                              -- 발의 기본(20→3)
                     + sum(coalesce(pro_count,0) + coalesce(con_count,0)) * 5    -- 받은 참전(3→5)
                     + sum(coalesce(like_count,0)) * 4                           -- 받은 좋아요(2→4)
                  from issues where user_id = p_user), 0)
    + coalesce((select count(*) * 1                                              -- 댓글 기본(3→1)
                     + sum(coalesce(attack_count,0) + coalesce(defense_count,0)
                         + coalesce(support_count,0)) * 4                        -- 받은 전투 반응(2→4)
                  from comments where author_id = p_user and status <> 'deleted'), 0)
    + coalesce((select count(*) * 8 from comment_likes cl                        -- 받은 댓글 좋아요(5→8)
                 join comments c on c.id = cl.comment_id
                where c.author_id = p_user), 0)
    + coalesce((select count(*) * 2 from votes where user_id = p_user), 0)       -- 참여의 최소 단위
    + coalesce((select count(*) * 2 + sum(coalesce(up_count,0)) * 3
                  from plaza_posts where user_id = p_user), 0)
    + coalesce((select count(*) * 1 from plaza_comments where author_id = p_user), 0)

    /* 전투 — 액션량은 최소, 전공(성과)이 주 */
    + coalesce((select count(*) * 2 from comment_actions where user_id = p_user), 0)
    + coalesce((select count(*) filter (where kind='ko')     * 30
                     + count(*) filter (where kind='assist') * 10
                     + count(*) filter (where kind='guard')  * 12
                  from battle_merits where user_id = p_user), 0)

    /* 예측 — 거래량보다 적중 */
    + coalesce((select count(*) * 2 + count(*) filter (where won) * 25
                  from predict_bets where user_id = p_user), 0)
  )::bigint;
$$;

comment on function public._user_gi(uuid) is
  '갈라 지수 v3 — 기본점 최소·성과(받은 참전·좋아요·반응·전공·적중) 중심. 등급의 단일 출처. 클라는 gallian_of().';
