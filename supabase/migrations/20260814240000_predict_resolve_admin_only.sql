-- =========================================================
-- 🚨 예측 자기정산 구멍 — 발의자 수동 정산 제거
--
-- 실측한 경로:
--   ① create_market 은 authenticated 누구나 호출할 수 있다(js/galla-predict.js).
--   ② predict_resolve 는 `m.created_by = v_user` 면 통과했다.
--   ③ predict-market.js 는 발의자에게 정산 버튼을 그대로 노출했다.
--
--   → 마켓을 만든다 → 남들이 베팅해 상금 풀이 쌓인다 →
--     자기가 건 쪽으로 '적중' 정산해 풀을 통째로 가져간다.
--     파리뮤추얼이라 실제 GP 가 그대로 옮겨간다. 탈취다.
--
--   구 CPMM 경로인 market_resolve 는 더 심했다 —
--   관리자 검사 없이 `created_by <> v_user` 만 봤다(발의자 전용).
--
-- ── 조치 ────────────────────────────────────────────────
--   두 함수 모두 관리자 전용으로 좁힌다.
--   마감 후 정산은 predict-auto-resolve 크론이 AI로 이미 자동 처리하므로
--   발의자 수동 정산은 애초에 필요 없는 권한이었다.
--
--   ⚠️ `v_user is null` 분기는 유지한다 — 그 크론이 service_role 로 돌아
--      auth.uid() 가 null 이다. 이걸 지우면 자동 정산이 죽는다.
--      (predict-auto-resolve/index.ts 가 SUPABASE_SERVICE_ROLE_KEY 사용함을 확인)
--
--   프론트도 같이 좁혔다(js/predict-market.js) — 다만 그건 노출 제어일 뿐이고,
--   진짜 방어선은 이 함수다. RPC 는 직접 호출할 수 있다.
--
-- 이 파일은 기록용이다. 운영에는 pg_get_functiondef 로 뽑은 원본에서
-- 가드 라인만 치환해 적용했다(본문이 길어 전문 재작성 시 표류 위험).
-- 적용 후 검증: 두 함수 모두 created_by 분기 없음 / _is_admin 존재 / anon 호출 불가.
-- =========================================================

-- predict_resolve — 변경된 가드(적용된 형태)
--   이전: if not ((v_user is null) or _is_admin() or (m.created_by = v_user)) then
--   이후: if not ((v_user is null) or _is_admin()) then

-- market_resolve — 변경된 가드(적용된 형태)
--   이전: if m.created_by <> v_user then ... forbidden
--   이후: if not _is_admin() then ... forbidden

do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('predict_resolve','market_resolve')
       and p.prosrc ~* 'created_by\s*(=|<>)\s*v_user'
  ) then
    raise exception '발의자 정산 분기가 아직 남아 있다 — 자기정산 구멍이 열려 있는 상태다';
  end if;
end $$;
