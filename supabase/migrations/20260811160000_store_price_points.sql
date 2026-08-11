-- =========================================================
-- 스토어 가격표 스냅 + IAP 상품 카탈로그
--
-- 문제: _charge_price 는 액면가/(1-수수료) 를 100원 단위로 올림해서 값을 "계산"했다.
--       ₩14,300 · ₩42,900 · ₩71,500 · ₩142,900 …
--       그런데 애플·구글은 임의 금액을 받지 못한다. 개발자는 스토어가 정한
--       가격표(price point) 중에서 고를 뿐이다.
--       → 우리 DB가 말하는 금액과 유저가 실제로 결제한 금액이 어긋난다.
--         영수증 금액이 틀리고, 정산 대사가 안 되고, 환불 금액도 안 맞는다.
--
-- 해결
--   ① app_settings.store_price_points 에 채널별 "고를 수 있는 가격" 목록을 둔다.
--      _charge_price 는 계산 후 이 목록의 값으로 올림 스냅한다.
--      ⚠️ 아래 시드는 흔한 원화 가격대를 넣은 것이다. 실제 목록은
--         App Store Connect / Play Console 의 가격표에서 복사해 교체해야 한다.
--         목록이 비어 있으면 지금까지처럼 100원 올림으로 동작한다(하위호환).
--
--   ② gc_products: IAP 상품ID ↔ 패키지 ↔ 실제 스토어 가격 매핑.
--      IAP는 "공식으로 계산"하는 게 아니라 "스토어에 등록한 상품"이 진실이다.
--      verify-iap 가 상품ID로 이 표를 조회해 지급 GC를 정한다(클라 금액 불신).
--
-- 참고 — 이 마이그레이션으로 바뀌는 실제 가격(수수료 30% 기준):
--   10,000 GC : 계산 ₩14,300 → 스냅 ₩15,000
--   30,000 GC : 계산 ₩42,900 → 스냅 ₩44,000
-- 수수료를 15%(App Store Small Business Program)로 낮추면 훨씬 내려간다.
-- =========================================================

insert into app_settings(k, v) values ('store_price_points', jsonb_build_object(
  'ios', jsonb_build_array(
     1100,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500,9000,
     9900,11000,12000,13000,14000,15000,16000,17000,18000,19000,20000,22000,25000,28000,
     30000,33000,35000,38000,40000,44000,48000,50000,55000,60000,65000,70000,75000,80000,
     85000,90000,95000,100000,110000,120000,130000,140000,150000),
  'android', jsonb_build_array(
     1100,1500,2000,2500,3000,3500,4000,4500,5000,5500,6000,6500,7000,7500,8000,8500,9000,
     9900,11000,12000,13000,14000,15000,16000,17000,18000,19000,20000,22000,25000,28000,
     30000,33000,35000,38000,40000,44000,48000,50000,55000,60000,65000,70000,75000,80000,
     85000,90000,95000,100000,110000,120000,130000,140000,150000)
))
on conflict (k) do nothing;

comment on table public.app_settings is
  '운영 설정. store_price_points 는 App Store Connect / Play Console 가격표에서 복사해 넣는다.';

-- ---------------------------------------------------------
-- 가격표 스냅 — 계산값 이상인 가장 가까운 선택 가능 가격
-- ---------------------------------------------------------
create or replace function public._charge_price(p_base integer, p_channel text)
returns integer language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_ch   text    := lower(coalesce(nullif(btrim(p_channel),''),'web'));
  v_rate numeric := _charge_fee_rate(v_ch);
  v_raw  int;
  v_snap int;
begin
  if v_rate <= 0 then return p_base; end if;             -- 웹 등: 마크업 없음
  v_raw := (ceil((p_base::numeric / (1 - v_rate)) / 100) * 100)::int;

  -- 스토어 가격표가 있으면 그 안의 값으로 올림 스냅한다.
  -- 없으면(웹·미설정) 100원 올림 그대로 — 하위호환.
  select min(p)::int into v_snap
    from jsonb_array_elements_text(
           coalesce((select v -> v_ch from app_settings where k='store_price_points'), '[]'::jsonb)
         ) as t(p_txt),
         lateral (select p_txt::numeric as p) z
   where p >= v_raw;

  return coalesce(v_snap, v_raw);
end $$;

-- ---------------------------------------------------------
-- IAP 상품 카탈로그 — 스토어에 등록한 상품이 진실
-- ---------------------------------------------------------
create table if not exists public.gc_products (
  channel      text    not null check (channel in ('ios','android')),
  product_id   text    not null,                 -- App Store / Play 상품ID
  pkg          text    not null references public.gc_packages(key),
  store_krw    integer not null check (store_krw > 0),  -- 스토어에 실제로 등록한 가격
  gc           integer not null check (gc > 0),         -- 지급 GC
  active       boolean not null default true,
  updated_at   timestamptz not null default now(),
  primary key (channel, product_id)
);
create unique index if not exists gc_products_pkg_uniq
  on public.gc_products(channel, pkg) where active;

alter table public.gc_products enable row level security;
drop policy if exists gc_products_read on public.gc_products;
create policy gc_products_read on public.gc_products for select using (true);
grant select on public.gc_products to anon, authenticated;

comment on table public.gc_products is
  'IAP 상품 카탈로그. store_krw 는 App Store Connect/Play Console 에 등록한 실제 가격을 그대로 적는다 — 우리가 계산한 값이 아니다. verify-iap 는 상품ID로 여기를 조회해 지급 GC를 정한다(클라가 보낸 금액을 믿지 않는다).';

-- ---------------------------------------------------------
-- 패키지 조회 — IAP 채널은 카탈로그가 있으면 그것을 쓴다
-- ---------------------------------------------------------
create or replace function public.gc_charge_packages(p_channel text default 'web')
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_ch text := lower(coalesce(nullif(btrim(p_channel),''),'web')); v_pkgs jsonb;
begin
  if v_ch not in ('web','ios','android') then v_ch := 'web'; end if;

  -- IAP: 스토어에 등록한 상품이 진실. 카탈로그가 채워져 있으면 그걸 쓴다.
  if v_ch <> 'web' then
    select jsonb_agg(jsonb_build_object(
             'key', p.pkg, 'gc', p.gc, 'krw', p.store_krw,
             'product_id', p.product_id, 'web_krw', g.krw, 'label', g.label)
           order by g.sort)
      into v_pkgs
      from gc_products p join gc_packages g on g.key = p.pkg
     where p.channel = v_ch and p.active and g.active;
    if v_pkgs is not null then
      return jsonb_build_object('ok',true,'channel',v_ch,'source','catalog',
                                'fee_rate',_charge_fee_rate(v_ch),'packages',v_pkgs);
    end if;
  end if;

  -- 카탈로그가 아직 비었거나 웹이면 계산가(가격표 스냅 포함)
  return jsonb_build_object(
    'ok', true, 'channel', v_ch, 'source', 'computed',
    'fee_rate', _charge_fee_rate(v_ch),
    'packages', coalesce((
      select jsonb_agg(jsonb_build_object(
               'key', key, 'gc', krw, 'krw', _charge_price(krw, v_ch),
               'web_krw', krw, 'label', label) order by sort)
      from gc_packages where active), '[]'::jsonb));
end $$;

grant execute on function public.gc_charge_packages(text) to anon, authenticated;
