-- company.galla.im 문의 폼 접수 테이블
-- ⚠️ 개인정보(이름·이메일)가 들어간다. 익명은 INSERT 만, 조회는 관리자만.
--    anon 에 SELECT 를 주면 남의 문의가 통째로 읽힌다([[galla-security]] 컬럼권한 사고와 같은 계열).
create table if not exists public.company_inquiries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (char_length(kind) between 1 and 40),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' and char_length(email) <= 200),
  body        text not null check (char_length(body) between 5 and 4000),
  lang        text check (lang in ('ko','en')),
  referrer    text check (char_length(referrer) <= 300),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz
);

comment on table public.company_inquiries is
  'company.galla.im 문의 폼 접수. 익명 INSERT 만 허용하고 조회는 관리자만(RLS).';

create index if not exists company_inquiries_new_idx
  on public.company_inquiries (created_at desc) where handled_at is null;

alter table public.company_inquiries enable row level security;

drop policy if exists company_inq_insert on public.company_inquiries;
create policy company_inq_insert on public.company_inquiries
  for insert to anon, authenticated with check (true);

drop policy if exists company_inq_admin_read on public.company_inquiries;
create policy company_inq_admin_read on public.company_inquiries
  for select to authenticated using (public._is_admin());

drop policy if exists company_inq_admin_update on public.company_inquiries;
create policy company_inq_admin_update on public.company_inquiries
  for update to authenticated using (public._is_admin()) with check (public._is_admin());

revoke all on public.company_inquiries from anon, authenticated;
grant insert on public.company_inquiries to anon, authenticated;
grant select, update on public.company_inquiries to authenticated;

-- 도배 방지: 같은 이메일로 한 시간에 5건까지
create or replace function public.company_inq_rate() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.company_inquiries
      where email = new.email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'too_many_inquiries';
  end if;
  return new;
end $$;

drop trigger if exists company_inq_rate_t on public.company_inquiries;
create trigger company_inq_rate_t before insert on public.company_inquiries
  for each row execute function public.company_inq_rate();
