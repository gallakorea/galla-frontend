-- 🔔 알림음·벨소리 고르기(26.9.20 사장님: 「소리 유형을 다양하게 — 사용자가 선택할 수 있게」)
-- 값은 소리 이름 그대로(galla/space/warp/laser/arcade/pager/bell/boing/quack).
-- 앱 번들의 파일 이름과 1:1 로 이어지므로, 서버·클라·네이티브가 같은 낱말을 쓴다.
alter table public.notify_prefs
  add column if not exists alert_sound text not null default 'galla',
  add column if not exists ring_sound  text not null default 'galla';

-- 모르는 값이 들어오면 발송 때 파일을 못 찾아 무음이 된다 — 아는 이름만 받는다.
alter table public.notify_prefs drop constraint if exists notify_prefs_alert_sound_chk;
alter table public.notify_prefs add constraint notify_prefs_alert_sound_chk
  check (alert_sound in ('galla','space','warp','laser','arcade','pager','bell','boing','quack'));
alter table public.notify_prefs drop constraint if exists notify_prefs_ring_sound_chk;
alter table public.notify_prefs add constraint notify_prefs_ring_sound_chk
  check (ring_sound in ('galla','space','retro'));

comment on column public.notify_prefs.alert_sound is '푸시 알림음 선택(파일 이름과 동일)';
comment on column public.notify_prefs.ring_sound is '전화 벨소리 선택(파일 이름과 동일)';
