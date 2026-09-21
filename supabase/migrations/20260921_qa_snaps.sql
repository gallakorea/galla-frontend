-- 🔬 QA 화면 캡처 저장소(26.9.21) — 두 폰 자동 QA 가 앱 화면을 찍어 넣는다.
-- 앱(로그인 사용자)은 자기 것 넣기만, 읽기 정책 없음 → 관리 API(서비스 키)로만 본다. 공개 미디어 저장소에 남의 대화 목록이 찍힌 캡처가 올라가지 않게.
create table if not exists public.qa_snaps (
  id bigserial primary key,
  user_id uuid default auth.uid(),
  label text,
  img text,
  created_at timestamptz default now()
);
alter table public.qa_snaps enable row level security;
drop policy if exists qa_snaps_ins on public.qa_snaps;
create policy qa_snaps_ins on public.qa_snaps for insert to authenticated with check (user_id = auth.uid() and length(img) < 1500000);
grant insert on public.qa_snaps to authenticated;
grant usage on sequence public.qa_snaps_id_seq to authenticated;
