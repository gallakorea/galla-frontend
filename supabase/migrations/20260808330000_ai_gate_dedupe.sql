-- 🧹 ai_gate 오버로드 제거 — '고쳤는데 일부만 고쳐지는' 함정 (2026-08-08)
--
--  ai_gate가 두 벌 존재했다:
--    (p_fn, p_subject, p_n)                    ← 옛 버전, 예산 하드스톱 없음
--    (p_fn, p_subject, p_n, p_limit_override)  ← 현재 버전
--  PostgREST는 **보낸 인자 이름 집합으로 오버로드를 고른다.** galla-friend는 4개를 보내
--  새 버전을 타지만, 창작 3종(generate-thumbnail/sticker/video)은 3개만 보내서
--  **옛 버전을 타고 있었다.** 창 제한은 옛 버전도 하므로 당장 뚫린 건 아니지만,
--  앞으로 ai_gate를 고쳐도 창작 경로엔 반영되지 않는다 — 실제로 예산 하드스톱이 그렇게 빠졌다.
--
--  4-인자 버전은 p_limit_override에 기본값이 있어 3개만 보내도 정상 해석된다.
--  ⚠️ 이 코드베이스에서 함수 시그니처를 바꿀 땐 항상 옛 시그니처를 drop 할 것.
--     create or replace는 인자가 다르면 '교체'가 아니라 '추가'다.

drop function if exists public.ai_gate(text, text, integer);
