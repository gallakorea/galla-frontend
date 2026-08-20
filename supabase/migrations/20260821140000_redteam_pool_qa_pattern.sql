/* ══ 레드팀 테스트 계정을 보호 패턴으로 ═══════════════════════════
   기존 redteam-pool-*@galla.im 3개가 auth.users 에서 통째로 사라져 있었다(실측 0건).
   이메일이 실계정처럼 생겨서 테스트 계정 정리에 휩쓸린 것으로 보인다.
   → 사장님이 정해둔 보호 패턴 @galla-qa.test 로 바꾼다. 이 패턴은 실계정과 절대
     헷갈리지 않고, 삭제 작업에서 걸러내기도 쉽다.

   계정 자체는 여기서 안 만든다 — 만들려면 service_role 키를 밖으로 꺼내야 한다.
   galvis-redteam 이 로그인 실패 시 자기 런타임 안에서 만들도록 고쳤다(자가복구).
   비밀번호는 여기서 무작위 생성해 풀에 넣고, 함수가 그 값으로 계정을 만든다. */

update public.redteam_pool p
   set email    = 'redteam-pool-' || sub.rn || '@galla-qa.test',
       password = 'Rt!' || replace(gen_random_uuid()::text, '-', ''),
       uid      = null
  from (select id, row_number() over (order by id) rn from public.redteam_pool) sub
 where p.id = sub.id;

do $chk$
declare n int;
begin
  select count(*) into n from redteam_pool where email like '%@galla-qa.test' and length(password) >= 20;
  if n <> 3 then raise exception '풀 갱신 실패(%/3)', n; end if;
  if exists (select 1 from redteam_pool where email like '%@galla.im') then
    raise exception '옛 패턴이 남아 있다';
  end if;
  raise notice '레드팀 풀 3계정 보호패턴으로 갱신 — 계정 생성은 함수 자가복구가 한다';
end $chk$;
