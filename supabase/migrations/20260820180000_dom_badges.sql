/* 판별 배지 배치 조회 — 피드·댓글은 한 화면에 사람이 수십 명이라
   한 명씩 조회하면 안 된다. 판별 시즌 점수 + 왕좌 주인을 한 번에 준다.
   (왕관을 이름 옆에 띄우려면 '이 판의 왕이 누구인지'가 같이 있어야 한다) */
create or replace function public.dom_badges_of(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with s as (select * from _current_season())
  select jsonb_build_object(
    'doms', coalesce((select jsonb_object_agg(c.user_id::text, coalesce(c.gi_dom,'{}'::jsonb))
                        from gallian_cache c
                       where c.user_id = any(p_uids)), '{}'::jsonb),
    'kings', coalesce((select jsonb_object_agg(k.domain, k.user_id)
                         from season_kings k
                        where k.season_id = (select id from s) and k.user_id is not null),
                      '{}'::jsonb)
  );
$$;
grant execute on function public.dom_badges_of(uuid[]) to authenticated, anon;

do $chk$
declare v jsonb; u uuid;
begin
  select user_id into u from gallian_cache where gi_season > 0 limit 1;
  if u is null then raise notice '점수 있는 유저가 없어 점검 생략'; return; end if;
  select dom_badges_of(array[u]) into v;
  if not (v ? 'doms' and v ? 'kings') then raise exception 'dom_badges_of 모양 불일치: %', v; end if;
  if (v->'doms'->u::text) is null then raise exception '판별 점수가 안 나온다: %', v; end if;
  raise notice '판별 배지 OK — %', v;
end $chk$;
