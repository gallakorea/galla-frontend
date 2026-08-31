-- 예측 규제 방어선 (2026-08-19)
--
-- 계기: 방송미디어통신심의위원회가 폴리마켓 국내 접속을 차단(2026-08-18). 판단 근거 4가지 중
--   ① 통제 불가 사건 결과 ② 승자독식 ③ 운영자가 마켓 전반 관리 — 는 갈라도 해당하고,
--   ④ 「입출금·정산 제공 + 거래 수수료로 경제적 이익」 만 비해당이다.
--
-- 갈라가 ④에 해당하지 않는 이유(이 파일이 지키려는 것):
--   · GP는 판매하지 않는다 — charge_confirm 이 gp_charge_discontinued 로 봉인(2026-08-09 확정)
--   · GP → 현금 경로 없음 — 출금(request_withdrawal)은 후원금(donations) 정산에서만 나간다
--   · GC → GP 경로 없음 — GC 를 다루는 함수 전수 확인
--   · 판돈에서 떼는 몫 없음 — rake 0
--   형법 도박죄·국민체육진흥법 유사행위 모두 '재물 또는 재산상 이익'이 요건이다. 그 고리를 끊어둔다.
--
-- ⚠️ 이 파일의 DDL 은 Management API 로 이미 적용됐다. 기록·재현용이며, 가드가 살아있는지 검사한다.

-- ① 규제 가드 트리거 — 특별법이 '형태' 자체를 겨냥하는 두 가지만 막는다.
--    스포츠는 갈라의 핵심 소재다. 소재를 버리는 게 아니라 '경기 결과 적중형'만 막고
--    여론형(오심 논란·경질 여론·이적설 찬반)은 통과시킨다. 실측 11/11 정확.
create or replace function public.markets_guard_regulated()
returns trigger language plpgsql as $fn$
declare q text := coalesce(NEW.question,'');
begin
  if NEW.issue_id is not null then return NEW; end if;   -- 이슈 승패(내부 여론 대결)는 대상 아님

  if q ~ '(연승|연패|우승|승리|이길까|맞대결|득점|골|홈런|안타|타율|방어율|순위|1위)'
     and q ~ '(야구|축구|농구|배구|골프|KBO|MLB|EPL|리그|경기|구단|선수|트윈스|베어스|이글스|라이온즈|위즈|다이노스|랜더스|자이언츠|히어로즈)'
     and q !~ '(여론|논란|반응|팬들|화제|경질|이적설|오심|갑론을박|찬반)'
  then
    raise exception '규제가드: 경기 결과 적중형 금지. 스포츠는 여론 각도로 물어라 (%)', left(q,60);
  end if;

  if q ~ '(당선|득표|지지율|경선|낙선)' then      -- 정책·법안 처리 여부는 허용
    raise exception '규제가드: 선거 결과 예측 금지 (%)', left(q,60);
  end if;
  return NEW;
end $fn$;

drop trigger if exists trg_markets_guard on public.markets;
create trigger trg_markets_guard before insert on public.markets
  for each row execute function public.markets_guard_regulated();

-- ② 레이크 하드락 — 방미심위가 명시적으로 지목한 「수수료로 경제적 이익」을 구조적으로 봉인.
alter table public.markets drop constraint if exists markets_rake_zero;
alter table public.markets add constraint markets_rake_zero check (rake_bps = 0);

-- ③ GP 유료화 잔재 제거 — 되살리면 '돈으로 산 재화로 결과에 걸고 딴다'가 된다.
update public.gp_packages set active = false where active;
update public.gp_products set active = false where active;

-- ④ 킬스위치 — 규제 이슈·장애 시 배포 없이 즉시 베팅을 끊는다.
--    끄기: update app_settings set v='{"enabled": false}'::jsonb where k='predict';
insert into public.app_settings(k,v) values('predict','{"enabled": true}'::jsonb)
  on conflict (k) do nothing;
--    (place_bet 본문에 가드 주입 — 원본 보존 후 unauthorized 체크 바로 뒤에 삽입)

-- 🔒 가드가 살아있는지 검사 — 누가 지우면 마이그레이션이 실패한다.
do $chk$
begin
  if not exists (select 1 from pg_trigger where tgname='trg_markets_guard') then
    raise exception '규제 가드 트리거가 사라졌다';
  end if;
  if not exists (select 1 from pg_constraint where conname='markets_rake_zero') then
    raise exception '레이크 하드락이 사라졌다';
  end if;
  if exists (select 1 from gp_packages where active) or exists (select 1 from gp_products where active) then
    raise exception 'GP 유료 상품이 되살아났다 — GP는 판매하지 않는다';
  end if;
  if position('predict_disabled' in (
       select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='place_bet')) = 0 then
    raise exception 'place_bet 킬스위치가 사라졌다';
  end if;
end $chk$;
