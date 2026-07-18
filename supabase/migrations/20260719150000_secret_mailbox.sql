-- ═══════════════════════════════════════════════════════════════
-- 📬 비밀대화 우편함 — 발신자 은닉(sealed-sender 1단)
--
-- 핵심: 이 테이블엔 발신자 컬럼이 '없다'. 스레드 컬럼도 없다.
-- 발신자·대화 맥락은 E2E 암호문(payload) 안에만 있다 →
-- DB를 통째로 열어도 '누가 보냈는지'를 알 수 없다.
-- 수신자는 자기 우편함을 읽고, 자기 비밀대화 상대들의 키로
-- 시도-복호(GCM 인증 실패 = 다른 상대)해서 발신자를 알아낸다.
--
-- 정직한 한계(사용자에게 설명됨):
-- · 쓰기 요청 자체는 로그인 상태 — 서버 '로그'까지 못 믿는 위협 모델(2단)은
--   블라인드 토큰 영역. 이 테이블의 '데이터'에는 발신자가 없다.
-- · 수거(읽음) 후 클라이언트가 행을 지운다 — 서버 체류는 배달까지만.
--   30일 미수거분은 크론이 청소한다.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.secret_mailbox (
  id uuid primary key default gen_random_uuid(),
  recipient uuid not null references public.users(id) on delete cascade,
  payload text not null check (char_length(payload) between 1 and 8000),
  created_at timestamptz not null default now()
);
create index if not exists idx_secret_mailbox_rcpt on public.secret_mailbox(recipient, created_at);

alter table public.secret_mailbox enable row level security;
-- 넣기: 로그인 유저 누구나(행에 발신자를 남기지 않는 것이 설계), 자기 앞으론 금지
drop policy if exists secret_mailbox_put on public.secret_mailbox;
create policy secret_mailbox_put on public.secret_mailbox for insert to authenticated
  with check (recipient <> auth.uid());
-- 읽기·지우기: 수신자만
drop policy if exists secret_mailbox_take on public.secret_mailbox;
create policy secret_mailbox_take on public.secret_mailbox for select to authenticated
  using (recipient = auth.uid());
drop policy if exists secret_mailbox_del on public.secret_mailbox;
create policy secret_mailbox_del on public.secret_mailbox for delete to authenticated
  using (recipient = auth.uid());
grant insert (recipient, payload) on public.secret_mailbox to authenticated;
grant select, delete on public.secret_mailbox to authenticated;

-- 실시간 배달
do $$ begin
  alter publication supabase_realtime add table public.secret_mailbox;
exception when duplicate_object then null; end $$;

-- 미수거 우편 30일 청소
create or replace function public.secret_mailbox_sweep()
returns void language sql security definer set search_path = public as $$
  delete from secret_mailbox where created_at < now() - interval '30 days';
$$;
do $$ begin
  perform cron.schedule('secret-mailbox-sweep', '20 5 * * *', 'select public.secret_mailbox_sweep()');
exception when others then null; end $$;
