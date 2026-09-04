-- 🍜 "이 식당은 어딜까요?" — 남은 매칭을 사용자 참여로 푼다.
--
-- 왜: 자동 매칭의 한계선이 실측으로 확정됐다(2026-09-04).
--   이름 매칭 13,271건→135건 · 카탈로그 2.4배→+14건 · 웹문서 역추적→0건 + 거짓말 사고 1건.
--   설명에 상호도 주소도 없는 채널은 공식 API 로 못 푼다. 그렇다고 2만 편을 사람이 볼 수도 없다.
--   → 영상을 보여주고 **"이 식당 어디게?"** 로 묻는다. 노동이 아니라 놀이가 된다.
--
-- 🔴 '누가 갔나'가 거짓말이 되면 이 서비스는 끝이다. 그래서 답을 그대로 믿지 않는다:
--   ① 답은 **네이버 지역검색을 통과한 실제 가게**만 낼 수 있다(자유 입력이 아니다).
--   ② **서로 다른 두 사람 이상**이 같은 집을 대야 채택된다. 한 명 말로는 안 박는다.
--   ③ 채택 전까지는 화면에 안 나온다.
-- 보상은 **채택될 때만** 준다 — 아무 답이나 던지는 게 이득이 되면 안 된다.

create table if not exists food_quiz_answers (
  id          uuid primary key default gen_random_uuid(),
  video_id    text not null,
  channel     text not null references food_channels(slug),
  place_id    uuid not null references food_places(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rewarded    boolean not null default false,
  created_at  timestamptz not null default now()
);
-- 한 사람이 한 영상에 같은 집을 두 번 대지 못한다(자기 자신과 '합의'하는 걸 막는다)
create unique index if not exists food_quiz_uk on food_quiz_answers(video_id, place_id, user_id);
create index if not exists food_quiz_vp on food_quiz_answers(video_id, place_id);
create index if not exists food_quiz_user on food_quiz_answers(user_id, created_at desc);

alter table food_quiz_answers enable row level security;
-- 남의 답은 못 본다 — 보이면 베껴서 '합의'를 만들 수 있다
create policy food_quiz_own on food_quiz_answers for select using (user_id = auth.uid());

/* 다음 문제 — 아직 가게가 안 붙은 회차형 영상.
   ⚠️ 이미 낸 답이 있는 영상은 그 사람에게 다시 안 준다. */
create or replace function public.food_quiz_next(p_limit integer default 1)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'video_id', video_id, 'title', title, 'channel', channel,
           'channel_name', cname, 'region', region) order by score desc, published_at desc), '[]'::jsonb)
    from (
      select v.video_id, v.title, v.channel, c.name cname, v.region, v.published_at,
             (case when v.title ~ 'EP\.?[0-9]|[0-9]+화|특집' then 3 else 0 end
            + case when v.title ~ '맛집|식당|먹방|투어|털었|가야|추천|골목|노포' then 2 else 0 end
            + case when coalesce(v.region,'') <> '' then 2 else 0 end
            + least(length(coalesce(v.title,'')) / 15, 2)) score
        from food_videos v
        join food_channels c on c.slug = v.channel and c.active
       where v.harvested_at is null
         and not exists (select 1 from food_place_sources s where s.video_id = v.video_id)
         and not exists (select 1 from food_quiz_answers a
                          where a.video_id = v.video_id and a.user_id = auth.uid())
       order by score desc, random()          -- 같은 문제만 몰리지 않게 섞는다
       limit greatest(coalesce(p_limit, 1), 1)
    ) q
   where score >= 5;                          -- 쇼츠 클립은 문제로 못 낸다. 봐도 가게가 안 나온다
$$;

/* 답 제출. place_id 는 이미 우리 DB에 있는(=네이버를 통과한) 가게여야 한다. */
create or replace function public.submit_food_quiz(
  p_video_id text, p_channel text, p_place_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_today int; v_agree int; v_title text; v_at timestamptz;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','login'); end if;
  if not exists (select 1 from food_places where id = p_place_id and status = 'live')
     or not exists (select 1 from food_videos where video_id = p_video_id and channel = p_channel)
  then return jsonb_build_object('ok',false,'reason','bad_input'); end if;

  select count(*) into v_today from food_quiz_answers
   where user_id = v_uid and created_at > now() - interval '1 day';
  if v_today >= 30 then return jsonb_build_object('ok',false,'reason','daily_limit'); end if;

  insert into food_quiz_answers(video_id, channel, place_id, user_id)
  values (p_video_id, p_channel, p_place_id, v_uid)
  on conflict do nothing;

  /* 서로 다른 사람 둘이 같은 집을 대면 채택한다 */
  select count(distinct user_id) into v_agree
    from food_quiz_answers where video_id = p_video_id and place_id = p_place_id;
  if v_agree < 2 then
    return jsonb_build_object('ok',true,'agreed',v_agree,'accepted',false);
  end if;

  select title, published_at into v_title, v_at
    from food_videos where video_id = p_video_id and channel = p_channel;
  insert into food_place_sources(place_id, channel, video_id, video_title, aired_at)
  values (p_place_id, p_channel, p_video_id, left(v_title, 200), v_at)
  on conflict do nothing;

  /* 채택된 답을 낸 사람 전원에게 한 번씩 — 던지기가 이득이 되면 안 되므로 채택 시에만 준다 */
  with w as (
    update food_quiz_answers set rewarded = true
     where video_id = p_video_id and place_id = p_place_id and not rewarded
    returning user_id)
  insert into point_ledger(user_id, delta, reason)
  select user_id, 100, 'food_quiz' from w;
  insert into point_balances(user_id)
  select distinct user_id from food_quiz_answers
   where video_id = p_video_id and place_id = p_place_id
  on conflict (user_id) do nothing;
  update point_balances b set balance = balance + 100, updated_at = now()
    from (select distinct user_id from food_quiz_answers
           where video_id = p_video_id and place_id = p_place_id and rewarded) x
   where b.user_id = x.user_id;

  return jsonb_build_object('ok',true,'agreed',v_agree,'accepted',true,'reward',100);
end $$;

revoke all on function public.submit_food_quiz(text, text, uuid) from public, anon;
grant execute on function public.submit_food_quiz(text, text, uuid) to authenticated;
revoke all on function public.food_quiz_next(integer) from public, anon;
grant execute on function public.food_quiz_next(integer) to authenticated;
