/* 💱 환율 통로 — 여행 카드의 '원화가 강해진 나라' 테마용.
   ⚠️ 브라우저에서 외부 API 를 직접 부르면 우리 CSP(connect-src 'self' …)에 막힌다.
      그래서 같은 도메인인 이 함수가 대신 불러 준다.
   출처: Frankfurter(유럽중앙은행 고시) — 키 없이 쓰는 무료 API.
   1년 전 대비 원화가 강해진(= 그 나라 물가가 싸진) 통화를 큰 순서로 돌려준다.
   캐시 6시간 — 환율은 하루 한 번 고시라 더 자주 부를 이유가 없다. */
const CUR = {
  JPY: { country: '일본', unit: 100 }, THB: { country: '태국' }, PHP: { country: '필리핀' },
  IDR: { country: '인도네시아', unit: 100 }, MYR: { country: '말레이시아' }, SGD: { country: '싱가포르' },
  CNY: { country: '중국' }, HKD: { country: '홍콩' },   /* ⚠️ 대만·베트남 통화는 이 고시에 없다(유럽중앙은행 목록) */
  USD: { country: '미국' }, EUR: { country: '유럽' }, GBP: { country: '영국' }, AUD: { country: '호주' },
  NZD: { country: '뉴질랜드' }, CHF: { country: '스위스' }, CAD: { country: '캐나다' },
  TRY: { country: '튀르키예' }, INR: { country: '인도' }, CZK: { country: '체코' }, PLN: { country: '폴란드' },
};

export async function onRequestGet({ request }) {
  const cache = caches.default;
  const key = new Request(new URL('/fx', request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const syms = Object.keys(CUR).join(',');
  const d = new Date(); d.setFullYear(d.getFullYear() - 1);
  const ago = d.toISOString().slice(0, 10);
  const get = (u) => fetch(u, { cf: { cacheTtl: 3600 } }).then(r => r.ok ? r.json() : null).catch(() => null);

  /* ⚠️ api.frankfurter.app 은 301 만 돌려준다(26.9.24 실측) — .dev 의 v1 을 쓴다 */
  const [now, then] = await Promise.all([
    get(`https://api.frankfurter.dev/v1/latest?base=KRW&symbols=${syms}`),
    get(`https://api.frankfurter.dev/v1/${ago}?base=KRW&symbols=${syms}`),
  ]);
  if (!now?.rates || !then?.rates) {
    return new Response(JSON.stringify({ ok: false }), { status: 502, headers: { 'content-type': 'application/json' } });
  }

  /* KRW 1원당 외화가 늘었다 = 원화가 강해졌다 = 그 나라에서 덜 쓴다 */
  const rows = Object.keys(CUR).map(c => {
    const a = now.rates[c], b = then.rates[c];
    if (!a || !b) return null;
    return { cur: c, country: CUR[c].country, pct: Math.round(((a - b) / b) * 1000) / 10,
      krw: Math.round((1 / a) * (CUR[c].unit || 1) * 100) / 100, unit: CUR[c].unit || 1 };
  }).filter(Boolean).sort((x, y) => y.pct - x.pct);

  const res = new Response(JSON.stringify({ ok: true, base: 'KRW', since: ago, date: now.date, rows }), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=21600' },
  });
  await cache.put(key, res.clone());
  return res;
}
