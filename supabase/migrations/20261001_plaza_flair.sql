-- 광장 채널 말머리(flair) — 범용 5종 중 실제 저장값 4종(전체=값없음/null)
-- 전체 / 정보 / 질문 / 후기 / 잡담  →  null / 정보 / 질문 / 후기 / 잡담
alter table plaza_posts add column if not exists flair text;

alter table plaza_posts drop constraint if exists plaza_posts_flair_chk;
alter table plaza_posts add constraint plaza_posts_flair_chk
  check (flair is null or flair in ('정보','질문','후기','잡담'));

-- 채널방 말머리 필터 가속
create index if not exists idx_plaza_posts_channel_flair
  on plaza_posts(channel_id, flair) where channel_id is not null;

-- 컬럼 권한 함정 방어: 새 컬럼도 읽기/쓰기 가능하게 명시 grant
grant select (flair) on plaza_posts to anon, authenticated;
grant insert (flair), update (flair) on plaza_posts to authenticated;
