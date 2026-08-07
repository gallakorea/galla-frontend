-- ⚡ 원장 인덱스 — point_ledger는 idx_scan 0(전량 seq scan). 지금은 473행이라 싸지만
--    GP 거래는 투표·미션·베팅마다 쌓여 수백만 행이 된다. 커지기 전에 넣는 게 훨씬 싸다.
create index if not exists point_ledger_user_created_idx on public.point_ledger (user_id, created_at desc);
create index if not exists gc_ledger_user_created_idx on public.gc_ledger (user_id, created_at desc);
create index if not exists predict_bets_user_idx on public.predict_bets (user_id);
create index if not exists predict_bets_market_idx on public.predict_bets (market_id, settled);
analyze public.point_ledger;
analyze public.gc_ledger;
analyze public.predict_bets;
