-- 🔥 커뮤니티 인기글 → AI 재작성 → 광장 자동 게시 파이프라인 (갈라뉴스와 동일 구조)
-- 원문 통째 복제 X. AI 재작성 + 출처 표기 + 안전필터. 일베 등 고위험 소스 제외.
create table if not exists public.community_hot (
  id uuid primary key default gen_random_uuid(),
  source text not null,                 -- 'dcinside' | 'fmkorea' ...
  src_title text,
  src_url text unique,                  -- 중복 방지 키
  thumb text,
  score int default 0,
  posted_at timestamptz,
  status text not null default 'new' check (status in ('new','published','skipped','failed')),
  skip_reason text,
  plaza_post_id uuid,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists idx_comhot_status on public.community_hot(status, created_at desc);
create index if not exists idx_comhot_src on public.community_hot(source, created_at desc);

-- 관리자 모니터링(무인이지만 감사/차단용)
create or replace function public.admin_community_hot(p_limit int default 60)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not _is_admin() then return jsonb_build_object('ok',false,'reason','forbidden'); end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'source',source,'src_title',src_title,'src_url',src_url,'thumb',thumb,
    'status',status,'skip_reason',skip_reason,'plaza_post_id',plaza_post_id,'created_at',created_at)
    order by created_at desc), '[]'::jsonb) into v from community_hot limit p_limit;
  return jsonb_build_object('ok',true,'rows',v,
    'published',(select count(*) from community_hot where status='published'),
    'skipped',(select count(*) from community_hot where status='skipped'));
end $$;
grant execute on function public.admin_community_hot(int) to authenticated;
