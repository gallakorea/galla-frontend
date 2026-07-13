-- 🔮 예측 마켓 자동생성/정리 (봇 전용, 서비스롤에서만)

-- 봇 생성: create_market은 auth.uid() 필수라 서비스롤에서 못 씀 → 창작자 명시 버전.
-- 이진(예/아니오) 마켓만 생성. CPMM 초기 풀 = liquidity.
create or replace function public.admin_create_market(
  p_question text, p_description text, p_category text, p_close_at timestamptz,
  p_creator uuid default '96bf8931-113c-40cf-93ad-ebaec2d06267'::uuid,
  p_liquidity double precision default 1000
) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_liq double precision := greatest(coalesce(p_liquidity, 1000), 100);
begin
  if p_question is null or length(trim(p_question)) = 0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at <= now() then raise exception 'close_at must be future'; end if;
  insert into markets (question, description, category, image_url, created_by, close_at, market_type, pool_yes, pool_no)
  values (trim(p_question), p_description, p_category, null, p_creator, p_close_at, 'binary', v_liq, v_liq)
  returning id into v_id;
  insert into market_outcomes (market_id, label, sort_order, pool_yes, pool_no)
  values (v_id, '예/아니오', 0, v_liq, v_liq);
  return v_id;
end $$;

-- 전체 예측 마켓 정리(자식 행 포함). 서비스롤/관리자만.
create or replace function public.admin_wipe_markets()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from markets;
  delete from market_comment_likes;
  delete from market_comments;
  delete from market_reactions;
  delete from market_bookmarks;
  delete from market_trades;
  delete from market_positions;
  delete from market_outcomes;
  delete from markets;
  return n;
end $$;

revoke all on function public.admin_create_market(text,text,text,timestamptz,uuid,double precision) from anon, authenticated;
revoke all on function public.admin_wipe_markets() from anon, authenticated;
