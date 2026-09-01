/* 익명(anon)에게 쓰기가 열려 있던 표 3개를 닫는다 — 버그헌터 critical 4건 중 3건.

   왜 이렇게 태어났나: pg_default_acl 에 **supabase_admin 이 public 스키마에 만드는 새 표는
   anon·authenticated 에게 arwdDxtm(전권)** 을 준다는 기본값이 박혀 있다.
   SQL 에디터·Management API 로 만든 표는 전부 이 경로다 → 만드는 순간 익명 쓰기가 열린 채 태어난다.
   (migration 안에서 revoke ... from public 만 한 표도 anon·authenticated 는 그대로 남았다 —
    email_probe_rate 가 정확히 그 사례다.)

   실제 피해:
     · email_probe_rate — 8/31 에 "이 이메일이 갈라에 가입돼 있나" 열거를 막으려고 만든
       IP·시간당 카운터다. anon 이 DELETE 할 수 있으니 **카운터를 지우면 제한이 초기화된다 = 방어 무력.**
     · places_tried / places_usage — 맛집 수집기의 '물어본 곳'·'일일 사진 한도' 장부.
       anon 이 INSERT/UPDATE 로 전부 '이미 물어봄'·'한도 소진'으로 만들면 수집이 조용히 멈춘다.

   쓰는 쪽은 전부 service_role(엣지 함수 ingest-places-photos) 아니면 SECURITY DEFINER RPC
   (email_available)라 권한을 회수해도 정상 경로는 그대로 돈다.
   정책은 하나도 만들지 않는다 — RLS 를 켜고 권한을 걷으면 anon·authenticated 에겐 아무것도 안 열린다.
   (⚠️ PERMISSIVE 정책은 OR 로 합쳐진다. 헐거운 정책 하나를 두느니 아예 없는 편이 맞다.) */

alter table public.email_probe_rate enable row level security;
alter table public.places_tried     enable row level security;
alter table public.places_usage     enable row level security;

revoke all on table public.email_probe_rate from anon, authenticated;
revoke all on table public.places_tried     from anon, authenticated;
revoke all on table public.places_usage     from anon, authenticated;

/* _sft_scrub 의 anon EXECUTE 는 버그헌터가 '민감 함수'로 잡았지만 오탐이다 —
   language sql immutable 순수 함수(정규식 치환)라 부작용도 권한 상승도 없다.
   그래도 학습표본 비식별화 헬퍼를 밖에 열어둘 이유가 없어 같이 닫는다(경보도 함께 꺼진다). */
revoke execute on function public._sft_scrub(text) from anon, authenticated;
