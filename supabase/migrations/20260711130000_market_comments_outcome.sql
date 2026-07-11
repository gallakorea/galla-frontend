-- 다중 선택지 마켓 댓글이 어느 후보(outcome)에 대한 긍정/부정인지 기록
-- 예: "손흥민 긍정", "홀란드 부정". 단일(binary) 마켓은 그대로 YES/NO.
alter table public.market_comments add column if not exists outcome_id bigint;
