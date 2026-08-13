-- =========================================================
-- 참조 키 캐시 — 실시간 스캔이 PostgREST 타임아웃에 걸린다
--
-- media_referenced_keys() 는 전 컬럼을 훑어 ~27초 걸린다.
-- PostgREST(엣지 함수가 부르는 경로)는 역할 단위 statement_timeout 이 훨씬 짧아
-- 매번 'canceling statement due to statement timeout' 이 났다.
-- → 크론이 DB 안에서 미리 채우고(타임아웃 무관), 엣지 함수는 테이블만 읽는다.
--
-- ⚠️ 캐시가 낡으면 그 사이 올라온 파일이 '참조 없음'으로 보여 지워질 수 있다.
--    그래서 purge 함수가 캐시 신선도를 확인하고, 낡으면 중단한다.
-- =========================================================

create table if not exists public.media_ref_cache (
  key          text primary key,
  refreshed_at timestamptz not null default now()
);
alter table public.media_ref_cache enable row level security;
drop policy if exists media_ref_cache_admin on public.media_ref_cache;
create policy media_ref_cache_admin on public.media_ref_cache for select using (_is_admin());

comment on table public.media_ref_cache is
  '살아있는 미디어 키 스냅샷. refresh_media_refs() 크론이 채운다. purge-orphan-media 가 이걸 읽어 고아를 판정한다 — 낡으면 purge 가 중단한다.';

create or replace function public.refresh_media_refs()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n int;
begin
  perform set_config('statement_timeout', '300s', true);
  create temp table _mk on commit drop as
    select distinct k from media_referenced_keys() k;
  select count(*) into n from _mk;

  -- 스캔이 조용히 실패해 0건이면 캐시를 비우지 않는다(비우면 다음 purge 가 전량 삭제로 간다)
  if n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'empty_scan', 'kept_previous', (select count(*) from media_ref_cache));
  end if;

  delete from media_ref_cache;
  insert into media_ref_cache(key) select k from _mk;
  return jsonb_build_object('ok', true, 'keys', n);
end $$;
revoke execute on function public.refresh_media_refs() from anon, authenticated, public;

-- 매일 04:40 KST — purge(05:00)보다 먼저 채운다
select cron.unschedule('media_ref_refresh') where exists (select 1 from cron.job where jobname='media_ref_refresh');
select cron.schedule('media_ref_refresh', '40 19 * * *', $$select public.refresh_media_refs()$$);
