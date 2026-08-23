/**
 * IndexNow 프록시 (Cloudflare Pages Function) — 새 콘텐츠 URL을 검색엔진에 즉시 알림.
 *
 *   POST /indexnow          body: { "urls": [...] } 또는 { "url": "..." }
 *   GET  /indexnow?recent=6 최근 6시간 안에 올라온 이슈·갈라뉴스·광장·예측·갈라리를 쓸어담아 일괄 통보
 *
 * Bing/Yandex/Seznam/Naver 등 IndexNow 참여 엔진에 일괄 전파(구글은 미참여 — sitemap으로 커버).
 * 키 파일 https://galla.im/<KEY>.txt 이 사이트 루트에 존재해야 검증됨.
 *
 * ⚠️ 예전엔 이 함수가 만들어만 놓고 호출하는 데가 한 군데도 없었다(레포 전체 grep 0건).
 *    지금은 GET ?recent= 를 크론이 주기적으로 때려서 "새 글 → 즉시 통보"가 실제로 돈다.
 *    유저 작성분까지 한 경로로 덮이므로 작성 화면 JS는 건드리지 않는다(버전 전파 비용 0).
 */
const KEY = "db1e83664e655462904375b55ddce128";
const HOST = "galla.im";
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";

const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
});

/* ⚠️ api.indexnow.org 는 Cloudflare 워커 egress IP 를 429(Too Many Requests)로 막는다.
   같은 페이로드를 내 노트북에서 쏘면 200, 워커에서 쏘면 429 — 우리 제출 빈도 문제가 아니라
   공유 IP 문제다. IndexNow 는 어느 참여 엔진에 넣든 서로 전파하는 프로토콜이라
   막히면 빙 → 얀덱스로 넘어간다. 하나라도 2xx 면 성공. */
const ENDPOINTS = [
  "https://api.indexnow.org/indexnow",
  "https://www.bing.com/indexnow",
  "https://yandex.com/indexnow",
];
async function submit(urls) {
  urls = [...new Set(urls.filter((u) => typeof u === "string" && u.includes(HOST)))].slice(0, 500);
  if (!urls.length) return { ok: false, reason: "no_urls", submitted: 0 };
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList: urls });
  const tried = [];
  for (const ep of ENDPOINTS) {
    let status = 0;
    try {
      const r = await fetch(ep, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
      status = r.status;
      if (r.ok) return { ok: true, status, via: ep, submitted: urls.length, sample: urls.slice(0, 3), tried };
    } catch (e) { status = String(e).slice(0, 60); }
    tried.push({ ep, status });
  }
  return { ok: false, submitted: urls.length, sample: urls.slice(0, 3), tried };
}

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
    const out = await submit(urls);
    return json(out, out.ok ? 200 : 400);
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 200) }, 500);
  }
}

async function sb(query) {
  try {
    const r = await fetch(`${SB}/rest/v1/${query}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const raw = url.searchParams.get("recent");
  if (!raw) return json({ ok: true, hint: "POST {urls:[...]} 또는 GET ?recent=<시간>" });

  // 최대 72시간까지만 — 실수로 ?recent=99999 를 때려도 사이트맵 통째 재전송이 되지 않게
  const hours = Math.min(Math.max(parseInt(raw, 10) || 6, 1), 72);
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const q = `&order=created_at.desc&limit=100`;

  const [issues, news, plaza, markets, posts] = await Promise.all([
    sb(`issues?select=id&status=eq.normal&created_at=gte.${since}${q}`),
    // 출처 1곳짜리는 미들웨어가 noindex 를 붙이므로 통보 대상에서도 뺀다
    sb(`galla_news?select=id&status=eq.published&source_count=gte.2&published_at=gte.${since}&order=published_at.desc&limit=100`),
    sb(`plaza_posts?select=id&created_at=gte.${since}${q}`),
    sb(`markets?select=id&created_at=gte.${since}${q}`),
    sb(`posts?select=id&is_published=eq.true&created_at=gte.${since}${q}`),
  ]);

  const H = `https://${HOST}`;
  const urls = [
    ...issues.map((r) => `${H}/issue?id=${r.id}`),
    ...news.map((r) => `${H}/news?gn=${r.id}`),
    ...plaza.map((r) => `${H}/plaza_detail?id=${r.id}`),
    ...markets.map((r) => `${H}/predict-market?id=${r.id}`),
    ...posts.map((r) => `${H}/gallari-post?id=${r.id}`),
  ];
  // 새 글이 있으면 목록 페이지도 같이 갱신 통보(로봇이 링크 그물을 다시 읽게)
  if (urls.length) urls.push(`${H}/`, `${H}/search`, `${H}/plaza`, `${H}/galla-predict`, `${H}/gallari`);

  if (!urls.length) return json({ ok: true, submitted: 0, hours, note: "새 콘텐츠 없음" });
  const out = await submit(urls);
  return json({ ...out, hours, counts: { issues: issues.length, news: news.length, plaza: plaza.length, markets: markets.length, posts: posts.length } });
}
