-- 어디 갈래 풀을 '진짜 카드가 되는 곳'으로 좁힌다 (2026-09-02)
--
-- 첫 판을 돌려보니 'Residence of Bukov' vs 'Nahal Me'arot' 이 나왔다. 아무도 모르는
-- 유네스코 구성요소 둘을 붙여 놓고 고르라고 한 것이다. 실측해 보니 원인이 셋이었다:
--   · 2,640곳 중 1,568곳은 country 가 비어 있다(위키데이터 유산 적재분)
--   · 1,178곳은 이름이 아직 영문이다 — 한국인이 읽고 고를 수가 없다
--   · 인증(certs>0)을 유명세로 썼는데, 인증 1,734곳은 대부분 국가유산 '보물'이나
--     세계유산 구성요소다. 유명한 것과 아무 상관이 없다.
--
-- 진짜 유명세 신호는 **한국 여행 유튜버가 갔는가**다. 그게 우리만 가진 것이기도 하다.
-- → 풀 = 한글 이름 + 나라 있음 + 크리에이터 발자국 1명 이상. 지금 909곳,
--    수확·한글화가 돌면 계속 는다. 15판짜리 게임에는 넘친다.
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
     and p.country is not null
     and p.name ~ '[가-힣]'                       -- 한국인이 읽고 고를 수 있어야 카드다
     and travel_cover(p.id) is not null
     and exists (select 1 from travel_place_sources s where s.place_id = p.id);

grant select on travel_vs_pool to anon, authenticated;

-- 첫 3판의 '아는 곳' 기준을 인증에서 **크리에이터 수**로 바꾼다.
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
     and (not famous or v.creators >= 3)      -- 여러 유튜버가 간 곳 = 실제로 아는 곳
   order by random() * (1 + coalesce(r.wins + r.losses, 0))
   limit 1;
  /* 유명한 곳이 동날 수 있다 — 판이 비는 것보다 낫다 */
  if a.id is null and famous then
    select v.*, coalesce(r.score, 1500) score, coalesce(r.wins + r.losses, 0) seen into a
      from travel_vs_pool v left join travel_vs_rank r on r.place_id = v.id
     where not (v.id = any(coalesce(p_seen, '{}')))
     order by v.creators desc, random() limit 1;
  end if;
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
     and (not famous or v.creators >= 3)
     and (v.country_code = a.country_code
          or case when v.km < 1500 then 1 when v.km < 4000 then 2
                  when v.km < 9000 then 3 else 4 end = band)
   order by (v.country_code = a.country_code) desc, random() * (1 + coalesce(r.wins + r.losses, 0))
   limit 1;

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
