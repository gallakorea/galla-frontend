-- 주소 끝에 상호가 중복으로 붙는 걸 막는다.
--
-- 실측 2026-09-02: 2,676곳이 이 상태였다.
--   "서울 종로구 종로46길 12 2층 별난오리"  (상호 = 별난오리)
--   "부산광역시 기장군 정관읍 구연1로 6 시골삼계탕"
-- 착한가격만의 문제가 아니었다 — yt 1,679 · gov · goodprice 997 로 **모든 출처**에 걸쳐 있다.
-- 정부 원본 주소가 그렇게 들어오기도 하고, 네이버가 건물명 자리에 상호를 넣어주기도 한다.
--
-- 그래서 소스마다 쫓지 않고 **표에 들어올 때 한 번에** 턴다. 트리거가 유일한 관문이다.
--
-- ⚠️ 두 글자 상호는 건드리지 않는다(120곳). "종로"·"우정" 같은 이름이 주소 끝 단어와
--    우연히 겹칠 수 있어 멀쩡한 주소를 깎을 위험이 있다. 세 글자부터만 턴다.
-- ⚠️ 턴 뒤 주소가 8자 미만이면 되돌린다 — 주소가 통째로 날아가는 것보다 중복이 낫다.
create or replace function food_strip_name_from_addr(p_addr text, p_name text)
returns text language plpgsql immutable set search_path to 'public' as $$
declare
  na text; nn text; tgt int; i int; out_addr text;
  norm text := '[^가-힣a-zA-Z0-9]';
begin
  if p_addr is null or p_name is null then return p_addr; end if;
  na := regexp_replace(p_addr, norm, '', 'g');
  nn := regexp_replace(p_name, norm, '', 'g');

  /* ⚠️ 두 글자 상호는 건드리지 않는다(120곳). "종로"·"우정" 같은 이름이 주소 끝 단어와
     우연히 겹쳐 멀쩡한 주소를 깎을 수 있다. 세 글자부터만 턴다. */
  if length(nn) < 3 or na not like '%' || nn then return p_addr; end if;

  /* 정규식으로 자르면 띄어쓰기 차이에서 다 놓친다 —
     상호 "카스테라연구소" ↔ 주소 "카스테라 연구소" (실측 105건).
     그래서 **글자 수로** 센다: 뒤에서부터 한 칸씩 줄여, 남은 부분의 정규화 길이가
     '주소 - 상호' 가 되는 지점에서 끊는다. 공백·&·괄호가 어떻게 섞여 있든 맞는다. */
  tgt := length(na) - length(nn);
  i := length(p_addr);
  while i > 0 loop
    exit when length(regexp_replace(left(p_addr, i), norm, '', 'g')) <= tgt;
    i := i - 1;
  end loop;

  out_addr := btrim(left(p_addr, i));
  out_addr := btrim(regexp_replace(out_addr, '[,&\s(]+$', ''));   -- 쉼표·&·괄호 꼬리 정리
  /* 턴 뒤 주소가 8자 미만이면 되돌린다 — 주소가 통째로 날아가는 것보다 중복이 낫다 */
  if length(out_addr) < 8 then return p_addr; end if;
  return out_addr;
end $$;

create or replace function food_places_biu()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  /* 🔴 주소 끝 상호를 턴다. 넣는 쪽이 여럿이라(수확·지자체·착한가격·관광공사)
     여기가 유일하게 다 지나가는 자리다. */
  new.address := food_strip_name_from_addr(new.address, new.name);

  if new.region is null or new.address is distinct from coalesce(old.address, '') then
    new.region := coalesce(new.region, food_region_of(new.address));
  end if;
  new.updated_at := now();
  return new;
end $$;
