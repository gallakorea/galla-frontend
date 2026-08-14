-- =========================================================
-- 갈라리안 v5 (4/4) — 주간 루프 + 자동 운영
--
-- 문제: 등급이 유일한 피드백인데 위로 갈수록 한 레벨에 며칠씩 걸린다.
--       데일리 미션은 GP 만 주고 GI 는 안 줘서, '매일 올 이유'와 '등급'이
--       완전히 따로 놀았다.
--
-- 해결: 주간 미션이 GI 를 직접 준다(gi_bonus). 짧은 루프가 긴 사다리에 꽂힌다.
--       주간은 '넓게 하라'는 설계 의도를 반복해 말하는 자리이기도 하다 —
--       영역을 넘나드는 과제를 섞는다.
--
-- 자동 운영: 등급 캐시 갱신 크론, 시즌 자동 마감 크론.
--   (S1 이 8/1 에 끝났는데 아무도 안 닫아 방치돼 있었다 — 수동은 반드시 잊힌다)
-- =========================================================

create table if not exists public.weekly_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  key        text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, week_start, key)
);
alter table public.weekly_claims enable row level security;
drop policy if exists weekly_claims_own on public.weekly_claims;
create policy weekly_claims_own on public.weekly_claims for select using (user_id = auth.uid());

/* 주의 시작(월요일, KST) — 주간 경계의 단일 출처 */
create or replace function public._week_start()
returns date language sql stable as $$
  select date_trunc('week', (now() at time zone 'Asia/Seoul'))::date;
$$;

-- ---------------------------------------------------------
-- 주간 미션 — 진행도는 '이번 주 실제 활동'에서 실시간으로 센다.
-- (별도 카운터를 두면 반드시 어긋난다 — 원본을 세는 게 유일한 진실이다)
-- ---------------------------------------------------------
create or replace function public.weekly_missions()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); w date := _week_start(); wt timestamptz;
        v_dom jsonb; v_breadth int; v_out jsonb;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  wt := w::timestamptz;
  v_dom := gi_domains(u, wt);
  select count(*) into v_breadth from jsonb_each_text(v_dom) x where x.value::numeric > 0;

  select jsonb_agg(m order by m->>'key') into v_out from (
    select jsonb_build_object(
      'key', k, 'icon', ic, 'title', ti, 'goal', g, 'reward', rw,
      'progress', least(p, g),
      'done', p >= g,
      'claimed', exists(select 1 from weekly_claims c where c.user_id=u and c.week_start=w and c.key=k)
    ) m
    from (values
      ('w_comment', '💬', '이번 주 댓글 10개',        10,  60,
        (select count(*)::int from comments where author_id=u and status<>'deleted' and created_at>=wt)),
      ('w_vote',    '🗳️', '이번 주 찬반 투표 20회',   20,  40,
        (select count(*)::int from votes where user_id=u and created_at>=wt)),
      ('w_battle',  '⚔️', '이번 주 전투 액션 15회',   15,  70,
        (select count(*)::int from comment_actions where user_id=u and created_at>=wt)),
      ('w_create',  '🎬', '이번 주 콘텐츠 1개 발행',   1, 120,
        (select count(*)::int from posts where user_id=u and is_published and created_at>=wt)),
      ('w_predict', '🔮', '이번 주 예측 3회',          3,  60,
        (select count(*)::int from predict_bets where user_id=u and created_at>=wt)),
      ('w_arena',   '🎪', '이번 주 난장 참여 2회',     2,  60,
        (select count(*)::int from open_room_members where user_id=u and joined_at>=wt)),
      /* 🌈 넓게 하라 — 설계 의도를 과제로도 반복한다 */
      ('w_breadth', '🌈', '이번 주 3개 영역에서 활동',  3, 200, v_breadth)
    ) t(k, ic, ti, g, rw, p)
  ) z;

  return jsonb_build_object('ok', true, 'week_start', w,
    'ends_in_days', 7 - extract(dow from w + 6)::int + extract(dow from w)::int,
    'missions', coalesce(v_out, '[]'::jsonb));
end $$;

create or replace function public.claim_weekly(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare u uuid := auth.uid(); w date := _week_start(); s seasons;
        v jsonb; m jsonb; v_reward int;
begin
  if u is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  v := weekly_missions();
  select x into m from jsonb_array_elements(v->'missions') x where x->>'key' = p_key;
  if m is null then return jsonb_build_object('ok', false, 'reason', 'bad_key'); end if;
  if not (m->>'done')::boolean then
    return jsonb_build_object('ok', false, 'reason', 'not_done',
      'progress', m->>'progress', 'goal', m->>'goal'); end if;

  s := _current_season();
  v_reward := (m->>'reward')::int;

  /* 중복 수령은 PK 로 막는다 — 조회 후 삽입 사이의 경합을 코드로 막으려 하지 않는다 */
  begin
    insert into weekly_claims(user_id, week_start, key) values (u, w, p_key);
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'already_claimed');
  end;

  insert into gi_bonus(user_id, season_id, amount, reason)
  values (u, s.id, v_reward, 'weekly:'||p_key);

  perform refresh_my_gallian();
  return jsonb_build_object('ok', true, 'gi', v_reward, 'total_gi', gi_total(u, s.starts_at));
end $$;

-- ---------------------------------------------------------
-- 시즌 등급 리더보드 (GI 기준)
-- ⚠️ 기존 season_leaderboard 는 'GP 획득량' 기준이라 그대로 둔다 —
--    지표가 다르면 순위도 달라야 한다. 이름을 나눠 둘 다 살린다.
-- ---------------------------------------------------------
create or replace function public.gallian_leaderboard(p_limit int default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare s seasons;
begin
  s := _current_season();
  return jsonb_build_object('ok', true,
    'season', jsonb_build_object('num', s.num, 'name', s.name, 'ends_at', s.ends_at),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'rank', c.season_rank, 'user_id', c.user_id,
        'nickname', p.nickname, 'avatar_url', p.avatar_url,
        'gi', c.gi_season, 'level', c.level,
        'tier', (select name from season_tiers() t where t.tier_lv = c.tier_lv),
        'emoji', (select emoji from season_tiers() t where t.tier_lv = c.tier_lv)
      ) order by c.season_rank)
      from gallian_cache c
      left join users p on p.id = c.user_id   -- ⚠️ 닉네임·아바타는 users 에 있다(user_profiles 는 PII 잠금 테이블)
      where c.season_id = s.id and c.gi_season > 0 and c.season_rank <= p_limit
    ), '[]'::jsonb));
end $$;

grant execute on function public.weekly_missions()        to authenticated;
grant execute on function public.claim_weekly(text)       to authenticated;
grant execute on function public.gallian_leaderboard(int) to anon, authenticated;

-- ---------------------------------------------------------
-- 자동 운영
-- ---------------------------------------------------------
/* 시즌 자동 마감 — 만료됐는데 열려 있으면 정산하고 다음 시즌을 연다.
   ⚠️ season_resolve 는 _is_admin() 가드가 걸려 있어 크론이 직접 못 부른다.
      크론용 래퍼를 따로 둔다(이 저장소에서 SECURITY DEFINER + current_user
      가드로 한 번 데인 적이 있다 — 가드를 우회하는 게 아니라 별도 진입점이다). */
create or replace function public.season_rollover_job()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s seasons; r record; v_title text;
begin
  s := _current_season();
  if s.id is null or now() < s.ends_at then
    return jsonb_build_object('ok', true, 'skipped', 'not_due');
  end if;

  -- 명예의 전당: 시즌 GI 상위 3명 (등급이 GI 기준이니 정산도 GI 기준이어야 한다)
  for r in
    select c.user_id, c.season_rank rk from gallian_cache c
     where c.season_id = s.id and c.gi_season > 0 and c.season_rank <= 3
     order by c.season_rank
  loop
    v_title := case r.rk when 1 then '🥇 S'||s.num||' 판의 주인'
                         when 2 then '🥈 S'||s.num||' 판몰이'
                         else '🥉 S'||s.num||' 판잡이' end;
    insert into hall_of_fame(season_num, season_name, rank, user_id, title)
      values (s.num, s.name, r.rk, r.user_id, v_title);
    insert into user_titles(user_id, title_key, custom_name)
      values (r.user_id, 'season_'||s.num||'_'||r.rk, v_title)
      on conflict (user_id, title_key) do nothing;
  end loop;

  update seasons set status='closed' where id = s.id;
  insert into seasons(num, name, starts_at, ends_at, status)
    values (s.num+1, 'S'||(s.num+1), s.ends_at, s.ends_at + interval '1 month', 'active');

  perform refresh_gallian_cache();
  return jsonb_build_object('ok', true, 'closed', s.num, 'opened', s.num+1);
end $$;

select cron.schedule('gallian_cache_refresh', '*/20 * * * *',
                     $$select public.refresh_gallian_cache();$$)
 where not exists (select 1 from cron.job where jobname='gallian_cache_refresh');

select cron.schedule('season_rollover', '5 15 * * *',   -- 매일 00:05 KST
                     $$select public.season_rollover_job();$$)
 where not exists (select 1 from cron.job where jobname='season_rollover');

comment on function public.weekly_missions() is
  '주간 미션 — 보상이 GP 가 아니라 GI 다. 짧은 루프를 등급 사다리에 직접 꽂는다.';
