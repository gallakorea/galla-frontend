-- 🖼 프로필 프레임 (2026-08-09)
--
--  아바타 테두리. GC 라인의 '원가 없는 꾸미기'에 해당한다.
--   · GP 상점에 같은 게 없다 → 환율이 안 생긴다(닉네임 꾸미기는 '이름', 프레임은 '아바타').
--   · 승패·여론에 아무 영향이 없다 → pay-to-win 아님.
--
--  닉네임 스타일과 **완전히 같은 계약**을 쓴다. 두 시스템이 다르게 동작하면
--  "왜 이건 남고 저건 사라지지?"가 된다.
--   · 구매 = 영구 소유(user_frames)
--   · 구독 = 장착 권한만 빌림. 만료되면 기본으로 떨어진다(소유 X)
--   · 화면에 보이는 값은 frame_effective()가 정한다

create table if not exists public.user_frames (
  user_id    uuid not null references auth.users(id) on delete cascade,
  frame_key  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, frame_key)
);
alter table public.user_frames enable row level security;
drop policy if exists uf_self_read on public.user_frames;
create policy uf_self_read on public.user_frames for select using (auth.uid() = user_id);
grant select on public.user_frames to authenticated;

-- 장착값은 기존 user_cosmetics에 얹는다(테이블을 또 만들 이유가 없다)
alter table public.user_cosmetics add column if not exists frame text;

-- ─── 카탈로그. 가격은 GC(=원). 원가가 없는 꾸미기라 심리 가격으로 잡는다.
insert into public.app_settings (k, v) values ('frames', jsonb_build_object(
  'none',   jsonb_build_object('name','기본',            'price',0),
  'silver', jsonb_build_object('name','실버 링',         'price',1000),
  'aqua',   jsonb_build_object('name','아쿠아 글로우',   'price',1500),
  'ember',  jsonb_build_object('name','엠버 글로우',     'price',2000),
  'violet', jsonb_build_object('name','바이올렛 오라',   'price',2500),
  'prism',  jsonb_build_object('name','프리즘',          'price',3000)
)) on conflict (k) do update set v = excluded.v;

create or replace function public.frames_catalog()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce((select v from app_settings where k='frames'), '{}'::jsonb);
$$;
grant execute on function public.frames_catalog() to anon, authenticated;

-- ─── 구매 (GC). 실제 돈이 나가는 건 아니지만 GC 라인 상품이다.
create or replace function public.buy_frame(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_price int; v_bal double precision;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  select (v -> p_key ->> 'price')::int into v_price from app_settings where k='frames';
  if v_price is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;
  if v_price = 0 then return jsonb_build_object('ok',true,'free',true); end if;
  if exists (select 1 from user_frames where user_id=v_user and frame_key=p_key) then
    return jsonb_build_object('ok',true,'already',true); end if;

  v_bal := _gc_spend(v_user, v_price, 'frame:'||p_key);
  if v_bal is null then
    return jsonb_build_object('ok',false,'reason','insufficient','currency','GC','cost',v_price,
      'balance', coalesce((select balance from gc_balances where user_id=v_user),0)); end if;

  insert into user_frames(user_id, frame_key) values (v_user, p_key) on conflict do nothing;
  return jsonb_build_object('ok',true,'balance',v_bal,'frame',p_key);
end $$;

-- ─── 장착. 구독자(라이트↑)는 구매 없이 장착 가능.
--     ⚠️ user_frames에 행을 심지 않는다 — 심으면 영구 소유가 되어 구독 만료 시 못 되돌린다.
create or replace function public.equip_frame(p_key text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_user uuid := auth.uid(); v_price int; v_sub boolean;
begin
  if v_user is null then return jsonb_build_object('ok',false,'reason','unauthorized'); end if;
  if p_key is null or p_key = 'none' then
    insert into user_cosmetics(user_id, frame) values (v_user,'none')
      on conflict (user_id) do update set frame='none', updated_at=now();
    return jsonb_build_object('ok',true,'frame','none');
  end if;
  select (v -> p_key ->> 'price')::int into v_price from app_settings where k='frames';
  if v_price is null then return jsonb_build_object('ok',false,'reason','bad_key'); end if;

  v_sub := coalesce((select v -> tier_of(v_user) -> 'features' from app_settings where k='ai_tiers')
                    ? 'frame_all', false);
  if v_price > 0 and not v_sub
     and not exists (select 1 from user_frames where user_id=v_user and frame_key=p_key) then
    return jsonb_build_object('ok',false,'reason','not_owned'); end if;

  insert into user_cosmetics(user_id, frame) values (v_user, p_key)
    on conflict (user_id) do update set frame=p_key, updated_at=now();
  return jsonb_build_object('ok',true,'frame',p_key,'by_sub',v_sub);
end $$;

-- ─── 화면에 실제로 보일 값. 구독 만료 + 미소유면 기본으로.
create or replace function public.frame_effective(p_uid uuid)
returns text language sql stable security definer set search_path to 'public' as $$
  select case
    when c.frame is null or c.frame = 'none' then null
    when exists (select 1 from user_frames f where f.user_id=p_uid and f.frame_key=c.frame) then c.frame
    when coalesce((select v -> tier_of(p_uid) -> 'features' from app_settings where k='ai_tiers')
                  ? 'frame_all', false) then c.frame
    else null
  end
  from user_cosmetics c where c.user_id = p_uid;
$$;

-- 도색기는 한 화면에 수십 명을 그린다 — 배치로 준다(1인 1쿼리 금지).
create or replace function public.frames_of(p_uids uuid[])
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(u.uid, f), '{}'::jsonb)
    from unnest(p_uids) as u(uid)
    cross join lateral (select public.frame_effective(u.uid) f) t
   where f is not null;
$$;
grant execute on function public.frames_of(uuid[]) to anon, authenticated;

-- ─── 내 프레임 목록(소유 + 구독으로 쓸 수 있는지)
create or replace function public.my_frames()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'owned',   coalesce((select jsonb_agg(frame_key) from user_frames where user_id = auth.uid()), '[]'::jsonb),
    'equipped', (select frame from user_cosmetics where user_id = auth.uid()),
    'by_sub',  coalesce((select v -> tier_of(auth.uid()) -> 'features' from app_settings where k='ai_tiers')
                        ? 'frame_all', false));
$$;
grant execute on function public.my_frames() to authenticated;

-- ─── 이용권 혜택에 frame_all 추가 (라이트↑)
update public.app_settings
   set v = jsonb_set(v, '{lite,features}',   (v #> '{lite,features}')   || '["frame_all"]'::jsonb)
 where k = 'ai_tiers' and not ((v #> '{lite,features}') ? 'frame_all');
update public.app_settings
   set v = jsonb_set(v, '{friend,features}', (v #> '{friend,features}') || '["frame_all"]'::jsonb)
 where k = 'ai_tiers' and not ((v #> '{friend,features}') ? 'frame_all');
update public.app_settings
   set v = jsonb_set(v, '{pro,features}',    (v #> '{pro,features}')    || '["frame_all"]'::jsonb)
 where k = 'ai_tiers' and not ((v #> '{pro,features}') ? 'frame_all');
