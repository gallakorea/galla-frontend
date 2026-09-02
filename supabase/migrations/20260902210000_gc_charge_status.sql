-- 💳 gc_charge_status — 결제 후 '내 충전 건'의 상태만 확인한다.
--
-- 왜 필요한가: 결제창이 성공으로 닫혀도 웹훅은 몇 초 늦게 온다.
-- 그 사이 지갑이 그대로면 사용자는 "돈만 나갔다"고 받아들인다.
-- 클라가 짧게 폴링해 'paid'가 되는 순간을 잡기 위한 최소 조회구다.
--
-- ⚠️ 지급 권한은 없다. 상태를 '읽기만' 한다 — 지급은 오직 gc_charge_confirm(service_role)이다.
-- ⚠️ 본인 건만 본다. 남의 charge_id 를 넣어도 not_found 로 떨어진다.
create or replace function public.gc_charge_status(p_charge_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); c gc_charges%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select * into c from gc_charges where id = p_charge_id and user_id = v_uid;
  if c.id is null then return jsonb_build_object('ok',false,'reason','not_found'); end if;
  return jsonb_build_object('ok',true,'status',c.status,'gc',c.gc,'krw',c.krw);
end $$;

revoke all on function public.gc_charge_status(uuid) from public, anon;
grant execute on function public.gc_charge_status(uuid) to authenticated;
