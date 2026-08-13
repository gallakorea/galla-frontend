-- =========================================================
-- 갈라리안 등급 v2 — 성과 가중 + 누적 레벨
--
-- 고친 것 (사장님 제보: "레벨 1인데 갈라 선동가?", "너무 쉽게 오른다")
--
-- ① 레벨이 등급마다 Lv.1 로 리셋됐다 → 상위 등급인데 초보처럼 보였다.
--    레벨을 '누적'으로 바꾼다. 갈라 선동가 · Lv.40 처럼 숫자와 칭호가 같은 방향을 가리킨다.
--    (레벨 오르는 재미는 유지 — 초반은 몇 분마다, 위로 갈수록 드물게)
--
-- ② 점수가 '쓴 개수'만 셌다 → 혼자 많이 쓰면 계속 올랐다.
--    실측: 사장님 이슈 53개인데 총 참전 46명(이슈당 0.87명)인데도 상위 2번째 등급.
--    → 발의 기본점을 50→20 으로 낮추고, '받은 참전·좋아요·반응'에 가중을 옮긴다.
--       아무도 안 본 이슈 20점 vs 100명 참전한 이슈 320점 (16배)
--
-- ③ 서버(_user_gi)와 클라(gallian.js)가 각각 다르게 계산했다 — 값이 어긋난다.
--    → 서버를 단일 출처로. 클라는 gallian_of() 를 부른다.
--
-- 등급 임계값(0/150/500/1500/4500/15000)은 그대로 두고 10레벨 밴드의 경계로 쓴다.
-- =========================================================

/* 레벨 → 필요 누적 GI.
   밴드(10레벨) 경계는 기존 등급 임계값. 밴드 안은 등비로 채워 촘촘히 오른다.
   50레벨 이후엔 10레벨마다 약 3.16배 — 최상위가 진짜 훈장이 되도록 계속 가팔라진다. */
create or replace function public.gi_for_level(p_lv integer)
returns bigint language sql immutable as $$
  /* 밴드 경계 = 기존 등급 임계값. 밴드 안은 등비(첫 밴드만 2차)로 채운다.
     ⚠️ 첫 밴드는 1→10 이라 폭이 9다. 'lo.lv+10' 으로 조인하면 안 맞아 Lv.2~9 가 전부 null 이 됐다.
        lead() 로 다음 경계를 잡아 밴드 폭에 상관없이 동작하게 한다. */
  with b as (
    select lv, gi, lead(lv) over (order by lv) nlv, lead(gi) over (order by lv) ngi
      from (values (1,0::numeric),(10,150),(20,500),(30,1500),(40,4500),(50,15000)) v(lv,gi)
  )
  select case
    when p_lv <= 1 then 0
    when p_lv >= 50 then round(15000 * power(3.1623, (p_lv - 50)::numeric / 10))
    else (select case when b.gi = 0
                      then round(b.ngi * power((p_lv - b.lv)::numeric / (b.nlv - b.lv), 2))
                      else round(b.gi * power(b.ngi / b.gi, (p_lv - b.lv)::numeric / (b.nlv - b.lv)))
                 end
            from b where b.nlv is not null and p_lv >= b.lv and p_lv < b.nlv limit 1)
  end::bigint;
$$;

create or replace function public.level_of_gi(p_gi bigint)
returns integer language sql immutable as $$
  select coalesce((select max(lv) from generate_series(1, 200) lv
                    where public.gi_for_level(lv) <= greatest(p_gi, 0)), 1);
$$;

-- ---------------------------------------------------------
-- 성과 가중 GI (단일 출처)
-- ---------------------------------------------------------
create or replace function public._user_gi(p_user uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select (
    /* 활동 — '얼마나 썼나'보다 '얼마나 움직였나' */
      coalesce((select count(*) * 20                                            -- 발의 기본(50→20)
                     + sum(coalesce(pro_count,0) + coalesce(con_count,0)) * 3   -- 받은 참전
                     + sum(coalesce(like_count,0)) * 2                          -- 받은 좋아요
                  from issues where user_id = p_user), 0)
    + coalesce((select count(*) * 3                                             -- 댓글 기본(10→3)
                     + sum(coalesce(attack_count,0) + coalesce(defense_count,0)
                         + coalesce(support_count,0)) * 2                       -- 받은 전투 반응
                  from comments where author_id = p_user and status <> 'deleted'), 0)
    + coalesce((select count(*) * 5 from comment_likes cl                       -- 받은 댓글 좋아요
                 join comments c on c.id = cl.comment_id
                where c.author_id = p_user), 0)
    + coalesce((select count(*) * 2 from votes where user_id = p_user), 0)      -- 참여의 최소 단위
    + coalesce((select count(*) * 8 + sum(coalesce(up_count,0)) * 3
                  from plaza_posts where user_id = p_user), 0)
    + coalesce((select count(*) * 3 from plaza_comments where author_id = p_user), 0)

    /* 전투 — 액션량 가중을 낮추고(8→3) 전공(성과)이 주가 되게 */
    + coalesce((select count(*) * 3 from comment_actions where user_id = p_user), 0)
    + coalesce((select count(*) filter (where kind='ko')     * 30
                     + count(*) filter (where kind='assist') * 10
                     + count(*) filter (where kind='guard')  * 12
                  from battle_merits where user_id = p_user), 0)

    /* 예측 — 거래량(10→3)보다 적중에 가중 */
    + coalesce((select count(*) * 3 + count(*) filter (where won) * 25
                  from predict_bets where user_id = p_user), 0)
  )::bigint;
$$;

-- ---------------------------------------------------------
-- 화면용 — 등급·레벨·내역을 한 번에 (클라가 10번 조회하던 것을 대체)
-- ---------------------------------------------------------
create or replace function public.gallian_of(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := coalesce(p_user, auth.uid());
        v_gi bigint; v_lv int; v_next bigint; v_cur bigint;
        v_tier text; v_sub text; v_emoji text; v_tier_lv int;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  v_gi := _user_gi(u);
  v_lv := level_of_gi(v_gi);
  v_cur := gi_for_level(v_lv);
  v_next := gi_for_level(v_lv + 1);

  -- 10레벨마다 승급. 임계값은 기존 그대로.
  v_tier_lv := least(50, (v_lv / 10) * 10);
  select t.name, t.sub, t.emoji into v_tier, v_sub, v_emoji from (values
    (0,  '눈팅 뉴비',   '일단 스크롤만 내리는 관망러',       '🌱'),
    (10, '발끈러',      '못 참고 첫 댓글을 단 각성러',       '🔥'),
    (20, '키보드 전사', '손가락이 근질근질한 참전러',        '⌨️'),
    (30, '여론 논객',   '판을 읽고 흔드는 입담꾼',           '🎤'),
    (40, '갈라 선동가', '댓글창을 쥐락펴락하는 여론몰이',    '🌪️'),
    (50, '갈라 대장군', '전장을 평정한 전설의 논객',         '👑')
  ) t(lv, name, sub, emoji) where t.lv = case when v_lv < 10 then 0 else v_tier_lv end;

  return jsonb_build_object(
    'ok', true, 'gi', v_gi, 'level', v_lv,
    'tier', jsonb_build_object('name', v_tier, 'sub', v_sub, 'emoji', v_emoji),
    'level_gi_from', v_cur, 'level_gi_to', v_next,
    'to_next', greatest(0, v_next - v_gi),
    'progress', case when v_next > v_cur
                     then least(100, round((v_gi - v_cur)::numeric / (v_next - v_cur) * 100))
                     else 100 end,
    -- 다음 승급(10의 배수 레벨)까지
    'next_tier_level', case when v_lv < 50 then ((v_lv / 10) + 1) * 10 end,
    'next_tier_gi', case when v_lv < 50 then gi_for_level(((v_lv / 10) + 1) * 10) end
  );
end $$;

grant execute on function public.gi_for_level(integer) to anon, authenticated;
grant execute on function public.level_of_gi(bigint)   to anon, authenticated;
grant execute on function public.gallian_of(uuid)      to authenticated;

comment on function public._user_gi(uuid) is
  '갈라 지수 — 성과 가중(받은 참전·좋아요·반응·전공·적중). 등급의 단일 출처. 클라는 gallian_of() 를 쓴다.';

-- ---------------------------------------------------------
-- 배지용 배치 조회도 같은 공식을 쓰게 한다
--
-- gi_of_users 가 자기만의 공식(구식 개수 가중)을 들고 있었다 — GI 사본이 셋이었다.
-- 실측: 같은 유저가 _user_gi 2,226 vs gi_of_users 4,722.
-- 배지(피드·프로필)와 등급 페이지가 서로 다른 등급을 보여주고 있었던 셈이다.
-- ⚠️ 앞으로 GI 공식은 _user_gi 한 곳에서만 바꾼다.
-- ---------------------------------------------------------
create or replace function public.gi_of_users(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(u::text, public._user_gi(u)), '{}'::jsonb)
    from unnest(p_uids) u;
$$;
