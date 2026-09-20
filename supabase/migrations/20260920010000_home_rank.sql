-- 🏠 홈 피드 랭커(26.9.20 사장님: 「유튜브·인스타처럼 사람들이 좋아하는 걸로. 이슈 빼고」)
--   이슈는 지금 방식(시간순+관심 주제) 그대로 두고, 나머지(숏판·롱판·광장·갈라뉴스·예측·핫튜브)를
--   한 줄로 세워 점수로 정렬한다. 점수 = 반응 × 신선도 × 내 취향.
--
--   반응(engagement): content_signal_daily(노출·열람·완주·참여) 최근 7일. 노출이 적으면(<10) 신호 대신
--      콘텐츠 자체 지표(좋아요·댓글·조회·판돈·급상승 속도)로 채운다 — 오픈 전이라 신호가 아직 적다.
--   신선도: 종류마다 반감기가 다르다(뉴스 10h · 핫튜브 8h · 숏판 30h · 광장 40h · 예측 마감 임박 가산).
--   내 취향: 팔로우한 사람 ×1.7, 관심 주제(my_feed_affinity) ×최대 1.6, 내가 많이 여는 종류 ×최대 1.3,
--      최근 3일 안에 이미 본 것 ×0.55(열어 본 것 ×0.3), 내 글 ×0.6.
--   ⚠️ 종류마다 지표 단위가 달라 그대로 더하면 한 종류가 상단을 독점한다 → 종류 안에서 0~1 로 정규화한 뒤 섞는다.
create or replace function public.home_rank(p_limit integer default 60)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_aff jsonb; v_cat jsonb; v_out jsonb;
begin
  v_aff := public.my_feed_affinity();
  v_cat := coalesce(v_aff->'categories', '{}'::jsonb);

  with sig as (   -- 최근 7일 반응(모든 사용자 합계)
    select kind, content_id,
           sum(imps)::numeric imps, sum(opens)::numeric opens,
           sum(engages)::numeric eng, sum(completes)::numeric comp, sum(watch_cnt)::numeric wc
      from content_signal_daily where day > current_date - 7 group by 1, 2
  ),
  mine as (       -- 내가 최근 3일에 본 것 / 연 것
    select kind, content_id, max(case when act = 'open' then 1 else 0 end) opened, count(*) n
      from feed_signals
     where v_uid is not null and user_id = v_uid and created_at > now() - interval '3 days'
     group by 1, 2
  ),
  mykind as (     -- 내가 자주 여는 종류(0~1)
    select kind, count(*)::numeric c from feed_signals
     where v_uid is not null and user_id = v_uid and act = 'open' and created_at > now() - interval '30 days'
     group by 1
  ),
  mykind_n as (select kind, c / nullif((select max(c) from mykind), 0) r from mykind),
  foll as (select following from follows where v_uid is not null and follower = v_uid),
  cand as (
    -- ⚡ 숏판·🎬 롱판
    select 'post'::text kind, p.id::text id, p.user_id author, p.created_at at, null::text cat,
           ln(1 + coalesce(p.like_count,0) * 3.0 + coalesce(p.comment_count,0) * 4.0 + coalesce(p.view_count,0) * 0.25) base,
           case when p.kind = 'horizontal' then 40.0 else 30.0 end half,
           case when p.kind = 'horizontal' then 'horizontal' else 'vertical' end sig_kind, 0::numeric bonus
      from posts p
     where coalesce(p.is_published, true) and coalesce(p.visibility,'public') = 'public'
       and coalesce(p.moderation_status,'ok') <> 'blocked' and p.created_at > now() - interval '30 days'
    union all
    -- 🏛 광장
    select 'plaza', pz.id::text, pz.user_id, pz.created_at, pz.category,
           ln(1 + greatest(coalesce(pz.up_count,0) - coalesce(pz.down_count,0), 0) * 3.0 + coalesce(pz.view_count,0) * 0.25),
           40.0, 'plaza', 0
      from plaza_posts pz
     where coalesce(pz.visibility,'public') = 'public' and pz.created_at > now() - interval '30 days'
    union all
    -- 📰 갈라뉴스
    select 'news', n.id::text, null::uuid, coalesce(n.published_at, n.created_at), n.category,
           ln(1 + coalesce(n.view_count,0) * 0.6 + coalesce(n.source_count,0) * 2.0),
           10.0, 'news', 0
      from galla_news n
     where n.status = 'published' and coalesce(n.published_at, n.created_at) > now() - interval '7 days'
    union all
    -- 🔮 갈라예측 — 판이 클수록·마감이 가까울수록
    select 'predict', m.id::text, m.created_by, m.created_at, m.category,
           ln(1 + coalesce(m.total_pool,0) / 150.0),
           24.0, 'predict',
           case when m.close_at < now() + interval '24 hours' then 0.5
                when m.close_at < now() + interval '72 hours' then 0.25 else 0 end
      from markets m
     where not m.resolved and m.close_at > now()
    union all
    -- 🔥 핫튜브 — 급상승 속도·순위
    select 'video', y.video_id, null::uuid, y.collected_at, null::text,
           ln(1 + coalesce(y.velocity,0) / 500.0 + greatest(60 - coalesce(y.rank, 60), 0) * 0.4),
           8.0, 'video', 0
      from youtube_hot y
     where y.feed = 'all' and not y.is_short
       and y.collected_at = (select max(collected_at) from youtube_hot)
       and coalesce(y.channel_title,'') not ilike '%- Topic'
  ),
  scored as (
    select c.*,
           /* 반응 배수 — 노출이 10 이상 쌓인 것만 신호를 믿는다 */
           case when coalesce(s.imps,0) >= 10
                then 1 + 2.0 * (coalesce(s.opens,0) / s.imps) + 1.5 * (coalesce(s.eng,0) / s.imps)
                     + 1.0 * (coalesce(s.comp,0) / nullif(s.wc,0))
                else 1 end eng_mul,
           exp(-1.0 * (extract(epoch from now() - c.at) / 3600.0) / c.half) fresh,
           (case when v_uid is not null and c.author in (select following from foll) then 1.7 else 1 end)
           * (1 + 0.6 * coalesce((v_cat ->> c.cat)::numeric, 0))
           * (1 + 0.3 * coalesce((select r from mykind_n k where k.kind = c.sig_kind), 0))
           * (case when mi.opened = 1 then 0.3 when mi.content_id is not null then 0.55 else 1 end)
           * (case when v_uid is not null and c.author = v_uid then 0.6 else 1 end) me_mul
      from cand c
      left join sig s on s.kind = c.sig_kind and s.content_id = c.id
      left join mine mi on mi.kind = c.sig_kind and mi.content_id = c.id
  ),
  norm as (   -- 종류 안에서 0~1 로(단위가 달라 그대로 섞으면 한 종류가 독점한다)
    select kind, id, author, at, sig_kind,
           (base / nullif(max(base) over (partition by kind), 0)) * eng_mul * fresh * me_mul + bonus sc
      from scored
  ),
  ranked as (   -- 종류별 줄 세우기
    select *, row_number() over (partition by kind order by sc desc) rn from norm where sc > 0
  ),
  mixed as (
    /* 🎚 믹서 — 종류마다 한 줄씩 번갈아 뽑는다(한 종류가 상단을 쓸지 않게).
       내가 자주 여는 종류는 가중치가 커져 더 자주(=같은 등수라도 앞줄에) 나온다. 0.75~1.6 사이.
       ⚠️ 이게 없으면 뉴스·핫튜브처럼 매일 쏟아지고 신선도가 높은 종류가 피드를 통째로 먹는다(실측 26.9.20: 40칸 중 38칸). */
    select kind, id, sc,
           rn / (0.75 + 0.85 * coalesce((select r from mykind_n k where k.kind = ranked.sig_kind), 0.4)) slot
      from ranked
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'score', round(sc::numeric, 4)) order by slot, sc desc), '[]'::jsonb)
    into v_out
    from (select * from mixed order by slot, sc desc limit greatest(10, least(p_limit, 200))) t;

  return jsonb_build_object('ok', true, 'items', v_out, 'personal', v_uid is not null);
end $$;
revoke all on function public.home_rank(integer) from public;
grant execute on function public.home_rank(integer) to anon, authenticated;
