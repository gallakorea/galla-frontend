-- =========================================================
-- 갈라페이 = 돈이 드나드는 단일 관문
--
--   들어오는 돈 : gc_charges   (충전 → GC 적립)
--   나가는 돈   : gc_refunds   (환불 → GC 회수 + 원화 환급)
--                 withdrawals  (크리에이터 후원 수익 출금)
--
-- 세 테이블은 성격이 달라 하나로 합치지 않는다(합치면 각자의 가드가 흐려진다).
-- 대신 유저에게는 한 줄기 타임라인으로 보여준다 — 그게 "갈라페이 내역"이다.
-- 출금이 나중에 갈라페이로 나가더라도 이 뷰는 그대로 쓴다.
-- =========================================================

create or replace function public.gallapay_history(p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_user uuid := auth.uid();
  v_lim  int  := greatest(1, least(coalesce(p_limit,100), 300));
  v_rows jsonb;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','auth'); end if;

  select coalesce(jsonb_agg(s.j order by s.at desc), '[]'::jsonb) into v_rows
  from (
    -- 💳 충전 (IN)
    select c.created_at as at, jsonb_build_object(
      'kind','charge', 'dir','in', 'id',c.id::text,
      'title', case c.status when 'paid' then '갈라페이 충전'
                             when 'pending' then '충전 대기'
                             else '충전 취소' end,
      'krw', c.krw, 'gc', c.gc, 'status', c.status,
      'channel', c.channel, 'at', c.created_at,
      'receipt', c.status = 'paid'      -- 영수증 볼 수 있는 건
    ) as j
    from gc_charges c where c.user_id = v_user

    union all
    -- ↩️ 환불 (OUT)
    select r.created_at, jsonb_build_object(
      'kind','refund', 'dir','out', 'id',r.id::text, 'ref', r.charge_id::text,
      'title', case r.status when 'requested' then '환불 신청 접수'
                             when 'approved'  then '환불 승인 (환급 처리 중)'
                             when 'done'      then '환불 완료'
                             when 'rejected'  then '환불 거절'
                             else '환불 신청 취소' end,
      'krw', r.krw, 'gc', r.gc, 'status', r.status,
      'note', r.admin_note, 'at', r.created_at, 'receipt', false
    )
    from gc_refunds r where r.user_id = v_user

    union all
    -- 💸 크리에이터 수익 출금 (OUT)
    select w.created_at::timestamptz, jsonb_build_object(
      'kind','withdraw', 'dir','out', 'id',w.id::text,
      'title', case w.status when 'pending' then '출금 신청 접수'
                             when 'paid'    then '출금 완료'
                             when 'done'    then '출금 완료'
                             when 'rejected' then '출금 거절'
                             else '출금 ' || w.status end,
      'krw', w.amount, 'gc', null, 'status', w.status,
      'bank', w.bank, 'at', w.created_at, 'receipt', false
    )
    from withdrawals w where w.user_id = v_user
    order by 1 desc
    limit v_lim
  ) s(at, j);

  return jsonb_build_object('ok', true, 'rows', v_rows);
end $$;

grant execute on function public.gallapay_history(integer) to authenticated;

comment on function public.gallapay_history(integer) is
  '갈라페이 통합 내역 — 충전(in)/환불(out)/출금(out)을 한 타임라인으로. 화면: charges.html';
