-- =========================================================
-- 갈라리안 등급 v4 — 종합 콘텐츠 플랫폼 전면 반영
--
-- 사장님: "이슈만 반영되는 구조인데 우리는 숏판·롱판·예측·광장 등 활동이 다양하다.
--          댓글 전투·난장은 전혀 고려 안 됐다. AI 창작도 반영돼야 한다.
--          '여론'이란 표현도 손봐야 한다. 종합 콘텐츠 플랫폼 지향을 반영하라."
--
-- 실측한 구멍 — 아래는 전부 0점이었다:
--   갈라리 숏판/롱판(posts) · 난장 오픈챗/라이브(open_rooms) · 일기토(duel_*)
--   갈라뉴스 댓글·리액션 · AI 창작(my_stickers) · 콘텐츠 도달(content_daily_views)
--   영상 좋아요·댓글(video_*)
-- 콘텐츠 플랫폼을 지향하는데 콘텐츠를 올리면 등급이 1도 안 올랐다.
-- 등급명이 '여론 논객'이었던 건 우연이 아니라 구조가 그것만 쟀기 때문이다.
--
-- ── 구조 3가지 변경 ──────────────────────────────────────
--
-- ① 축 통합: 갈라리안 / Lv / 창작자 3개 사다리 → 사다리 1개 + 주특기 배지.
--    창작자 트랙은 '창작' 영역으로 흡수한다(별도 사다리 폐지).
--
-- ② 5영역 합산: 여론 · 논전 · 창작 · 예측 · 난장.
--    어느 길로 와도 오른다 — 종합 플랫폼이면 등급도 종합이어야 한다.
--
-- ③ 영역별 수확 감소(지수 0.70): 한 영역만 파면 점수가 꺾인다.
--    ⚠️ 이게 핵심이다. 가중치만 만지면 '한 영역 독주'는 계속 재발한다
--       (v2·v3 에서 두 번 겪었다). 구조로 막는다.
--       같은 노력 4,000: 몰빵 3,987 vs 다섯 영역 6,461 → 다양성 1.62배
--       한 영역 안에서는 노력 4배당 점수 2.64배로 체감이 준다.
--
-- 임계값은 인물상에서 역산 — 실유저가 아직 사실상 혼자라 분포로는 못 정한다.
--   눈팅러 0 · 참견러 600 · 판벌이 2,800 · 판잡이 11,500 · 판몰이 35,000 · 대장군 105,000
--
-- 검산: 사장님 계정 → 3,179 GI 판벌이(3/6).
--       영역별 여론 846 · 논전 1,182 · 창작 0 · 예측 111 · 난장 1,040.
--       '창작 0' 이 화면에 그대로 보인다 — 뭘 안 하고 있는지가 등급에 드러난다.
-- =========================================================

/* 영역 원점수 → GI 기여분. 지수 0.70 으로 압축한다. */
create or replace function public.gi_domain(p_raw numeric)
returns numeric language sql immutable as $$
  select round(12 * power(greatest(coalesce(p_raw,0), 0), 0.70), 2);
$$;

-- ---------------------------------------------------------
-- 영역별 원점수 — 여기가 '무엇을 세는가'의 단일 출처
-- ---------------------------------------------------------
create or replace function public.gi_domains(p_user uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with
  /* 🗣 여론 — 이슈 발의와 그 이슈가 실제로 사람을 모았는가 */
  opinion as (
    select coalesce((select count(*) * 3
                          + sum(coalesce(pro_count,0) + coalesce(con_count,0)) * 5
                          + sum(coalesce(like_count,0)) * 4
                       from issues where user_id = p_user), 0)
         + coalesce((select count(*) * 2 from votes where user_id = p_user), 0)
         + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                      where user_id = p_user and kind = 'issue'), 0) as raw
  ),
  /* ⚔️ 논전 — 댓글 전투·일기토. 액션량보다 전공과 받은 반응 */
  debate as (
    select coalesce((select count(*) * 1
                          + sum(coalesce(attack_count,0) + coalesce(defense_count,0)
                              + coalesce(support_count,0)) * 4
                       from comments where author_id = p_user and status <> 'deleted'), 0)
         + coalesce((select count(*) * 8 from comment_likes cl
                      join comments c on c.id = cl.comment_id
                     where c.author_id = p_user), 0)
         + coalesce((select count(*) * 2 from comment_actions where user_id = p_user), 0)
         + coalesce((select count(*) filter (where kind='ko')     * 30
                          + count(*) filter (where kind='assist') * 10
                          + count(*) filter (where kind='guard')  * 12
                       from battle_merits where user_id = p_user), 0)
         + coalesce((select count(*) * 2 + count(*) filter (where is_finisher) * 10
                       from duel_messages where user_id = p_user), 0)
         + coalesce((select count(*) * 1 from duel_cheers where user_id = p_user), 0) as raw
  ),
  /* 🎬 창작 — 갈라리 숏판/롱판·AI 창작·도달. 옛 '창작자 등급'이 여기로 흡수됐다 */
  creation as (
    select coalesce((select count(*) * 5
                          + sum(coalesce(like_count,0)) * 4
                          + sum(coalesce(comment_count,0)) * 6
                       from posts where user_id = p_user and is_published), 0)
         + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                      where user_id = p_user and kind = 'post'), 0)
         + coalesce((select count(*) * 4 from video_likes vl
                      join posts p on p.id::text = vl.video_id::text
                     where p.user_id = p_user), 0)
         + coalesce((select count(*) * 3 from my_stickers where user_id = p_user), 0)
         + coalesce((select sum(calls) * 2 from ai_user_usage
                     where user_id = p_user
                       and fn ~ 'creat|thumb|video|sticker|image|craft'), 0) as raw
  ),
  /* 🔮 예측 — 거래량보다 적중과 연승 */
  predict as (
    select coalesce((select count(*) * 2 + count(*) filter (where won) * 25
                       from predict_bets where user_id = p_user), 0)
         + coalesce((select coalesce(best,0) * 5 from predict_streaks where user_id = p_user), 0)
         + coalesce((select count(*) * 1 from market_comments where user_id = p_user), 0) as raw
  ),
  /* 🎪 난장 — 광장·오픈챗·라이브·갈라뉴스. 사람을 모으고 자리를 여는 활동 */
  arena as (
    select coalesce((select count(*) * 2 + sum(coalesce(up_count,0)) * 3
                       from plaza_posts where user_id = p_user), 0)
         + coalesce((select sum(views_delta) * 0.02 from content_daily_views
                      where user_id = p_user and kind = 'plaza'), 0)
         + coalesce((select count(*) * 1 from plaza_comments where author_id = p_user), 0)
         /* 방을 여는 건 참여보다 무겁다. 라이브 진행은 그중에서도 가장 무겁다. */
         + coalesce((select count(*) filter (where kind = 'live') * 30
                          + count(*) filter (where kind <> 'live') * 10
                          + sum(coalesce(member_count,0)) * 2
                       from open_rooms where owner_id = p_user), 0)
         + coalesce((select count(*) * 2 from open_room_members where user_id = p_user), 0)
         + coalesce((select count(*) * 1 from galla_news_comments where author_id = p_user), 0)
         + coalesce((select count(*) * 1 from galla_news_reactions where user_id = p_user), 0) as raw
  )
  select jsonb_build_object(
    'opinion',  (select raw from opinion),
    'debate',   (select raw from debate),
    'creation', (select raw from creation),
    'predict',  (select raw from predict),
    'arena',    (select raw from arena));
$$;

-- ---------------------------------------------------------
-- GI = 영역별 압축점수의 합 (단일 출처)
-- ---------------------------------------------------------
create or replace function public._user_gi(p_user uuid)
returns bigint language sql stable security definer set search_path to 'public' as $$
  select coalesce((select round(sum(public.gi_domain(v.value::numeric)))
                     from jsonb_each(public.gi_domains(p_user)) v), 0)::bigint;
$$;

/* 레벨 곡선 — 밴드(10레벨) 경계 = 새 등급 임계값.
   ⚠️ 첫 밴드는 1→10 이라 폭이 9다. lead() 로 잡아야 Lv.2~9 가 null 이 안 된다(v2 버그). */
create or replace function public.gi_for_level(p_lv integer)
returns bigint language sql immutable as $$
  with b as (
    select lv, gi, lead(lv) over (order by lv) nlv, lead(gi) over (order by lv) ngi
      from (values (1,0::numeric),(10,600),(20,2800),(30,11500),(40,35000),(50,105000)) v(lv,gi)
  )
  select case
    when p_lv <= 1 then 0
    when p_lv >= 50 then round(105000 * power(3.1623, (p_lv - 50)::numeric / 10))
    else (select case when b.gi = 0
                      then round(b.ngi * power((p_lv - b.lv)::numeric / (b.nlv - b.lv), 2))
                      else round(b.gi * power(b.ngi / b.gi, (p_lv - b.lv)::numeric / (b.nlv - b.lv)))
                 end
            from b where b.nlv is not null and p_lv >= b.lv and p_lv < b.nlv limit 1)
  end::bigint;
$$;

-- ---------------------------------------------------------
-- 화면용 — 등급 · 레벨 · 주특기 · 영역별 비중을 한 번에
-- ---------------------------------------------------------
create or replace function public.gallian_of(p_user uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := coalesce(p_user, auth.uid());
        v_dom jsonb; v_pts jsonb; v_gi bigint; v_lv int; v_next bigint; v_cur bigint;
        v_tier text; v_sub text; v_emoji text; v_tier_lv int;
        v_top text; v_top_pct numeric; v_spec text; v_spec_emoji text;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;

  v_dom := gi_domains(u);
  select jsonb_object_agg(k, gi_domain(v::numeric)) into v_pts from jsonb_each_text(v_dom) t(k,v);
  select coalesce(sum(value::numeric), 0) into v_gi from jsonb_each_text(v_pts) t2(key,value);
  v_gi := round(v_gi);

  v_lv   := level_of_gi(v_gi);
  v_cur  := gi_for_level(v_lv);
  v_next := gi_for_level(v_lv + 1);

  -- 10레벨마다 승급
  v_tier_lv := least(50, (v_lv / 10) * 10);
  select t.name, t.sub, t.emoji into v_tier, v_sub, v_emoji from (values
    (0,  '눈팅러',      '일단 스크롤만 내리는 구경꾼',        '🌱'),
    (10, '참견러',      '못 참고 한마디 얹는 사람',           '🔥'),
    (20, '판벌이',      '슬슬 판을 벌이기 시작한 사람',       '🎪'),
    (30, '판잡이',      '판을 읽고 끌고 가는 사람',           '🎯'),
    (40, '판몰이',      '판 자체를 몰고 가는 사람',           '🌪️'),
    (50, '갈라 대장군', '판을 평정한 전설',                   '👑')
  ) t(lv, name, sub, emoji) where t.lv = case when v_lv < 10 then 0 else v_tier_lv end;

  /* 🎨 주특기 — 별도 사다리가 아니라 '무엇으로 올라왔는가'의 색.
     한 영역이 40% 이상이면 그 색, 아니면 만능형. */
  select key, case when v_gi > 0 then round(value::numeric / v_gi * 100) else 0 end
    into v_top, v_top_pct
    from jsonb_each_text(v_pts) order by value::numeric desc limit 1;

  if v_gi = 0 or v_top_pct < 40 then
    v_spec := '만능형'; v_spec_emoji := '🎲';
  else
    select s.name, s.emoji into v_spec, v_spec_emoji from (values
      ('opinion','여론형','🗣'), ('debate','논전형','⚔️'), ('creation','창작형','🎬'),
      ('predict','예측형','🔮'), ('arena','난장형','🎪')
    ) s(k, name, emoji) where s.k = v_top;
  end if;

  return jsonb_build_object(
    'ok', true, 'gi', v_gi, 'level', v_lv,
    'tier',    jsonb_build_object('name', v_tier, 'sub', v_sub, 'emoji', v_emoji),
    'specialty', jsonb_build_object('key', case when v_top_pct < 40 then 'all' else v_top end,
                                    'name', v_spec, 'emoji', v_spec_emoji, 'pct', v_top_pct),
    'domains', v_pts,
    'level_gi_from', v_cur, 'level_gi_to', v_next,
    'to_next', greatest(0, v_next - v_gi),
    'progress', case when v_next > v_cur
                     then least(100, round((v_gi - v_cur)::numeric / (v_next - v_cur) * 100))
                     else 100 end,
    'next_tier_level', case when v_lv < 50 then ((v_lv / 10) + 1) * 10 end,
    'next_tier_gi',    case when v_lv < 50 then gi_for_level(((v_lv / 10) + 1) * 10) end
  );
end $$;

grant execute on function public.gi_domain(numeric)  to anon, authenticated;
grant execute on function public.gi_domains(uuid)    to authenticated;
grant execute on function public.gi_for_level(integer) to anon, authenticated;
grant execute on function public.gallian_of(uuid)    to authenticated;

comment on function public.gi_domains(uuid) is
  '영역별(여론·논전·창작·예측·난장) 원점수. 무엇을 세는가의 단일 출처 — 활동이 늘면 여기만 고친다.';
comment on function public._user_gi(uuid) is
  '갈라 지수 v4 — 영역별 원점수를 지수 0.70 으로 압축해 합산. 한 영역 독주를 구조로 막는다.';
