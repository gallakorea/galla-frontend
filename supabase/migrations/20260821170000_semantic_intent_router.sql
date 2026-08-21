/* ══ 시맨틱 의도 라우터 ═══════════════════════════════════════════
   정규식 의도 분류의 두더지잡기("뭔데" 잡으면 "열어봐"가 새고, 그걸 잡으면
   "잘못 열렸대"가 새는)를 업계 표준 방식으로 교체:
   의도별 예문을 임베딩해두고, 유저 발화와 코사인 유사도로 분류한다.
   정규식은 빠른 경로(무비용·고정밀)로 유지하고, 못 잡은 것만 여기로 온다.
   런타임 비용 = 임베딩 1콜(~0.001원) + 인덱스 조회. */

create table if not exists public.galvis_intents (
  id      bigint generated always as identity primary key,
  intent  text not null,
  example text not null unique,
  embedding vector(1536)
);
alter table public.galvis_intents enable row level security;
-- 서비스 롤 전용(유저가 읽을 이유가 없다)

create or replace function public.match_galvis_intent(p_vec vector(1536))
returns table(intent text, example text, sim double precision)
language sql stable security definer set search_path to 'public' as $$
  select intent, example, 1 - (embedding <=> p_vec) as sim
    from galvis_intents
   where embedding is not null
   order by embedding <=> p_vec
   limit 3;
$$;
revoke all on function public.match_galvis_intent(vector) from public, anon, authenticated;

do $chk$
begin
  if not exists (select 1 from information_schema.tables where table_name='galvis_intents') then
    raise exception '테이블 생성 실패';
  end if;
  raise notice '시맨틱 라우터 스키마 OK';
end $chk$;
