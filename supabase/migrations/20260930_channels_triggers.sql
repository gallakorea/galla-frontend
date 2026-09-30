-- 광장 채널 근간(2026-09-30): 기본 채널 최소화 + channel_id 자동연결 + post_count 유지.
-- Management API 로 적용. 멱등(재실행 안전).
-- 배경: 재편 후 새 글에 channel_id 를 붙이는 트리거가 없어(insert payload 에도 없음)
--       앞으로 작성되는 글은 channel_id=null 이 될 수 있었다. post_count 도 1회 백필뿐이라 낡음.

-- 1) 기본 채널 재조정 — 레딧식: 핵심 7개만 is_default. 세계·여행/패션·뷰티/19금은
--    기존 글 보존 위해 남기되 is_default=false(레거시·탐색엔 노출, 홈 기본 칩엔 미노출).
--    (js/galla-channels.js 의 DEFAULTS 7종과 일치)
update channels set is_default = false where name in ('세계·여행', '패션·뷰티', '19금');
update channels set is_default = true  where name in
  ('자유·수다', '정치·사회', '경제·투자', '직장·경력', '연애·결혼', '엔터·스포츠', '음식·맛집');

-- 2) 새 글 channel_id 자동 연결 (category 문자열 → channels.id)
create or replace function plaza_link_channel() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if new.channel_id is null and new.category is not null then
    select id into new.channel_id from channels where name = new.category;
  end if;
  return new;
end $$;
drop trigger if exists trg_plaza_link_channel on plaza_posts;
create trigger trg_plaza_link_channel
  before insert or update of category on plaza_posts
  for each row execute function plaza_link_channel();

-- 3) 채널 글 수 유지(insert/delete/채널이동) — plaza_posts 는 hard delete 라 DELETE 로 감소 정확
create or replace function channel_post_count() returns trigger
  language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if new.channel_id is not null then
      update channels set post_count = post_count + 1 where id = new.channel_id;
    end if;
  elsif tg_op = 'DELETE' then
    if old.channel_id is not null then
      update channels set post_count = greatest(0, post_count - 1) where id = old.channel_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if old.channel_id is distinct from new.channel_id then
      if old.channel_id is not null then
        update channels set post_count = greatest(0, post_count - 1) where id = old.channel_id;
      end if;
      if new.channel_id is not null then
        update channels set post_count = post_count + 1 where id = new.channel_id;
      end if;
    end if;
  end if;
  return null;
end $$;
drop trigger if exists trg_channel_post_count on plaza_posts;
create trigger trg_channel_post_count
  after insert or delete or update of channel_id on plaza_posts
  for each row execute function channel_post_count();

-- 4) post_count 정합(현재값 정확히 맞추기)
update channels ch set post_count = (select count(*) from plaza_posts p where p.channel_id = ch.id);
