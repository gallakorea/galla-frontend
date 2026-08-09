-- 🩹 오버로드 함정 수정 — GP 충전이 안 막혀 있었다 (2026-08-09)
--
--  20260809340000에서 charge_confirm을 무력화하려고 create or replace를 썼는데,
--  원본 인자가 uuid인 걸 bigint로 잘못 적었다. 그러면 '교체'가 아니라 **오버로드 추가**다.
--  원본 charge_confirm(uuid,text,text)은 그대로 살아서 GP 충전이 계속 가능했다.
--
--  ⚠️ create or replace function은 이름이 아니라 (이름 + 인자 목록)으로 대상을 찾는다.
--     인자 하나만 달라도 새 함수가 생긴다. 바꾸기 전에 pg_get_functiondef로 시그니처를 확인해라.

drop function if exists public.charge_confirm(bigint, text, text);

create or replace function public.charge_confirm(p_charge_id uuid, p_pg_provider text default null, p_pg_tx text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
begin
  -- GP는 판매하지 않는다. 예측 판돈으로 쓰이는 재화라, 팔면 '돈으로 사서 결과에 건다'가 되어
  -- 규제 대상이 된다. 충전은 GC로만 받는다. ⚠️ 되살리지 마라.
  return jsonb_build_object('ok', false, 'reason', 'gp_charge_discontinued',
    'message', 'GP는 판매하지 않습니다. 충전은 GC로만 가능합니다.');
end $$;
