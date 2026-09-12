-- 인증 표시는 공식 원본만 (2026-09-12 사장님 승인 "그거 해")
--
-- 다이닝코드와 같은 구조가 다른 인증 출처에도 남아 있었다 — 발견 함수(discover-food-places)가 네이버 블로그를
-- '출처명 ○○ 맛집'으로 검색해 AI 로 뽑은 상호를 그 출처로 적었다. 사용자는 '미쉐린가이드 서울' '블루리본'
-- '백년가게' 인증 배지로 보는데, 근거는 "블로그에 같이 언급됐다" 뿐이다.
--   · 백년가게 823 중 공식 수집(ingest-baeknyeon, 08-31 08:14~08:22 UTC) 745행(gov 674·tour 2·기존 가게 매칭 69)은
--     공식이다. 그 시간 밖 78행이 발견 함수 몫이다.
--   · 미쉐린 79·블루리본 265 — 공식 목록을 넣는 코드 자체가 없다. 전부 블로그·타 채널 영상 언급이다.
--
-- 처리(되돌릴 수 있게):
--   ① 백년가게 비공식 78행 → food_place_sources_archive 로 옮기고 삭제
--   ② 미쉐린·블루리본 → 채널 active=false(행은 보존, 공식 목록을 넣으면 그때 다시 켠다)
--   ③ 그 결과 '살아 있는 근거'가 하나도 없는 가게 252곳 → status='hidden' (사용자 활동 0 확인, 지우지 않음)
--   ④ 발견 대기열에서 인증(guide)·공직자(gov) 제외 — 같은 일이 다시 안 생기게
-- 지우기 전 실측을 가드로 박았다: 정확히 이 수가 아니면 통째 롤백.

create table if not exists public.food_place_sources_archive (like public.food_place_sources including defaults);
alter table public.food_place_sources_archive add column if not exists archived_at timestamptz not null default now();
alter table public.food_place_sources_archive add column if not exists reason text;
alter table public.food_place_sources_archive enable row level security;   -- 정책 없음 = 앱에서 못 읽는다(서비스 롤 전용)

do $$
declare n_arch int; n_del int; n_ch int; n_hide int; n_act int;
begin
  create temp table _guide_rm on commit drop as
    select fs.id, fs.place_id from food_place_sources fs
     where fs.channel = 'baengnyeon'
       and not (fs.created_at between '2026-08-31 08:14:00+00' and '2026-08-31 08:22:30+00')
    union all
    select fs.id, fs.place_id from food_place_sources fs where fs.channel in ('michelin', 'blueribbon');
  if (select count(*) from _guide_rm) <> 422 then
    raise exception 'guard: rm rows=%', (select count(*) from _guide_rm);
  end if;

  -- ① 백년가게 비공식 78행 — 백업 후 삭제
  insert into food_place_sources_archive
    select fs.*, now(), 'baengnyeon_blog_discovery' from food_place_sources fs
     where fs.channel = 'baengnyeon' and fs.id in (select id from _guide_rm);
  get diagnostics n_arch = row_count;
  delete from food_place_sources where channel = 'baengnyeon' and id in (select id from _guide_rm);
  get diagnostics n_del = row_count;
  if n_arch <> 78 or n_del <> 78 then raise exception 'baengnyeon archive=% delete=%', n_arch, n_del; end if;

  -- ② 미쉐린·블루리본 끄기(행 보존)
  update food_channels set active = false, harvest = false, yt_query = null
   where slug in ('michelin', 'blueribbon');
  get diagnostics n_ch = row_count;
  if n_ch <> 2 then raise exception 'channels=%', n_ch; end if;

  -- ③ 살아 있는 근거가 없어진 가게 숨기기(사용자 활동 있는 곳은 절대 건드리지 않는다)
  create temp table _orphan on commit drop as
    select distinct r.place_id from _guide_rm r
     where not exists (select 1 from food_place_sources o join food_channels c on c.slug = o.channel
                        where o.place_id = r.place_id and c.active
                          and (o.video_id is not null or c.kind not in ('yt','tv')));
  select count(*) into n_act from _orphan o
   where exists (select 1 from food_votes v where v.place_id = o.place_id)
      or exists (select 1 from food_visits v where v.place_id = o.place_id)
      or exists (select 1 from food_saves v where v.place_id = o.place_id)
      or exists (select 1 from food_comments v where v.place_id = o.place_id)
      or exists (select 1 from food_photos v where v.place_id = o.place_id and v.source = 'user');
  if n_act <> 0 then raise exception 'orphan with user activity=%', n_act; end if;
  update food_places set status = 'hidden', updated_at = now()
   where id in (select place_id from _orphan) and status = 'live';
  get diagnostics n_hide = row_count;
  if n_hide <> 252 then raise exception 'hide=%', n_hide; end if;

  raise notice 'guide cleanup: archived %, channels off %, places hidden %', n_arch, n_ch, n_hide;
end $$;

-- ④ 발견 대기열 — 인증·공직자는 블로그 검색 대상이 아니다(원본 데이터로만 들어온다)
create or replace function public.food_discover_queue(p_n integer default 4)
 returns jsonb
 language sql
 security definer
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'wave', discover_wave)), '[]'::jsonb)
    from (select slug, discover_wave from food_channels
           where active and kind not in ('guide', 'gov')
           order by last_discovered_at asc nulls first, sort
           limit greatest(coalesce(p_n, 4), 1)) t;
$function$;

select food_channel_counts_refresh();
