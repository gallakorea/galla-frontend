-- 🪪 닉네임 유니크 — "갈라가 둘"이라 삐삐 수신 오진까지 갔던 문제의 뿌리를 막는다
--
-- 원칙:
-- · 서버가 강제한다(클라 검증만으론 REST 직접 호출로 우회된다)
-- · 비교는 '보이는 대로' — 대소문자·앞뒤공백·중간 연속공백 무시(Galla / galla / 갈  라 동일 취급)
-- · 기존 중복은 뒤에 만든 계정에 접미사를 붙여 해소(먼저 쓴 사람이 원본 유지)
-- · 빈 닉네임은 유니크 대상에서 제외(가입 직후 미설정 상태 허용)

-- 정규화 함수 — 인덱스와 검사에서 같은 규칙을 쓴다
create or replace function public.nick_norm(p text)
returns text language sql immutable strict as $$
  select lower(regexp_replace(btrim(p), '\s+', ' ', 'g'))
$$;

-- ── 기존 중복 해소: 나중 계정에 -2, -3… ──
do $$
declare r record; n int; cand text;
begin
  for r in
    select id, nickname,
           row_number() over (partition by nick_norm(nickname) order by created_at, id) as rn
      from users
     where nickname is not null and btrim(nickname) <> ''
  loop
    if r.rn > 1 then
      n := r.rn; 
      loop
        cand := r.nickname || '-' || n;
        exit when not exists (select 1 from users u where nick_norm(u.nickname) = nick_norm(cand));
        n := n + 1;
      end loop;
      update users set nickname = cand where id = r.id;
      raise notice '닉네임 중복 해소: % → %', r.nickname, cand;
    end if;
  end loop;
end $$;

-- ── 유니크 인덱스(정규화 기준, 빈 값 제외) ──
create unique index if not exists users_nickname_norm_uniq
  on public.users (nick_norm(nickname))
  where nickname is not null and btrim(nickname) <> '';

-- ── 형식 검증 트리거: 길이 2~12, 허용 문자, 예약어 차단 ──
create or replace function public._check_nickname()
returns trigger language plpgsql as $$
declare v text := btrim(coalesce(new.nickname, ''));
begin
  if v = '' then return new; end if;                    -- 미설정은 통과
  if tg_op = 'UPDATE' and nick_norm(v) = nick_norm(coalesce(old.nickname, '')) then
    new.nickname := v; return new;                      -- 대소문자만 바꾸는 건 허용
  end if;
  if char_length(v) < 2 or char_length(v) > 12 then
    raise exception 'nickname_length' using hint = '닉네임은 2~12자여야 합니다';
  end if;
  if v !~ '^[가-힣a-zA-Z0-9_.\-]+$' then
    raise exception 'nickname_charset' using hint = '한글·영문·숫자와 _ . - 만 쓸 수 있어요';
  end if;
  if nick_norm(v) in ('admin','관리자','운영자','갈라운영','galla','시스템','system','공식','official') then
    raise exception 'nickname_reserved' using hint = '사용할 수 없는 닉네임입니다';
  end if;
  new.nickname := v;
  return new;
end $$;
drop trigger if exists trg_check_nickname on public.users;
create trigger trg_check_nickname before insert or update of nickname on public.users
  for each row execute function public._check_nickname();

-- ── 중복 확인 RPC: 가입·변경 화면에서 실시간 확인(본인 것은 사용 가능) ──
create or replace function public.nickname_available(p_nick text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v text := btrim(coalesce(p_nick, '')); me uuid := auth.uid();
begin
  if char_length(v) < 2 or char_length(v) > 12 then
    return jsonb_build_object('ok', false, 'reason', 'length');
  end if;
  if v !~ '^[가-힣a-zA-Z0-9_.\-]+$' then
    return jsonb_build_object('ok', false, 'reason', 'charset');
  end if;
  if nick_norm(v) in ('admin','관리자','운영자','갈라운영','galla','시스템','system','공식','official') then
    return jsonb_build_object('ok', false, 'reason', 'reserved');
  end if;
  if exists (select 1 from users where nick_norm(nickname) = nick_norm(v)
              and (me is null or id <> me)) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function public.nickname_available(text) to authenticated, anon;
