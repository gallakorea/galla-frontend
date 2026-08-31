-- 수집 대기열 — 주소를 못 얻은 상호를 버리지 않고 쌓아둔다 (2026-08-31)
--
-- 실측: 또간집 영상 6편에서 추출 0건. 유튜브 설명엔 상호명만 있고 주소가 없다.
--   추출기가 "주소 없으면 버려라" 규칙이라 전부 버렸다 — 유튜브 쿼터만 태우고 남는 게 없다.
-- → 상호명 + 지역 힌트만이라도 여기에 쌓는다. 장소검색 키(카카오/네이버)가 생기면
--   pending 을 일괄 해소해 food_places 로 승격한다. 키를 기다리는 동안에도 자산이 쌓인다.
create table if not exists public.food_pending (
  id          bigserial primary key,
  name        text not null,
  region_hint text,                      -- '서울 중구', '부산' 같은 느슨한 힌트
  channel     text references public.food_channels(slug) on delete set null,
  video_id    text,
  video_title text,
  aired_at    timestamptz,
  tries       int not null default 0,    -- 몇 번 해소를 시도했나(영원히 재시도하지 않게)
  status      text not null default 'pending'
              check (status in ('pending','resolved','failed')),
  created_at  timestamptz not null default now()
);
create unique index if not exists food_pending_uk
  on public.food_pending (lower(regexp_replace(name,'[[:space:]]','','g')), coalesce(video_id,''));
create index if not exists food_pending_open on public.food_pending (status, tries) where status='pending';

alter table public.food_pending enable row level security;

create or replace function public.food_stage(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    begin
      insert into food_pending(name, region_hint, channel, video_id, video_title, aired_at)
      values (btrim(it->>'name'), nullif(btrim(coalesce(it->>'region_hint','')),''),
              nullif(it->>'channel',''), nullif(it->>'video_id',''),
              nullif(it->>'video_title',''), nullif(it->>'aired_at','')::timestamptz);
      n := n + 1;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('ok', true, 'staged', n);
end $fn$;
revoke all on function public.food_stage(jsonb) from public, anon, authenticated;

-- 관제용 요약
create or replace function public.food_pending_stats()
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok',true,
    'pending', count(*) filter (where status='pending'),
    'resolved', count(*) filter (where status='resolved'),
    'failed', count(*) filter (where status='failed'),
    'by_channel', coalesce(jsonb_object_agg(channel, c) filter (where channel is not null), '{}'::jsonb))
  from (select status, channel, count(*) over (partition by channel) c from food_pending) t;
$fn$;
grant execute on function public.food_pending_stats() to authenticated;
