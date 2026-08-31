-- 출처 종류에 'gov'(공직자) 를 연다.
-- ⚠️ 이 CHECK 때문에 assembly 채널 등록이 조용히 실패했고, 그 여파로 food_ingest 가
--    FK 위반으로 통째로 죽어 적재가 0건이었다(리포트엔 new:0/dup:0 로만 보였다).
--    "제약에 걸려 못 들어간 것"과 "넣을 게 없던 것"이 같은 숫자로 보이는 게 함정이다.
alter table food_channels drop constraint if exists food_channels_kind_check;
alter table food_channels add constraint food_channels_kind_check
  check (kind in ('yt','tv','guide','gov'));

insert into food_channels (slug, name, kind, active, sort)
values ('assembly', '국회의원 정치자금', 'gov', true, 5)
on conflict (slug) do update set name=excluded.name, kind=excluded.kind, active=true;
