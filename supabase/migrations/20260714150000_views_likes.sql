-- 조회수(유튜브식) + 좋아요 카운트 집계
-- issues.view_count / like_count 컬럼 + issue_likes 트리거 + bump_view RPC

alter table public.issues add column if not exists view_count bigint  not null default 0;
alter table public.issues add column if not exists like_count integer not null default 0;

-- ── 좋아요 카운트 동기화(issue_likes → issues.like_count) ──
create or replace function public.sync_issue_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT') then
    update issues set like_count = coalesce(like_count,0) + 1 where id = NEW.issue_id;
  elsif (TG_OP = 'DELETE') then
    update issues set like_count = greatest(coalesce(like_count,0) - 1, 0) where id = OLD.issue_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_like_count on public.issue_likes;
create trigger trg_sync_like_count
  after insert or delete on public.issue_likes
  for each row execute function public.sync_issue_like_count();

-- 기존 좋아요 백필
update issues i set like_count = (select count(*) from issue_likes l where l.issue_id = i.id);

-- ── 조회수 증가(비회원 포함) ──
create or replace function public.bump_view(p_issue bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  if p_issue is null then return 0; end if;
  update issues set view_count = coalesce(view_count,0) + 1 where id = p_issue
    returning view_count into v;
  return coalesce(v, 0);
end $$;
grant execute on function public.bump_view(bigint) to anon, authenticated;
