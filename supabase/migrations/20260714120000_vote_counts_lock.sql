-- 진영 투표: 실제 누적 집계 유지 + 변경 불가(1인 1진영 확정)
-- 문제: issues.pro_count/con_count 갱신 트리거가 없어 피드가 항상 50/50.
--       votes update 정책이 있어 진영 변경 가능. → 집계 트리거 추가 + 변경 잠금.

-- ── 집계 동기화 트리거(votes → issues.pro_count/con_count) ──
create or replace function public.sync_issue_vote_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (TG_OP = 'INSERT') then
    update issues set
      pro_count = coalesce(pro_count,0) + (case when NEW.type='pro' then 1 else 0 end),
      con_count = coalesce(con_count,0) + (case when NEW.type='con' then 1 else 0 end)
    where id = NEW.issue_id;
  elsif (TG_OP = 'DELETE') then
    update issues set
      pro_count = greatest(coalesce(pro_count,0) - (case when OLD.type='pro' then 1 else 0 end), 0),
      con_count = greatest(coalesce(con_count,0) - (case when OLD.type='con' then 1 else 0 end), 0)
    where id = OLD.issue_id;
  elsif (TG_OP = 'UPDATE') then
    if NEW.type <> OLD.type or NEW.issue_id <> OLD.issue_id then
      update issues set
        pro_count = greatest(coalesce(pro_count,0) - (case when OLD.type='pro' then 1 else 0 end), 0),
        con_count = greatest(coalesce(con_count,0) - (case when OLD.type='con' then 1 else 0 end), 0)
      where id = OLD.issue_id;
      update issues set
        pro_count = coalesce(pro_count,0) + (case when NEW.type='pro' then 1 else 0 end),
        con_count = coalesce(con_count,0) + (case when NEW.type='con' then 1 else 0 end)
      where id = NEW.issue_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_sync_vote_counts on public.votes;
create trigger trg_sync_vote_counts
  after insert or update or delete on public.votes
  for each row execute function public.sync_issue_vote_counts();

-- ── 기존 데이터 백필(실제 votes → 카운트) ──
update issues i set
  pro_count = (select count(*) from votes v where v.issue_id = i.id and v.type = 'pro'),
  con_count = (select count(*) from votes v where v.issue_id = i.id and v.type = 'con');

-- ── 변경 불가: votes UPDATE 정책 제거(진영 전환 서버단 차단) ──
drop policy if exists "votes update self" on public.votes;
