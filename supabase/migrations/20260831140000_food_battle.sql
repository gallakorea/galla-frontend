-- 맛집 대결 — "맛있다 vs 맛없다" (2026-08-31)
--
-- 사장님: "갈라만의 가르는, 맛있다 맛없다 논지로 개싸움이 붙는 커뮤니티가 핵심이 돼야 함."
--   맛집여지도는 읽기 전용 디렉터리다. 방송에 나왔다는 사실만 알려주고 끝난다.
--   갈라는 거기서 시작한다 — "그래서 그 집 진짜 맛있냐?"
--
-- 🔑 핵심 규칙: **투표해야 말할 수 있다.**
--   진영을 정하지 않으면 댓글을 못 쓴다. 그래야 편이 갈리고, 댓글에 진영 색이 박힌다.
--   구경꾼이 훈수만 두는 걸 막는 장치이기도 하다(배틀 룰과 같은 철학).
--
-- ⚠️ comments/votes 테이블에 place_id 를 붙이지 않았다. comments 는 17컬럼 중 16개만
--    anon/authenticated 에 grant 된 **컬럼 잠금 테이블**이라, 컬럼을 추가하고 grant 를
--    빠뜨리면 42501 로 **이슈 댓글이 앱 전체에서 백지**가 된다(실제 사고 이력).
--    맛집은 아직 검증 안 된 신규 기능이다 — 운영 중인 핫 테이블에 그 위험을 지우지 않는다.

/* ── 1. 판정 투표 ─────────────────────────────────────── */
create table if not exists public.food_votes (
  place_id   uuid not null references public.food_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  verdict    text not null check (verdict in ('good','bad')),
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index if not exists food_votes_place on public.food_votes (place_id, verdict);

/* ── 2. 진영 댓글 ─────────────────────────────────────── */
create table if not exists public.food_comments (
  id         bigserial primary key,
  place_id   uuid not null references public.food_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 600),
  -- 쓸 당시의 진영을 박제한다. 나중에 표를 바꿔도 그때 한 말은 그때 편으로 남는다.
  faction    text not null check (faction in ('good','bad')),
  parent_id  bigint references public.food_comments(id) on delete cascade,
  likes      int not null default 0,
  status     text not null default 'live' check (status in ('live','hidden','deleted')),
  created_at timestamptz not null default now()
);
create index if not exists food_comments_place on public.food_comments (place_id, created_at desc) where status='live';

create table if not exists public.food_comment_likes (
  comment_id bigint not null references public.food_comments(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  primary key (comment_id, user_id)
);

/* ── 3. 집계 캐시 ─────────────────────────────────────────
   매번 count(*) 하면 랭킹 질의가 전수 스캔이 된다. 투표할 때 즉시 갱신한다. */
create table if not exists public.food_stats (
  place_id   uuid primary key references public.food_places(id) on delete cascade,
  good       int not null default 0,
  bad        int not null default 0,
  comments   int not null default 0,
  -- 논란도: 표가 팽팽할수록 높다. 표본이 적으면 우연이므로 log 로 눌러준다.
  --   heat = (1 - |good-bad|/total) * ln(1+total)
  -- 10:10 은 3.04, 100:0 은 0. 이게 갈라만 만들 수 있는 랭킹이다.
  heat       numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists food_stats_heat on public.food_stats (heat desc);
create index if not exists food_stats_good on public.food_stats ((good - bad) desc);

create or replace function public.food_recalc(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare g int; b int; c int; t int;
begin
  select count(*) filter (where verdict='good'), count(*) filter (where verdict='bad')
    into g, b from food_votes where place_id = p_id;
  select count(*) into c from food_comments where place_id = p_id and status='live';
  t := g + b;
  insert into food_stats(place_id, good, bad, comments, heat, updated_at)
  values (p_id, g, b, c,
          case when t = 0 then 0
               else (1 - abs(g - b)::numeric / t) * ln(1 + t) end,
          now())
  on conflict (place_id) do update set
    good = excluded.good, bad = excluded.bad, comments = excluded.comments,
    heat = excluded.heat, updated_at = now();
end $fn$;

/* ── 4. 판정 투표 ─────────────────────────────────────
   같은 집에 다시 투표하면 진영을 바꾼다. 같은 걸 또 누르면 취소(중립)다.        */
create or replace function public.food_judge(p_id uuid, p_verdict text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_cur text; v_new text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if p_verdict not in ('good','bad') then return jsonb_build_object('ok',false,'reason','bad_verdict'); end if;
  if not exists (select 1 from food_places where id=p_id and status='live') then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;

  select verdict into v_cur from food_votes where place_id=p_id and user_id=v_uid;
  if v_cur = p_verdict then
    delete from food_votes where place_id=p_id and user_id=v_uid;   -- 같은 걸 또 = 취소
    v_new := null;
  else
    insert into food_votes(place_id, user_id, verdict) values (p_id, v_uid, p_verdict)
      on conflict (place_id, user_id) do update set verdict = excluded.verdict, created_at = now();
    v_new := p_verdict;
  end if;

  perform food_recalc(p_id);
  return jsonb_build_object('ok',true,'mine',v_new) ||
    (select jsonb_build_object('good',good,'bad',bad,'heat',round(heat,2))
       from food_stats where place_id = p_id);
end $fn$;

/* ── 5. 진영 댓글 — 투표해야 말할 수 있다 ─────────────── */
create or replace function public.food_say(p_id uuid, p_body text, p_parent bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_fac text; v_id bigint; v_last timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if length(btrim(coalesce(p_body,''))) = 0 then return jsonb_build_object('ok',false,'reason','empty'); end if;
  if length(btrim(p_body)) > 600 then return jsonb_build_object('ok',false,'reason','too_long'); end if;

  -- 🔑 진영을 정하지 않으면 말할 수 없다. 구경꾼 훈수를 막고 편을 가른다.
  select verdict into v_fac from food_votes where place_id=p_id and user_id=v_uid;
  if v_fac is null then return jsonb_build_object('ok',false,'reason','pick_side'); end if;

  -- 도배 방지 — 같은 집에 10초 간격
  select max(created_at) into v_last from food_comments where place_id=p_id and user_id=v_uid;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    return jsonb_build_object('ok',false,'reason','slow_down'); end if;

  insert into food_comments(place_id, user_id, body, faction, parent_id)
  values (p_id, v_uid, btrim(p_body), v_fac, p_parent)
  returning id into v_id;
  perform food_recalc(p_id);
  return jsonb_build_object('ok',true,'id',v_id,'faction',v_fac);
end $fn$;

create or replace function public.food_talk(p_id uuid, p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok',true,'comments', coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', c.id, 'body', c.body, 'faction', c.faction, 'parent_id', c.parent_id,
      'likes', c.likes, 'created_at', c.created_at,
      'nick', coalesce(u.nickname, '익명'),
      'mine', c.user_id = auth.uid(),
      'liked', exists (select 1 from food_comment_likes l
                        where l.comment_id = c.id and l.user_id = auth.uid())) x
    from food_comments c
    left join user_profiles u on u.user_id = c.user_id
    where c.place_id = p_id and c.status = 'live'
    order by c.created_at
    limit least(coalesce(p_limit,60), 200)
  ) q;
$fn$;

create or replace function public.food_like(p_comment bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_on boolean; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  delete from food_comment_likes where comment_id=p_comment and user_id=v_uid;
  if found then v_on := false; else
    insert into food_comment_likes(comment_id, user_id) values (p_comment, v_uid)
      on conflict do nothing; v_on := true;
  end if;
  update food_comments set likes = (select count(*) from food_comment_likes where comment_id=p_comment)
   where id = p_comment returning likes into v_n;
  return jsonb_build_object('ok',true,'liked',v_on,'likes',coalesce(v_n,0));
end $fn$;

/* ── 6. 랭킹 표면 — 여기가 갈라만 만들 수 있는 화면이다 ────
   맛집여지도는 "방송에 나온 집" 목록에서 끝난다. 갈라는 그 다음을 묻는다.
     controversial — 표가 팽팽한 집. 싸움이 붙은 곳.
     loved         — 맛있다가 압도한 집. 진짜 인정받은 곳.
     overrated     — 🔥 방송엔 나왔는데 맛없다가 이긴 집. 이게 제일 갈라답다.
   ⚠️ 표본이 적으면 우연이다 — 최소 표수를 넘긴 집만 랭킹에 올린다.                */
create or replace function public.food_rank(p_kind text default 'controversial',
                                            p_region text default null,
                                            p_min_votes int default 5,
                                            p_limit int default 30)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'kind', p_kind, 'places',
    coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'address', p.address, 'region', p.region,
      'lat', p.lat, 'lon', p.lon, 'category', p.category,
      'good', s.good, 'bad', s.bad, 'total', s.good + s.bad,
      'heat', round(s.heat, 2), 'comments', s.comments,
      'pct', case when s.good + s.bad > 0
                  then round(s.good::numeric * 100 / (s.good + s.bad)) else 0 end,
      'channels', coalesce((select jsonb_agg(distinct fs.channel)
                              from food_place_sources fs where fs.place_id = p.id), '[]'::jsonb)) x,
      case p_kind
        when 'loved'     then -(s.good - s.bad)::numeric
        when 'overrated' then -(s.bad - s.good)::numeric
        else             -s.heat
      end ord
    from food_places p
    join food_stats s on s.place_id = p.id
    where p.status = 'live'
      and s.good + s.bad >= greatest(coalesce(p_min_votes, 5), 1)
      and (p_region is null or p.region = p_region)
      -- 과대평가는 '방송에 나온 집'이면서 맛없다가 이긴 곳만. 그래야 의미가 있다.
      and (p_kind <> 'overrated' or (s.bad > s.good
           and exists (select 1 from food_place_sources fs where fs.place_id = p.id)))
      and (p_kind <> 'loved' or s.good > s.bad)
    order by ord
    limit least(coalesce(p_limit, 30), 100)
  ) q;
$fn$;

/* ── 7. RLS · 권한 ────────────────────────────────────── */
alter table public.food_votes         enable row level security;
alter table public.food_comments      enable row level security;
alter table public.food_comment_likes enable row level security;
alter table public.food_stats         enable row level security;

-- 직접 SELECT 는 열지 않는다(정책 없음 = 차단). 읽기는 security definer RPC 로만.
drop policy if exists food_votes_mine on public.food_votes;
create policy food_votes_mine on public.food_votes for select using (user_id = auth.uid());
grant select on public.food_votes to authenticated;

revoke all on function public.food_recalc(uuid) from public, anon, authenticated;

grant execute on function public.food_judge(uuid,text)          to authenticated;
grant execute on function public.food_say(uuid,text,bigint)     to authenticated;
grant execute on function public.food_like(bigint)              to authenticated;
grant execute on function public.food_talk(uuid,int)            to anon, authenticated;
grant execute on function public.food_rank(text,text,int,int)   to anon, authenticated;

/* ── 8. 가드 ─────────────────────────────────────────── */
do $chk$
begin
  -- 논란도 공식이 살아 있는가: 10:10 이 100:0 보다 반드시 뜨거워야 한다.
  if (1 - abs(10-10)::numeric/20) * ln(1+20) <= (1 - abs(100-0)::numeric/100) * ln(1+100) then
    raise exception '논란도 공식이 뒤집혔다 — 팽팽한 집이 상위로 안 온다';
  end if;
end $chk$;
-- 상세에 판정 결과와 내 진영을 실어 보낸다 (2026-08-31)
-- 시트가 열리자마자 투표바를 그려야 하는데, 별도 RPC 를 또 부르면 깜빡인다.
create or replace function public.food_place_detail(p_id uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', p.id is not null,
    'place', to_jsonb(p) - 'norm_name' - 'submitted_by',
    'visited', exists (select 1 from food_visits v where v.place_id=p.id and v.user_id=auth.uid()),
    'saved',   exists (select 1 from food_saves  s where s.place_id=p.id and s.user_id=auth.uid()),
    -- 판정 현황 + 내가 어느 편인지(없으면 null → 프론트가 댓글 입력을 잠근다)
    'stats', coalesce((select jsonb_build_object('good', st.good, 'bad', st.bad,
                                                 'heat', round(st.heat,2), 'comments', st.comments)
                         from food_stats st where st.place_id = p.id),
                      jsonb_build_object('good',0,'bad',0,'heat',0,'comments',0)),
    'mine', (select v.verdict from food_votes v where v.place_id = p.id and v.user_id = auth.uid()),
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'channel', fs.channel, 'name', c.name, 'thumb', c.thumb,
        'video_id', fs.video_id, 'title', fs.video_title, 'aired_at', fs.aired_at)
        order by fs.aired_at desc nulls last)
      from food_place_sources fs join food_channels c on c.slug = fs.channel
     where fs.place_id = p.id), '[]'::jsonb))
  from food_places p where p.id = p_id and p.status = 'live';
$fn$;
grant execute on function public.food_place_detail(uuid) to anon, authenticated;
