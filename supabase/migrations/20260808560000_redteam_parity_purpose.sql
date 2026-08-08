-- infra-stream-parity의 목적은 '스트리밍 경로에도 가드가 걸리는가'(동치성)다.
-- 품질 기준(물음표 비율)은 quality-closing-brake가 이미 0.4로 검사하므로 중복 제거 —
-- 같은 지표를 두 곳에서 재면 확률적 실패가 두 배로 뜬다.
update public.redteam_cases set assertions =
 '[{"t":"require_guard","g":"noAsk","turn":"any","why":"스트리밍 경로에서도 브레이크가 실제로 걸려야 한다"},
   {"t":"deny_empty"}]'::jsonb
 where code = 'infra-stream-parity';
