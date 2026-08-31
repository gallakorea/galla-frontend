/* 개인정보처리방침 §6-1: "AI가 만든 뉴스 요약·예측 문항·이미지에는 AI 생성물임을 표시합니다".
   갈라뉴스 리더에는 '갈라뉴스 · AI 종합' 배지와 고지문이 있는데 예측 문항엔 아무것도 없었다.
   285개 중 245개가 LLM 이 쓴 것이다(admin_create_market — generate-predict-markets 만 호출).
   '🔥 이슈 승패:' 39개는 사람이 쓴 이슈 제목으로 만드는 템플릿이라 표시 대상이 아니다. */
alter table public.markets add column if not exists ai_generated boolean not null default false;
CREATE OR REPLACE FUNCTION public.admin_create_market(p_question text, p_description text, p_category text, p_close_at timestamp with time zone, p_creator uuid DEFAULT '96bf8931-113c-40cf-93ad-ebaec2d06267'::uuid, p_liquidity double precision DEFAULT 300, p_is_jackpot boolean DEFAULT false, p_jackpot double precision DEFAULT 0)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id bigint; v_seed double precision := greatest(coalesce(p_liquidity,300),0);
begin
  perform _require_admin_or_service();   -- 🔒 이중 게이트 (2026-07-16 보안 감사)
  if p_question is null or length(trim(p_question))=0 then raise exception 'question required'; end if;
  if p_close_at is null or p_close_at<=now() then raise exception 'close_at must be future'; end if;
  insert into markets(question,description,category,image_url,created_by,close_at,market_type,
     pool_yes,pool_no,total_pool,is_jackpot,jackpot_bonus,min_stake,max_stake,rake_bps,status,ai_generated)
   values(trim(p_question),p_description,p_category,null,p_creator,p_close_at,'binary',
     v_seed,v_seed,v_seed*2,p_is_jackpot,coalesce(p_jackpot,0),10,1000000,0,'open',true)
   returning id into v_id;
  insert into market_outcomes(market_id,label,sort_order,pool_yes,pool_no,pool_gp,bettor_count)
   values (v_id,'예',0,v_seed,v_seed,v_seed,0),
          (v_id,'아니오',1,v_seed,v_seed,v_seed,0);
  return v_id;
end $function$
;
update markets m set ai_generated = true
  from users u
 where u.id = m.created_by and u.nickname = '갈라'
   and m.question not like '🔥 이슈 승패:%'
   and m.ai_generated = false;
