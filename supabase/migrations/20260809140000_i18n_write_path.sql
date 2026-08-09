-- 🌍 국제화 2단계 — 쓰기 경로에 언어를 각인한다 (2026-08-09)
--
--  1단계에서 locale 컬럼을 만들었지만 기본값이 'ko'라, 영어권 유저가 쓴 글도 'ko'로 저장된다.
--  **읽기 필터는 나중에 넣어도 되지만 쓰기 각인은 소급이 불가능하다** — 지나간 글의
--  '작성자가 어떤 언어였는지'는 되살릴 수 없다. 그래서 이걸 먼저 한다.
--
--  ⚠️ 클라이언트 60여 곳을 고치지 않는다. 트리거 한 곳에서 처리한다 —
--     호출부를 고치는 방식은 새 화면이 생길 때마다 빠뜨린다(이 코드베이스에서 반복된 실패).

create or replace function public.stamp_locale()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_loc text;
begin
  -- 이미 명시적으로 넣었으면 존중한다(예: 번역 콘텐츠를 특정 언어로 적재하는 경우)
  if new.locale is not null and new.locale <> 'ko' then return new; end if;

  -- 작성자 우선순위: 행의 user_id/author_id → 현재 인증 사용자
  begin
    v_uid := coalesce(
      (to_jsonb(new) ->> 'user_id')::uuid,
      (to_jsonb(new) ->> 'author_id')::uuid,
      auth.uid());
  exception when others then v_uid := auth.uid();
  end;

  if v_uid is not null then
    select nullif(u.locale, '') into v_loc from users u where u.id = v_uid;
  end if;

  new.locale := coalesce(v_loc,
                (select v ->> 'default' from app_settings where k = 'locales'), 'ko');
  return new;
end $$;

-- 유저가 만드는 콘텐츠에만 건다. 수집형(뉴스·유튜브)은 수집기가 소스 언어를 직접 넣어야 한다
-- (수집한 한국 뉴스를 영어권 유저가 담았다고 'en'으로 찍으면 안 된다).
do $$
declare t text;
begin
  foreach t in array array['issues','posts','plaza_posts','comments'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists trg_%s_locale on public.%I', t, t);
      execute format('create trigger trg_%s_locale before insert on public.%I
                      for each row execute function public.stamp_locale()', t, t);
    end if;
  end loop;
end $$;

-- 📥 수집형 콘텐츠는 '소스의 언어'다 — 수집기가 명시할 때까지 한국 소스이므로 ko가 맞다.
--    해외 소스를 붙이는 순간 collect-* 함수가 locale을 직접 넣어야 한다(주석으로 남긴다).
comment on column public.news_articles.locale is
  '소스 언어. 수집기(collect-rss-news 등)가 직접 넣는다 — 유저 언어가 아니다.';
comment on column public.youtube_hot.locale is
  '소스 언어/지역. 수집기(collect-youtube-hot)가 직접 넣는다 — 유저 언어가 아니다.';

-- 🔎 읽기 필터용 헬퍼 — 호출부가 각자 규칙을 만들면 또 갈린다.
--    "내 언어 + 언어 무관(공용)" 을 함께 보여주는 게 기본 정책이다.
create or replace function public.visible_locales(p_locale text default null)
returns text[] language sql stable as $$
  select array[coalesce(nullif(p_locale, ''), 'ko')]::text[];
$$;

-- 👤 유저가 언어를 바꾸는 공식 경로(클라이언트가 users를 직접 update하지 못하게)
create or replace function public.set_my_locale(p_locale text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_ok boolean;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'reason', 'auth'); end if;
  select (v -> 'enabled') ? p_locale into v_ok from app_settings where k = 'locales';
  if not coalesce(v_ok, false) then
    return jsonb_build_object('ok', false, 'reason', 'unsupported', 'locale', p_locale);
  end if;
  update users set locale = p_locale where id = auth.uid();
  return jsonb_build_object('ok', true, 'locale', p_locale);
end $$;
grant execute on function public.set_my_locale(text) to authenticated;
