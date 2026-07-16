-- gp_wallet: STABLE 함수인데 INSERT를 포함해 PostgREST 읽기전용 tx에서 에러 →
-- 잔액이 있는 유저도 상세 페이지에서 0 GP로 표시되던 버그. 순수 읽기로 교체(행 없으면 0).
create or replace function public.gp_wallet()
returns jsonb language sql stable security definer set search_path=public as $$
  select case when auth.uid() is null
    then jsonb_build_object('ok',false,'reason','unauthorized')
    else (
      select jsonb_build_object('ok',true,
        'free',  coalesce(pb.balance,0),
        'paid',  coalesce(pb.paid_balance,0),
        'total', coalesce(pb.balance,0)+coalesce(pb.paid_balance,0))
      from (select 1) _ left join point_balances pb on pb.user_id = auth.uid()
    )
  end
$$;
