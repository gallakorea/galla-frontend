-- 🔒 근본 방어: 닉네임(온보딩) 없으면 '쓰기 활동' 서버에서 거부.
-- 소셜/패스키 신규가 온보딩 모달을 어떻게 우회하든(딥링크·API 직접호출) 활동 불가.
-- 클라 모달은 UX, 이 트리거가 진짜 강제.

-- 온보딩 여부(닉네임 보유) — 로그인 유저 기준
create or replace function public.is_onboarded(uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select nickname is not null and btrim(nickname) <> ''
                   from public.users where id = uid), false);
$$;
grant execute on function public.is_onboarded(uuid) to authenticated, anon;

-- BEFORE INSERT 가드. auth.uid() 없으면(=service_role·크론·마이그레이션 등 시스템 삽입) 통과.
create or replace function public.enforce_onboarded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_onboarded(auth.uid()) then
    raise exception 'onboard_required'
      using errcode = 'P0001', message = '프로필(닉네임)을 먼저 완성해 주세요.', hint = 'onboard_required';
  end if;
  return new;
end $$;

-- 대상: 콘텐츠 생성 + 댓글 + 투표 + 베팅 + 전투 + 좋아요(참여성 쓰기 전반)
do $$
declare t text;
  tabs text[] := array[
    'comments','plaza_comments','market_comments','galla_news_comments','video_comments',
    'comment_actions','comment_likes','plaza_comment_votes','issue_likes',
    'market_comment_likes','galla_news_comment_likes','video_comment_likes',
    'issues','plaza_posts',
    'votes','plaza_votes','duel_votes',
    'predict_bets','duel_cheer_bets','duels','duel_cheers',
    'dm_messages'
  ];
begin
  foreach t in array tabs loop
    if to_regclass('public.'||t) is not null then
      execute format('drop trigger if exists trg_enforce_onboarded on public.%I', t);
      execute format('create trigger trg_enforce_onboarded before insert on public.%I
                      for each row execute function public.enforce_onboarded()', t);
    end if;
  end loop;
end $$;
