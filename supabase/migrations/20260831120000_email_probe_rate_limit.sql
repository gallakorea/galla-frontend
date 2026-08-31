-- 진단용으로 만든 임시 함수 정리
drop function if exists public._probe_headers();

/* email_available 은 가입 마법사가 쓰는 정상 기능이지만, 인증 없이 무제한이라
   "이 이메일이 갈라에 가입돼 있나"를 아무나 물을 수 있었다. 유출된 이메일 목록으로
   갈라 사용자만 골라내는 열거가 가능하다. IP·시간당으로 묶는다.
   기록하는 건 IP 와 횟수뿐 — 조회한 이메일은 남기지 않는다(그 자체가 또 다른 PII 더미). */
create table if not exists public.email_probe_rate (
  ip           text        not null,
  window_start timestamptz not null,
  n            int         not null default 0,
  primary key (ip, window_start)
);
revoke all on table public.email_probe_rate from public;

create or replace function public.email_available(p_email text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v      text := lower(btrim(coalesce(p_email,'')));
  v_hdr  jsonb := coalesce(nullif(current_setting('request.headers', true),'')::jsonb, '{}'::jsonb);
  v_ip   text;
  v_win  timestamptz := date_trunc('hour', now());
  v_n    int;
begin
  if v = '' or v !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    return jsonb_build_object('ok', false, 'reason', 'format');
  end if;

  v_ip := coalesce(v_hdr->>'cf-connecting-ip',
                   nullif(split_part(coalesce(v_hdr->>'x-forwarded-for',''), ',', 1),''),
                   'unknown');

  insert into email_probe_rate(ip, window_start, n) values (v_ip, v_win, 1)
    on conflict (ip, window_start) do update set n = email_probe_rate.n + 1
    returning n into v_n;

  -- 새 창이 열릴 때만 묵은 기록을 턴다(따로 크론을 만들 만큼 무거운 일이 아니다)
  if v_n = 1 then
    delete from email_probe_rate where window_start < now() - interval '3 hours';
  end if;

  /* 60회/시간 — 한 사람 가입에는 남고도 남고, 10만 건 열거엔 69일이 걸린다.
     통신사 CGNAT 로 IP 를 공유하는 걸 감안해 넉넉히 잡았다. */
  if v_n > 60 then
    return jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  if exists (select 1 from auth.users where lower(email) = v) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.email_available(text) from public;
grant execute on function public.email_available(text) to anon, authenticated;
