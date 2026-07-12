// 🔗 링크 미리보기 — 임의 URL의 OG 메타(제목/언론사/썸네일)를 서버에서 파싱.
// body/GET: { url }  →  { ok, url, title, source, image, description }
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } });

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const abs = (u: string | null, base: string) => { if (!u) return null; try { return new URL(u, base).href; } catch { return null; } };
const decode = (s: string) => s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ").trim();

function metaTag(html: string, key: string): string | null {
  // property 또는 name = key 인 meta 태그의 content (순서 무관)
  const re = new RegExp(
    `<meta[^>]+(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`, "i");
  const m = html.match(re);
  if (!m) return null;
  const c = m[0].match(/content\s*=\s*["']([^"']*)["']/i);
  return c ? decode(c[1]) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  let url = new URL(req.url).searchParams.get("url") || "";
  if (!url && req.method === "POST") { try { url = (await req.json())?.url || ""; } catch { /**/ } }
  url = (url || "").trim();
  if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: "invalid_url" }, 400);

  const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    const resp = await fetch(url, { redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8", "Accept-Language": "ko-KR,ko;q=0.9" } });
    clearTimeout(timer);
    const finalUrl = resp.url || url;
    if (!resp.ok) return json({ ok: true, url: finalUrl, title: host, source: host, image: null }, 200);
    const html = (await resp.text()).slice(0, 400000);

    const title = metaTag(html, "og:title") || metaTag(html, "twitter:title")
      || decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")) || host;
    const source = metaTag(html, "og:site_name") || host;
    const image = abs(metaTag(html, "og:image") || metaTag(html, "twitter:image"), finalUrl);
    const description = metaTag(html, "og:description") || metaTag(html, "description") || null;

    return json({ ok: true, url: finalUrl, title, source, image, description });
  } catch (e) {
    return json({ ok: true, url, title: host, source: host, image: null, error: String(e) }, 200);
  }
});
