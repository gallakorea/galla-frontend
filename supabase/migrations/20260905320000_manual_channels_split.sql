-- 수기 등록 채널 목록에 **가게에 안 가는 채널**이 섞여 있었다.
-- 홍유 370 · 또리네가족 370 · 소유 379 · 문복희 379 · 떵개떵 380 · 츄더 370 —
-- ASMR 스튜디오 먹방과 육아 브이로그다. 손으로 봐도 건질 게 없다.
-- (실측: 이 8개 채널은 1,160편을 수확해 0건이었다. 그래서 active=false 로 내렸다.)
-- → active 인 채널만 보여준다. active 는 '맛집 채널인가', harvest 는 '자동이 되는가'다.
--
-- 그리고 남은 편수를 두 갈래로 나눠 준다. 섞여 있으면 사람이 헛일을 한다:
--   auto=true  … 자동 수확이 아직 순서가 안 온 것. **손대면 낭비다.**
--   auto=false … 자동이 못 하는 것(설명에 상호도 주소도 없다). 여기가 사람 몫이다.
create or replace function public.food_manual_channels()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with n as (
    select c.slug, c.name, c.kind, c.harvest,
           count(*) filter (where v.harvested_at is null
             and not exists (select 1 from food_place_sources s where s.video_id = v.video_id)) cnt
      from food_channels c join food_videos v on v.channel = c.slug
     where c.active                      -- 맛집 채널만. 가게에 안 가는 채널은 뺀다
     group by c.slug, c.name, c.kind, c.harvest)
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', slug, 'name', name, 'kind', kind, 'auto', harvest, 'left', cnt)
         order by harvest asc, cnt desc), '[]'::jsonb)
    from n where cnt > 0;
$$;
