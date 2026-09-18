-- 측정소 이름 → 시군구 연결 보강(26.9.18): 괄호 속 동/도시, 숫자 동(중2동), 군청·시청사, 법정동 이름
create or replace function public.air_station_region(p_sido text, p_station text)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  sc text; inner_ text; base text; k text; k2 text; r text;
begin
  select code into sc from weather_regions where kind='sido' and name = p_sido;
  if sc is null then return null; end if;
  inner_ := substring(p_station from '\(([^)]+)\)');                 -- 괄호 속
  base := trim(regexp_replace(p_station, '\(.*\)', ''));
  -- 괄호 속이 도시 이름이면(상대동(진주), 신풍동(군산)) 그 도시
  if inner_ is not null then
    select c.code into r from weather_regions c where c.kind='city' and c.parent=sc
      and regexp_replace(c.name,'(구|시|군)$','') = regexp_replace(inner_,'(특별자치시|특별시|광역시|구|시|군)$','') limit 1;
    if r is not null then return r; end if;
    if inner_ ~ '(동|읍|면|리)$' then base := inner_; end if;         -- 송내대로(중동) → 중동
  end if;
  base := regexp_replace(base, '(시청사|군청|구청|시청)$', '');        -- 봉화군청 → 봉화
  k := regexp_replace(base, '(특별자치시|특별시|광역시|구|시|군)$', '');
  select c.code into r from weather_regions c where c.kind='city' and c.parent=sc
    and (c.name = base or c.name = k or regexp_replace(c.name,'(구|시|군)$','') = k) limit 1;
  if r is not null then return r; end if;
  k2 := regexp_replace(regexp_replace(base,'[0-9·.]+','','g'), '(동|읍|면|리)$','');
  select d.parent into r from weather_regions d join weather_regions c on c.code=d.parent
   where d.kind='dong' and c.parent=sc
     and regexp_replace(regexp_replace(d.name,'[0-9·.]+','','g'), '(동|읍|면)$','') = k2 limit 1;
  return r;
end $$;
