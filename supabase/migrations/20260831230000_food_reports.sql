-- 맛집 정보 제보 — 편집·삭제 요청 (2026-08-31)
--
-- bug_reports 를 재사용하지 않았다. 저건 '코드 버그'용이라 place_id 도, 처리 결과가
-- 데이터 수정으로 이어지는 흐름도 없다. 섞으면 관제 화면이 지저분해진다.
--
-- 🔑 갈라식 고도화: 이 데이터는 **자동수집**이다. 폐업한 집이 계속 쌓이는데 사람이 다 못 본다.
--    → 서로 다른 유저 3명이 '폐업'을 찍으면 **자동으로 지도에서 내린다**.
--      완전 삭제가 아니라 status='hidden' 이라 오판이면 되돌릴 수 있다.

create table if not exists public.food_reports (
  id         bigserial primary key,
  place_id   uuid not null references public.food_places(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('closed','address','duplicate','info','other')),
  body       text check (body is null or length(btrim(body)) <= 500),
  status     text not null default 'open' check (status in ('open','accepted','rejected')),
  created_at timestamptz not null default now()
);
-- 같은 사람이 같은 집에 같은 종류를 반복 신고하지 못한다(임계치 조작 방지)
create unique index if not exists food_reports_uk on public.food_reports (place_id, user_id, kind);
create index if not exists food_reports_open on public.food_reports (status, created_at desc) where status='open';
create index if not exists food_reports_place on public.food_reports (place_id, kind);

alter table public.food_reports enable row level security;
drop policy if exists food_reports_mine on public.food_reports;
create policy food_reports_mine on public.food_reports for select using (user_id = auth.uid());
grant select on public.food_reports to authenticated;

create or replace function public.food_report(p_id uuid, p_kind text, p_body text default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare
  v_uid uuid := auth.uid();
  v_closed int;
  v_threshold int := 3;      -- 서로 다른 유저 3명 = 자동 숨김
  v_hidden boolean := false;
begin
  if v_uid is null then return jsonb_build_object('ok',false,'reason','auth'); end if;
  if p_kind not in ('closed','address','duplicate','info','other') then
    return jsonb_build_object('ok',false,'reason','bad_kind'); end if;
  if not exists (select 1 from food_places where id = p_id and status = 'live') then
    return jsonb_build_object('ok',false,'reason','not_found'); end if;
  if p_body is not null and length(btrim(p_body)) > 500 then
    return jsonb_build_object('ok',false,'reason','too_long'); end if;

  begin
    insert into food_reports(place_id, user_id, kind, body)
    values (p_id, v_uid, p_kind, nullif(btrim(coalesce(p_body,'')),''));
  exception when unique_violation then
    return jsonb_build_object('ok',true,'already',true);
  end;

  -- 폐업 자동 처리 — 사람이 못 보는 사이 죽은 집이 지도에 남는 걸 막는다
  if p_kind = 'closed' then
    select count(distinct user_id) into v_closed
      from food_reports where place_id = p_id and kind = 'closed' and status <> 'rejected';
    if v_closed >= v_threshold then
      update food_places set status = 'hidden', updated_at = now()
       where id = p_id and status = 'live';
      v_hidden := true;
    end if;
  end if;

  return jsonb_build_object('ok',true,'already',false,'kind',p_kind,
    'hidden', v_hidden, 'closed_votes', coalesce(v_closed,0), 'threshold', v_threshold);
end $fn$;
grant execute on function public.food_report(uuid,text,text) to authenticated;

/* 관제용 — 열려 있는 제보를 종류별로 모아 본다. 관리자 화면이 붙기 전에도
   SQL 로 바로 볼 수 있어야 운영이 막히지 않는다. */
create or replace function public.food_reports_open(p_limit int default 100)
returns jsonb language sql stable security definer set search_path to 'public' as $fn$
  select jsonb_build_object('ok', true,
    'by_kind', coalesce((select jsonb_object_agg(kind, n)
                           from (select kind, count(*) n from food_reports
                                  where status='open' group by kind) k), '{}'::jsonb),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'body', r.body, 'created_at', r.created_at,
        'place', p.name, 'address', p.address, 'place_id', p.id,
        'place_status', p.status) order by r.created_at desc)
      from food_reports r join food_places p on p.id = r.place_id
     where r.status = 'open'
     limit least(coalesce(p_limit,100), 500)), '[]'::jsonb));
$fn$;
revoke all on function public.food_reports_open(int) from public, anon;
grant execute on function public.food_reports_open(int) to authenticated;

select food_reports_open(1);
