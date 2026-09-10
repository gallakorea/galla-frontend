-- =========================================================
-- 앱 후원 = 스토어 직접결제(IAP). GC 를 거치지 않는다.
--
-- 왜 GC 를 안 거치나
--   애플·구글은 '등록된 가격'만 결제할 수 있다. 자유 금액이 필요하면 중간 재화가
--   있어야 하지만, 후원은 금액이 고정 단계라 직접 팔 수 있다(유튜브 슈퍼챗 방식).
--   1차에서 GC 를 쓸 곳이 후원뿐이었는데, 후원을 직접결제로 빼면 GC 는 2차(창작
--   종량과금)까지 잠든다. 그게 맞다 — 쓸 데 없는 재화를 파는 화면은 심사에서도 질문을 부른다.
--
-- 왜 pending 을 먼저 만드나
--   IAP 영수증에는 '누구에게 후원하는지'를 실을 수 없다. 상품 id 만 온다.
--   그래서 구매 직전에 의도를 서버에 적어두고(pending), 영수증이 오면 그걸 찾아 확정한다.
--   gc_charge_begin 과 같은 패턴이다.
-- =========================================================

create table if not exists tip_products (
  channel     text not null check (channel in ('ios','android')),
  product_id  text not null,
  krw         int  not null,          -- 스토어 실제 판매가(사용자가 내는 돈)
  web_krw     int  not null,          -- 대응하는 웹 티어(표시·통계용)
  active      bool not null default true,
  updated_at  timestamptz not null default now(),
  primary key (channel, product_id)
);
alter table tip_products enable row level security;
grant select on tip_products to authenticated, anon;
drop policy if exists tip_products_read on tip_products;
create policy tip_products_read on tip_products for select using (active);

/* 앱 후원 티어 — 웹 정가에 스토어 수수료를 얹은 금액.
   ⚠️ 상품 ID 는 만들면 삭제·재사용 불가다. 이름은 '웹 기준 금액'으로 읽는다. */
insert into tip_products (channel, product_id, krw, web_krw) values
  ('ios','im.galla.tip.1k',   1500,   1000),
  ('ios','im.galla.tip.3k',   4000,   3000),
  ('ios','im.galla.tip.5k',   7000,   5000),
  ('ios','im.galla.tip.10k', 15000,  10000),
  ('ios','im.galla.tip.30k', 39000,  30000),
  ('ios','im.galla.tip.50k', 75000,  50000)
on conflict (channel, product_id) do update
  set krw = excluded.krw, web_krw = excluded.web_krw, active = true, updated_at = now();

insert into tip_products (channel, product_id, krw, web_krw)
select 'android', product_id, krw, web_krw from tip_products where channel='ios'
on conflict (channel, product_id) do update
  set krw = excluded.krw, web_krw = excluded.web_krw, active = true, updated_at = now();

-- pending 후원을 찾기 위한 인덱스(영수증 → 최근 의도 매칭)
create index if not exists donations_pending_idx
  on donations (supporter_id, status, created_at desc)
  where status = 'pending';
