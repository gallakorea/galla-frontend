-- 🌐 콘텐츠 번역 캐시 (2026-08-09)
--
--  왜 이 방식인가: 유저가 쓴 글을 미리 다 번역해두면 비용이 폭발하고, 아무도 안 볼 글까지 번역한다.
--  인스타·X·스레드처럼 **읽는 사람이 '번역 보기'를 누를 때** 번역하고, 그 결과를 캐시한다.
--  같은 글을 100명이 봐도 번역은 1번이다.
--
--  ⚠️ 원문은 절대 건드리지 않는다. 번역은 '보기 옵션'이지 콘텐츠 교체가 아니다
--     (원문을 덮으면 작성자의 말이 사라진다).

create table if not exists public.translations (
  id          bigserial primary key,
  kind        text not null,                    -- issue | plaza | comment | news
  ref_id      text not null,                    -- 대상 id(uuid·bigint 혼재라 text)
  field       text not null default 'body',     -- title | body | summary
  src_locale  text not null,
  dst_locale  text not null,
  src_hash    text not null,                    -- 원문 해시 — 원문이 수정되면 캐시를 버린다
  text        text not null,
  chars       int  not null default 0,          -- 원가 추적용
  created_at  timestamptz not null default now(),
  unique (kind, ref_id, field, dst_locale, src_hash)
);
create index if not exists idx_tr_lookup on public.translations(kind, ref_id, dst_locale);

alter table public.translations enable row level security;
-- 읽기는 누구나(번역 결과는 공개 콘텐츠), 쓰기는 서버(엣지 함수)만.
drop policy if exists translations_read on public.translations;
create policy translations_read on public.translations for select using (true);
grant select on public.translations to anon, authenticated;

-- 📊 번역 원가·사용량 (남용 감시)
create table if not exists public.translation_usage (
  day        date not null,
  user_id    uuid,
  chars      int  not null default 0,
  calls      int  not null default 0,
  primary key (day, user_id)
);
alter table public.translation_usage enable row level security;
revoke all on public.translation_usage from anon, authenticated;

-- 🛡 유저별 일일 번역 한도 — 번역은 LLM 호출이라 공짜가 아니다.
--    ⚠️ 무제한으로 열면 스크래퍼가 우리 API로 번역기를 돌린다.
create or replace function public.translate_gate(p_uid uuid, p_chars int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_cap int; v_used int;
begin
  select coalesce((v ->> 'daily_chars')::int, 40000) into v_cap
    from app_settings where k = 'translate_limits';
  v_cap := coalesce(v_cap, 40000);
  select coalesce(chars, 0) into v_used
    from translation_usage where day = (now() at time zone 'Asia/Seoul')::date and user_id = p_uid;
  if coalesce(v_used, 0) + p_chars > v_cap then
    return jsonb_build_object('ok', false, 'reason', 'daily_cap', 'used', v_used, 'cap', v_cap);
  end if;
  insert into translation_usage (day, user_id, chars, calls)
    values ((now() at time zone 'Asia/Seoul')::date, p_uid, p_chars, 1)
    on conflict (day, user_id) do update
      set chars = translation_usage.chars + excluded.chars,
          calls = translation_usage.calls + 1;
  return jsonb_build_object('ok', true, 'used', coalesce(v_used, 0) + p_chars, 'cap', v_cap);
end $$;

insert into public.app_settings (k, v) values
  ('translate_limits', jsonb_build_object('daily_chars', 40000, 'max_len', 4000))
on conflict (k) do nothing;
