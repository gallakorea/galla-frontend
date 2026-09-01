/* 날씨 탭의 유저 데이터 3개 표가 RLS 없이 익명에게 읽혔다.

   8/31 에 쓰기는 닫았는데(ccc11e762) 읽기는 그대로였다. 실측:
     weather_favs(user_id, region)      — **어떤 유저가 어느 동네를 담아뒀는지**가 그대로 조회된다.
     weather_comments(user_id, region, body, status)
     weather_reports(user_id, region, kind)  — 누가 어느 동네에서 제보했는지.
   지금 행이 적어서(0·2·3행) 유출 규모는 작지만, 런칭하면 그대로 커지는 구멍이다.
   travel_geo_budget(day, used, cap) 은 내부 예산 장부라 밖에서 볼 이유가 없다.

   화면은 전부 RPC 경유다 — weather_now·weather_room·weather_say·weather_fav·weather_report·
   weather_my·weather_search 일곱 개가 전부 SECURITY DEFINER(owner=postgres=표 소유자)라
   RLS 를 켜도 우회해서 돈다. 프론트에서 표를 직접 select 하는 코드는 0곳(js/ 전수 grep).
   → 정책 없이 RLS 만 켜고 권한을 걷는다. anon·authenticated 에겐 아무것도 안 열린다.

   ⚠️ 권한은 `from public` 까지 걷어야 한다. anon 은 PUBLIC 몫으로 들어온다(20260901280000 참고). */

alter table public.weather_favs      enable row level security;
alter table public.weather_comments  enable row level security;
alter table public.weather_reports   enable row level security;
alter table public.travel_geo_budget enable row level security;

revoke all on table public.weather_favs      from public, anon, authenticated;
revoke all on table public.weather_comments  from public, anon, authenticated;
revoke all on table public.weather_reports   from public, anon, authenticated;
revoke all on table public.travel_geo_budget from public, anon, authenticated;
