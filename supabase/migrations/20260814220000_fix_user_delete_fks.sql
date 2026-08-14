-- =========================================================
-- 회원 삭제가 깨져 있던 문제 — auth.users 참조 FK 정리
--
-- 실측한 증상: 계정 삭제가 HTTP 500(23503)으로 실패한다.
--   "notifications_from_user_fkey" 위반.
--   좋아요·댓글·팔로우를 한 번이라도 하면 알림이 생기므로
--   사실상 활동한 유저 전원이 삭제 불가였다.
--   관제센터 회원삭제·본인 탈퇴가 같은 경로라 둘 다 깨져 있었다.
--
--   부작용: public.users 에는 auth.users 로 향하는 FK 자체가 없어서,
--   과거 삭제들이 절반만 진행돼 껍데기 행 64건이 쌓여 있었다.
--
-- ── 원칙 ────────────────────────────────────────────────
--   ① 알림 = 발신자가 사라지면 의미가 없다 → CASCADE
--   ② 콘텐츠(광장 글·댓글) = 남긴다. 작성자만 끊는다 → SET NULL
--      탈퇴했다고 스레드에 구멍을 내면 남은 사람들의 대화가 망가진다.
--   ③ 금전 기록(후원·충전) = 남긴다. 개인 식별자만 끊는다 → SET NULL
--      거래 내역은 보존해야 하지만, 그 보존이 삭제를 막을 이유는 아니다.
--
-- ⚠️ 삭제 전 전수 카운트함(고아 64건):
--    이슈·댓글·글·광장·투표·포인트·결제 전부 0건,
--    CASCADE 로 딸려갈 12개 테이블도 전부 0건 — 순수 껍데기다.
-- =========================================================

/* ① 알림 — 발신자 삭제 시 같이 지운다 */
alter table public.notifications
  drop constraint if exists notifications_from_user_fkey;
alter table public.notifications
  add  constraint notifications_from_user_fkey
  foreign key (from_user) references auth.users(id) on delete cascade;

/* ② 광장 콘텐츠 — 글·댓글은 남기고 작성자만 끊는다 */
alter table public.plaza_posts
  drop constraint if exists plaza_posts_user_id_fkey;
alter table public.plaza_posts
  add  constraint plaza_posts_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.plaza_comments
  drop constraint if exists plaza_comments_user_id_fkey;
alter table public.plaza_comments
  add  constraint plaza_comments_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

/* ③ 금전 기록 — 내역은 남기고 사람만 끊는다.
      gp_purchases.user_id 는 NOT NULL 이었다(현재 0행이라 완화 비용 없음). */
alter table public.author_supports
  drop constraint if exists author_supports_user_id_fkey;
alter table public.author_supports
  add  constraint author_supports_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

alter table public.author_supports
  drop constraint if exists author_supports_author_id_fkey;
alter table public.author_supports
  add  constraint author_supports_author_id_fkey
  foreign key (author_id) references auth.users(id) on delete set null;

alter table public.gp_purchases alter column user_id drop not null;
alter table public.gp_purchases
  drop constraint if exists gp_purchases_user_id_fkey;
alter table public.gp_purchases
  add  constraint gp_purchases_user_id_fkey
  foreign key (user_id) references auth.users(id) on delete set null;

/* ④ 껍데기 행 정리 + 재발 방지.
      public.users 에 auth.users 로의 FK 가 없어서 고아가 쌓였다.
      정리한 뒤 CASCADE FK 를 걸어 구조적으로 막는다. */
delete from public.users u
 where not exists (select 1 from auth.users a where a.id = u.id);

alter table public.users
  drop constraint if exists users_id_auth_fkey;
alter table public.users
  add  constraint users_id_auth_fkey
  foreign key (id) references auth.users(id) on delete cascade;

comment on constraint users_id_auth_fkey on public.users is
  '계정 삭제가 users 행까지 확실히 지우게 한다 — 이게 없어서 껍데기 64건이 쌓였다.';
