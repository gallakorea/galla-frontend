-- 어디 갈래 — 여행지 양자택일 (2026-09-02)
--
-- 왜: 장소 5,774곳에 판정 0·한마디 0. 유입 탓만이 아니었다. 지금 장치가
--     "안 가본 곳을 평가하라"고 묻고 있어서다 — 해외 여행지는 가본 한국인이 1%도 안 된다.
--     둘 중 하나 고르기는 **자격이 필요 없다**. 가고 싶은 곳은 누구나 있다.
--
-- 이 장치의 유일한 산출물은 **랭킹**이다. 오염되면 남는 게 없으므로 방어를 먼저 넣는다:
--   · 표는 다 받되(사용자 경험은 안 막는다) **랭킹 반영은 걸러서** 한다
--   · 0.4초 미만 응답 = 연타 → 점수 반영 안 함
--   · 같은 신원 하루 400표 초과 → 점수 반영 안 함
--   · 판당 보상 없음(설계 문서대로). 보상은 완주 1일 1회뿐이라 연타할 이유가 없다.

/* 카드가 될 수 있는 곳만 모은 판. 사진과 좌표가 둘 다 있어야 한다 —
   사진 없는 카드는 고를 수가 없고, 좌표가 없으면 거리축을 못 만든다. */
create or replace view travel_vs_pool as
  select p.id, p.sid, p.slug, p.name, p.country, p.country_code,
         coalesce(p.city, p.admin1) as area, p.scale,
         travel_cover(p.id) as cover,
         round(travel_km(37.5665, 126.9780, p.lat, p.lon))::int as km,
         (select count(*) from travel_certs c where c.place_id = p.id)::int as certs,
         coalesce((select sum(distinct ch.subs) from travel_place_sources s
                     join travel_channels ch on ch.slug = s.channel
                    where s.place_id = p.id), 0)::bigint as subs,
         (select count(distinct s.channel) from travel_place_sources s
           where s.place_id = p.id)::int as creators
    from travel_places p
   where p.status = 'live'
     and p.scale in ('spot', 'city')
     and p.lat is not null
     and travel_cover(p.id) is not null;

grant select on travel_vs_pool to anon, authenticated;

create table if not exists travel_vs_rank (
  place_id uuid primary key references travel_places(id) on delete cascade,
  score    numeric not null default 1500,
  wins     int not null default 0,
  losses   int not null default 0,
  updated_at timestamptz not null default now()
);
alter table travel_vs_rank enable row level security;
drop policy if exists travel_vs_rank_read on travel_vs_rank;
create policy travel_vs_rank_read on travel_vs_rank for select using (true);
create index if not exists travel_vs_rank_score_idx on travel_vs_rank (score desc);

create table if not exists travel_vs_votes (
  id         bigserial primary key,
  user_id    uuid references auth.users(id) on delete set null,
  device     text,                          -- 비로그인 식별(브라우저 로컬 난수). 신원이 아니다.
  winner_id  uuid not null references travel_places(id) on delete cascade,
  loser_id   uuid not null references travel_places(id) on delete cascade,
  ms         int,                           -- 응답 시간(연타 판별)
  counted    boolean not null default true, -- 랭킹에 반영됐는지
  created_at timestamptz not null default now()
);
alter table travel_vs_votes enable row level security;   -- 정책 없음 = 직접 접근 전면 차단(RPC 로만)
create index if not exists travel_vs_votes_dev_idx on travel_vs_votes (device, created_at desc);
create index if not exists travel_vs_votes_user_idx on travel_vs_votes (user_id, created_at desc);

/* ── 짝 뽑기 ────────────────────────────────────────────────
   무작위로 붙이면 첫 판에 죽는다. '도쿄 vs 이름 모를 절'은 고를 것도 없다.
     · 같은 급끼리만(scale) — 도시 옆에 작은 사찰을 놓으면 비교가 안 된다
     · 점수 ±150 안에서만
     · 축 하나는 공유: 같은 나라 / 같은 거리대 / (가끔) 아무거나
     · 첫 3판은 아는 곳으로 — 몰라서 못 고르면 그대로 이탈한다
   ⚠️ 노출이 적은 곳에 가중치를 준다. 안 그러면 처음 뽑힌 몇백 곳만 계속 돌고
      나머지 2천 곳은 영원히 점수가 없다. */
create or replace function travel_vs_pair(p_round int default 1, p_seen uuid[] default '{}')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a record; b record; band int; famous boolean;
begin
  famous := coalesce(p_round, 1) <= 3;

  select v.*, coalesce(r.score, 1500) score, coalesce(r.wins + r.losses, 0) seen
    into a
    from travel_vs_pool v
    left join travel_vs_rank r on r.place_id = v.id
   where not (v.id = any(coalesce(p_seen, '{}')))
     and (not famous or v.certs > 0 or v.creators >= 2)
   order by random() * (1 + coalesce(r.wins + r.losses, 0))    -- 덜 나온 곳이 먼저
   limit 1;
  if a.id is null then return jsonb_build_object('ok', false, 'reason', 'no_pool'); end if;

  band := case when a.km < 1500 then 1 when a.km < 4000 then 2
               when a.km < 9000 then 3 else 4 end;

  select v.*, coalesce(r.score, 1500) score
    into b
    from travel_vs_pool v
    left join travel_vs_rank r on r.place_id = v.id
   where v.id <> a.id
     and not (v.id = any(coalesce(p_seen, '{}')))
     and v.scale = a.scale
     and abs(coalesce(r.score, 1500) - a.score) < 150
     and (not famous or v.certs > 0 or v.creators >= 2)
     /* 축 하나는 공유해야 '고민'이 생긴다. 같은 나라가 제일 좋고, 아니면 같은 거리대. */
     and (v.country_code = a.country_code
          or case when v.km < 1500 then 1 when v.km < 4000 then 2
                  when v.km < 9000 then 3 else 4 end = band)
   order by (v.country_code = a.country_code) desc, random() * (1 + coalesce(r.wins + r.losses, 0))
   limit 1;

  /* 짝이 없으면 조건을 푼다 — 판이 비는 것보다 덜 어울리는 짝이 낫다 */
  if b.id is null then
    select v.*, coalesce(r.score, 1500) score into b
      from travel_vs_pool v left join travel_vs_rank r on r.place_id = v.id
     where v.id <> a.id and not (v.id = any(coalesce(p_seen, '{}'))) and v.scale = a.scale
     order by random() limit 1;
  end if;
  if b.id is null then return jsonb_build_object('ok', false, 'reason', 'no_partner'); end if;

  return jsonb_build_object('ok', true, 'round', p_round,
    'a', to_jsonb(a) - 'score' - 'seen', 'b', to_jsonb(b) - 'score');
end $$;

/* ── 표 기록 + 점수 갱신 ──────────────────────────────────── */
create or replace function travel_vs_pick(p_winner uuid, p_loser uuid,
                                          p_ms int default null, p_device text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); ok boolean := true; today int;
        sa numeric; sb numeric; ea numeric; k constant numeric := 24;
begin
  if p_winner is null or p_loser is null or p_winner = p_loser then
    return jsonb_build_object('ok', false);
  end if;

  /* 연타는 랭킹에서 뺀다. 표는 그대로 받는다 — 사람 화면을 막을 이유는 없다. */
  if p_ms is not null and p_ms < 400 then ok := false; end if;

  select count(*) into today from travel_vs_votes
   where created_at > now() - interval '24 hours'
     and ((uid is not null and user_id = uid)
          or (uid is null and p_device is not null and device = p_device));
  if today > 400 then ok := false; end if;

  insert into travel_vs_votes(user_id, device, winner_id, loser_id, ms, counted)
  values (uid, nullif(btrim(coalesce(p_device,'')),''), p_winner, p_loser, p_ms, ok);

  if not ok then return jsonb_build_object('ok', true, 'counted', false); end if;

  insert into travel_vs_rank(place_id) values (p_winner) on conflict do nothing;
  insert into travel_vs_rank(place_id) values (p_loser)  on conflict do nothing;
  select score into sa from travel_vs_rank where place_id = p_winner;
  select score into sb from travel_vs_rank where place_id = p_loser;
  ea := 1.0 / (1.0 + power(10.0, (sb - sa) / 400.0));       -- 승자의 기대 승률
  update travel_vs_rank set score = sa + k * (1 - ea), wins = wins + 1, updated_at = now()
   where place_id = p_winner;
  update travel_vs_rank set score = sb - k * (1 - ea), losses = losses + 1, updated_at = now()
   where place_id = p_loser;

  return jsonb_build_object('ok', true, 'counted', true);
end $$;

/* 결과 카드가 부를 것 — sid 몇 개로 장소를 되찾는다(공유 링크는 sid 로 만든다) */
create or replace function travel_vs_places(p_sids text[])
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(v) order by array_position(p_sids, v.sid)), '[]'::jsonb)
    from travel_vs_pool v where v.sid = any(coalesce(p_sids, '{}'));
$$;

revoke all on function travel_vs_pair(int, uuid[]) from public;
revoke all on function travel_vs_pick(uuid, uuid, int, text) from public;
revoke all on function travel_vs_places(text[]) from public;
grant execute on function travel_vs_pair(int, uuid[]) to anon, authenticated;
grant execute on function travel_vs_pick(uuid, uuid, int, text) to anon, authenticated;
grant execute on function travel_vs_places(text[]) to anon, authenticated;
