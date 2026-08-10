-- 🎬→📦 영상 R2 이관 — 원본 주소 보관 (2026-08-09)
--
--  Stream은 시청 1,000분당 $1이라 재생이 늘수록 요금이 비례한다(무료 기능인데도).
--  R2는 egress가 무료라 같은 트래픽이 $0다. HLS 세그먼트를 그대로 미러링해 옮긴다.
--
--  ⚠️ 원본 주소를 지우지 않고 남긴다. 미러가 잘못됐을 때 되돌릴 유일한 길이다.
--     Stream에서 실제로 삭제하는 건 한동안 지켜본 뒤에 한다 — 지우면 못 되돌린다.

alter table public.issues add column if not exists video_url_stream text;
alter table public.posts  add column if not exists video_url_stream text;

comment on column public.issues.video_url_stream is
  '이관 전 Cloudflare Stream 주소(롤백용). video_url이 R2로 바뀐 뒤에도 남긴다';
