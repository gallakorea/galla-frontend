-- 📏 댓글 길이 서버 강제 — 클라 우회(직접 REST 호출)로 초장문 저장이 가능했다(2026-08-08 QA: 5,005자 저장).
-- 스토리지·렌더 비용 폭탄 + 도배 벡터라 서버에서 막는다. 기존 초과분은 잘라 정리.
update comments set content = left(content, 1000) where length(content) > 1000;
update plaza_comments set body = left(body, 1000) where length(body) > 1000;

alter table public.comments
  drop constraint if exists comments_content_len,
  add constraint comments_content_len check (char_length(content) <= 1000);

alter table public.plaza_comments
  drop constraint if exists plaza_comments_body_len,
  add constraint plaza_comments_body_len check (char_length(body) <= 1000);
