/* 스티커 생성이 실패하면 **GC 를 차감해놓고 GP 로 돌려주고 있었다.**

   실측(2026-09-02, 롤백 시뮬):
     ai_sticker_charge(1)  → gc_balances 50,000 → 49,850 (GC 150 차감)
     ai_sticker_refund(…)  → gc_balances 49,850 **그대로**, point_balances 만 +150

   GC 는 충전(현금성)이고 GP 는 활동 포인트다. 생성 실패는 우리 잘못인데
   유저는 **유료 재화를 잃고 무상 재화를 받는다** — 결제 분쟁·심사에서 걸릴 자리다.

   같은 계열인 창작 대행은 이미 제대로 돼 있다:
     ai_creation_charge → gc_balances 차감
     ai_creation_refund → gc_balances 환불 + gc_ledger('ai_creation:refund')
   옛 흔적으로 point_ledger 에 'ai_creation:refund' 3건(600GP)이 남아 있는 걸 보면,
   창작 대행은 GP 환불 → GC 환불로 고쳤는데 **스티커만 안 고쳤다.**
   (원래 주석의 "유료 충전분 되살리기는 결제 정합성이 복잡하다"는 걱정은
    창작 대행에서 gc_ledger 로 이미 해결된 문제다.)

   → 차감한 재화로 돌려준다. 원장도 gc_ledger 에 남긴다. */

create or replace function public.ai_sticker_refund(p_user uuid, p_amount integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_amount is null or p_amount <= 0 then return; end if;
  update gc_balances set balance = balance + p_amount, updated_at = now() where user_id = p_user;
  if not found then
    insert into gc_balances(user_id, balance) values (p_user, p_amount)
      on conflict (user_id) do update set balance = gc_balances.balance + p_amount, updated_at = now();
  end if;
  insert into gc_ledger(user_id, delta, reason) values (p_user, p_amount, 'ai_sticker:refund');
end $function$;
