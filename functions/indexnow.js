/**
 * IndexNow 프록시 (Cloudflare Pages Function) — 새 콘텐츠 URL을 검색엔진에 즉시 알림.
 * POST /indexnow  body: { "urls": ["https://galla.im/issue?id=..", ...] }  또는 {"url":"..."}
 * Bing/Yandex/Seznam 등 IndexNow 참여 엔진에 일괄 전파(구글은 미참여지만 sitemap+색인API로 커버).
 * 키 파일 https://galla.im/<KEY>.txt 이 사이트 루트에 존재해야 검증됨.
 */
const KEY = "db1e83664e655462904375b55ddce128";
const HOST = "galla.im";

export async function onRequestPost(context) {
  try {
    const body = await context.request.json().catch(() => ({}));
    let urls = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
    urls = urls.filter(u => typeof u === "string" && u.includes(HOST)).slice(0, 100);
    if (!urls.length) return json({ ok: false, reason: "no_urls" }, 400);

    const payload = {
      host: HOST,
      key: KEY,
      keyLocation: `https://${HOST}/${KEY}.txt`,
      urlList: urls,
    };
    const r = await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    return json({ ok: r.ok, status: r.status, submitted: urls.length });
  } catch (e) {
    return json({ ok: false, reason: String(e).slice(0, 200) }, 500);
  }
}
export async function onRequestGet() {
  return json({ ok: true, hint: "POST { urls: [...] } to submit" });
}
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
