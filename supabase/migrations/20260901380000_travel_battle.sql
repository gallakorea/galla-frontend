-- 여행 판정 — "또 간다 vs 한 번이면 족" (2026-09-01)
--
-- 사장님이 "맛집이 맛있다/맛없다면 여행은 추천/비추냐"고 물었고, 그건 안 쓰기로 했다.
-- 이유는 하나다: **여행지는 안 가본 사람이 대다수다.** 추천/비추로 받으면 표가 통째로
-- "가고 싶다"로 오염되고, 그건 모든 리뷰 사이트가 이미 하는 것이라 싸움이 안 붙는다.
--
-- 그래서 축을 둘로 가른다. 같은 장소에 서로 다른 질문을 던진다.
--   · 가본 사람  → again(또 간다) / once(한 번이면 족)      ← 경험자의 판정
--   · 안 가본 사람 → want(가고 싶다) / pass(관심 없다)        ← 수요, 기대치
--
-- 🔥 이 둘의 낙차가 갈라만 만들 수 있는 랭킹이다.
--   "가고 싶다 1위인데 가본 사람은 안 간다" = 과대평가 여행지(hype).
--   맛집의 '과대평가'와 같은 구조인데, 여행에선 훨씬 세다(산토리니·파리 증후군은 실재하는 담론이다).
--
-- 🔑 맛집과 같은 규칙: **투표해야 말할 수 있다.** 진영을 안 정하면 댓글을 못 쓴다.
-- ⚠️ comments/votes 를 운영 중인 이슈 테이블에 붙이지 않는다. 컬럼 잠금 테이블에 컬럼을
--    추가하고 grant 를 빠뜨리면 42501 로 앱 전체 댓글이 백지가 된다(실제 사고 이력).

/* ── 1. 판정 투표 ─────────────────────────────────────── */
create table if not exists public.travel_votes (
  place_id   uuid not null references public.travel_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  verdict    text not null check (verdict in ('again','once','want','pass')),
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index if not exists travel_votes_place on public.travel_votes (place_id, verdict);

/* ── 2. 진영 댓글 ─────────────────────────────────────── */
create table if not exists public.travel_comments (
  id         bigserial primary key,
  place_id   uuid not null references public.travel_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 600),
  -- 쓸 당시의 진영을 박제한다. 나중에 표를 바꿔도 그때 한 말은 그때 편으로 남는다.
  faction    text not null check (faction in ('again','once','want','pass')),
  parent_id  bigint references public.travel_comments(id) on delete cascade,
  likes      int not null default 0,
  status     text not null default 'live' check (status in ('live','hidden','deleted')),
  created_at timestamptz not null default now()
);
create index if not exists travel_comments_place
  on public.travel_comments (place_id, created_at desc) where status='live';

create table if not exists public.travel_comment_likes (
  comment_id bigint not null references public.travel_comments(id) on delete cascade,
  user_id    uuid   not null references auth.users(id) on delete cascade,
  primary key (comment_id, user_id)
);

/* ── 3. 집계 캐시 ─────────────────────────────────────── */
create table if not exists public.travel_stats (
  place_id   uuid primary key references public.travel_places(id) on delete cascade,
  again      int not null default 0,
  once       int not null default 0,
  want       int not null default 0,
  pass       int not null default 0,
  comments   int not null default 0,
  -- 논란도: 가본 사람들 사이에서 표가 팽팽할수록 높다. 표본이 적으면 우연이라 log 로 누른다.
  heat       numeric not null default 0,
  -- 과대평가도: (가고 싶다 비율) − (또 간다 비율). 기대와 현실의 낙차다.
  --   양수가 클수록 "사진만 예쁜 곳". 음수는 반대 — 소문보다 나은 곳(숨은 명소)이다.
  hype       numeric not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists travel_stats_heat on public.travel_stats (heat desc);
create index if not exists travel_stats_hype on public.travel_stats (hype desc);
create index if not exists travel_stats_again on public.travel_stats ((again - once) desc);

create or replace function public.travel_recalc(p_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $fn$
declare a int; o int; w int; p int; c int; v int; n int; wr numeric; ar numeric;
begin
  select count(*) filter (where verdict='again'), count(*) filter (where verdict='once'),
         count(*) filter (where verdict='want'),  count(*) filter (where verdict='pass')
    into a, o, w, p from travel_votes where place_id = p_id;
  select count(*) into c from travel_comments where place_id = p_id and status='live';
  v := a + o;      -- 경험자 표
  n := w + p;      -- 미경험자 표
  ar := case when v = 0 then null else a::numeric / v end;
  wr := case when n = 0 then null else w::numeric / n end;

  insert into travel_stats(place_id, again, once, want, pass, comments, heat, hype, updated_at)
  values (p_id, a, o, w, p, c,
          case when v = 0 then 0 else (1 - abs(a - o)::numeric / v) * ln(1 + v) end,
          /* 낙차는 양쪽 표가 다 있어야 뜻이 있다. 한쪽이 비면 0 — 안 그러면
             표 하나짜리 장소가 과대평가 1위로 올라간다. */
          case when ar is null or wr is null then 0
               else (wr - ar) * ln(1 + v) end,
          now())
  on conflict (place_id) do update set
    again = excluded.again, once = excluded.once,
    want = excluded.want, pass = excluded.pass,
    comments = excluded.comments, heat = excluded.heat, hype = excluded.hype,
    updated_at = now();
end $fn$;

/* ── 4. 투표 ───────────────────────────────────────────
   같은 걸 또 누르면 취소(중립). 다른 걸 누르면 진영을 바꾼다.
   ⚠️ '가봤다(도장)'와 진영을 연동한다: again/once 를 찍으면 가본 곳으로 기록하고,
      want/pass 로 바꾸면 그 도장을 뗀다. 두 곳에 따로 표시하게 만들면 아무도 안 누른다. */
create or replace function public.travel_judge(p_id uuid, p_verdict text)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_cur text; v_new text;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if p_verdict not in ('again','once','want','pass') then
    return jsonb_build_object('ok',false,'reason','bad_verdict'); end if;
  if not exists (select 1 from travel_places where id=p_id and status in ('live','pending')) then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;

  select verdict into v_cur from travel_votes where place_id=p_id and user_id=v_uid;
  if v_cur = p_verdict then
    delete from travel_votes where place_id=p_id and user_id=v_uid;
    v_new := null;
  else
    insert into travel_votes(place_id, user_id, verdict) values (p_id, v_uid, p_verdict)
      on conflict (place_id, user_id) do update set verdict = excluded.verdict, created_at = now();
    v_new := p_verdict;
  end if;

  if v_new in ('again','once') then
    insert into travel_visits(user_id, place_id) values (v_uid, p_id) on conflict do nothing;
  else
    delete from travel_visits where user_id = v_uid and place_id = p_id;
  end if;

  perform travel_recalc(p_id);
  return jsonb_build_object('ok',true,'mine',v_new) ||
    (select jsonb_build_object('again',again,'once',once,'want',want,'pass',pass,
                               'heat',round(heat,2),'hype',round(hype,2))
       from travel_stats where place_id = p_id);
end $fn$;

/* ── 5. 진영 댓글 — 투표해야 말할 수 있다 ──────────────── */
create or replace function public.travel_say(p_id uuid, p_body text, p_parent bigint default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_fac text; v_id bigint; v_last timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if length(btrim(coalesce(p_body,''))) = 0 then return jsonb_build_object('ok',false,'reason','empty'); end if;
  if length(btrim(p_body)) > 600 then return jsonb_build_object('ok',false,'reason','too_long'); end if;

  select verdict into v_fac from travel_votes where place_id=p_id and user_id=v_uid;
  if v_fac is null then return jsonb_build_object('ok',false,'reason','pick_side'); end if;

  select max(created_at) into v_last from travel_comments where place_id=p_id and user_id=v_uid;
  if v_last is not null and v_last > now() - interval '10 seconds' then
    return jsonb_build_object('ok',false,'reason','slow_down'); end if;

  insert into travel_comments(place_id, user_id, body, faction, parent_id)
  values (p_id, v_uid, btrim(p_body), v_fac, p_parent)
  returning id into v_id;
  perform travel_recalc(p_id);
  return jsonb_build_object('ok',true,'id',v_id,'faction',v_fac);
end $fn$;

create or replace function public.travel_talk(p_id uuid, p_limit int default 60)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok',true,'comments', coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', c.id, 'body', c.body, 'faction', c.faction, 'parent_id', c.parent_id,
      'likes', c.likes, 'created_at', c.created_at,
      'nick', coalesce(u.nickname, '익명'),
      'mine', c.user_id = auth.uid(),
      'liked', exists (select 1 from travel_comment_likes l
                        where l.comment_id = c.id and l.user_id = auth.uid())) x
    from travel_comments c
    left join user_profiles u on u.user_id = c.user_id
    where c.place_id = p_id and c.status = 'live'
    order by c.created_at
    limit least(coalesce(p_limit,60), 200)
  ) q;
$fn$;

create or replace function public.travel_like(p_comment bigint)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid(); v_on boolean; v_n int;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  delete from travel_comment_likes where comment_id=p_comment and user_id=v_uid;
  if found then v_on := false; else
    insert into travel_comment_likes(comment_id, user_id) values (p_comment, v_uid)
      on conflict do nothing; v_on := true;
  end if;
  update travel_comments set likes = (select count(*) from travel_comment_likes where comment_id=p_comment)
   where id = p_comment returning likes into v_n;
  return jsonb_build_object('ok',true,'liked',v_on,'likes',coalesce(v_n,0));
end $fn$;

/* ── 6. 랭킹 표면 ──────────────────────────────────────
     controversial — 가본 사람들 표가 팽팽한 곳. 싸움이 붙은 곳.
     again         — 또 간다가 압도한 곳. 진짜 좋은 곳.
     overrated     — 🔥 가고 싶다는 높은데 가본 사람은 안 가는 곳. 이게 제일 갈라답다.
     wish          — 가고 싶다 순. 아직 표가 적을 때 화면을 채우는 용도.
   ⚠️ 최소 표수를 넘긴 곳만 올린다. 표 한 장짜리가 1위가 되면 랭킹이 장난이 된다.  */
create or replace function public.travel_rank(p_kind text default 'controversial',
                                              p_country text default null,
                                              p_min_votes int default 5,
                                              p_limit int default 30)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true, 'kind', p_kind, 'places',
    coalesce(jsonb_agg(x order by ord), '[]'::jsonb))
  from (
    select jsonb_build_object(
      'id', p.id, 'name', p.name, 'name_en', p.name_en, 'city', p.city,
      'country', p.country, 'country_code', p.country_code,
      'scale', p.scale, 'kind', p.kind, 'category', p.category,
      'lat', p.lat, 'lon', p.lon, 'photo', p.photo, 'photo_credit', p.photo_credit,
      'again', s.again, 'once', s.once, 'want', s.want, 'pass', s.pass,
      'visited', s.again + s.once,
      'again_pct', case when s.again + s.once > 0
                        then round(s.again::numeric * 100 / (s.again + s.once)) else 0 end,
      'want_pct',  case when s.want + s.pass > 0
                        then round(s.want::numeric * 100 / (s.want + s.pass)) else 0 end,
      'heat', round(s.heat, 2), 'hype', round(s.hype, 2), 'comments', s.comments,
      'channels', coalesce((select jsonb_agg(distinct ts.channel)
                              from travel_place_sources ts where ts.place_id = p.id), '[]'::jsonb)) x,
      case p_kind
        when 'again'     then -(s.again - s.once)::numeric
        when 'overrated' then -s.hype
        when 'wish'      then -(s.want - s.pass)::numeric
        else                  -s.heat
      end ord
    from travel_places p
    join travel_stats s on s.place_id = p.id
    where p.status = 'live'
      and (p_country is null or p.country_code = upper(p_country))
      and case p_kind
            when 'wish'      then s.want + s.pass  >= greatest(coalesce(p_min_votes,5),1)
            /* 과대평가·또간다·논란은 **경험자 표**가 기준이다. 안 가본 사람 표로는
               "가본 사람은 안 간다"를 말할 수 없다. */
            when 'overrated' then s.again + s.once >= greatest(coalesce(p_min_votes,5),1)
                                  and s.want + s.pass >= greatest(coalesce(p_min_votes,5),1)
            else                  s.again + s.once >= greatest(coalesce(p_min_votes,5),1)
          end
    limit least(coalesce(p_limit, 30), 100)
  ) q;
$fn$;

/* ── 7. RLS ────────────────────────────────────────────  */
alter table public.travel_votes         enable row level security;
alter table public.travel_comments      enable row level security;
alter table public.travel_comment_likes enable row level security;
alter table public.travel_stats         enable row level security;

drop policy if exists travel_votes_read on public.travel_votes;
create policy travel_votes_read on public.travel_votes
  for select to anon, authenticated using (true);
drop policy if exists travel_votes_own on public.travel_votes;
create policy travel_votes_own on public.travel_votes
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists travel_comments_read on public.travel_comments;
create policy travel_comments_read on public.travel_comments
  for select to anon, authenticated using (status = 'live');
-- 쓰기는 RPC(travel_say)로만. 직접 insert 를 열면 '투표해야 말할 수 있다'가 무너진다.

drop policy if exists travel_likes_read on public.travel_comment_likes;
create policy travel_likes_read on public.travel_comment_likes
  for select to authenticated using (user_id = auth.uid());

drop policy if exists travel_stats_read on public.travel_stats;
create policy travel_stats_read on public.travel_stats
  for select to anon, authenticated using (true);

grant execute on function public.travel_judge(uuid,text)          to authenticated;
grant execute on function public.travel_say(uuid,text,bigint)     to authenticated;
grant execute on function public.travel_like(bigint)              to authenticated;
grant execute on function public.travel_talk(uuid,int)            to anon, authenticated;
grant execute on function public.travel_rank(text,text,int,int)   to anon, authenticated;
revoke all on function public.travel_recalc(uuid) from anon, authenticated;
