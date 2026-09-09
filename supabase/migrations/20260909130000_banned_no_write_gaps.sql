-- 밴 계정 쓰기 차단 구멍 4곳 — QA 0909 에서 실측으로 발견.
-- secret_mailbox(삐삐)는 밴 상태에서 남에게 메시지가 실제로 발송됐다(가장 큰 구멍).
-- 나머지 셋은 집계(좋아요·밀어주기·반응·여행투표)에 영향을 준다.
-- ⚠️ PERMISSIVE 는 OR 로 합쳐지므로 반드시 RESTRICTIVE 로 건다.
do $$
declare t text;
begin
  foreach t in array array['secret_mailbox','issue_likes','author_supports','market_reactions','travel_votes'] loop
    if to_regclass('public.'||t) is null then continue; end if;
    execute format('drop policy if exists banned_no_write on public.%I', t);
    execute format('create policy banned_no_write on public.%I as restrictive for insert to authenticated with check (not _me_banned())', t);
  end loop;
end $$;
