// 갈라뉴스 썸네일 자가 치유 — 히어로가 없거나 깨진(404/403) 기사에 대해
// 원문 기사에서 og:image / twitter:image 를 다시 긁어와 채운다. 30분마다 크론.
// 전 매체 공통 안전망(조선일보 &amp; 문제, newsen 등 개별 매체와 무관하게 동작).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const dec = (u: string) => u.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').trim();

// 이미지 URL이 실제로 뜨는지(HEAD, 301은 정상 취급)
async function ok(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "follow", headers: { "User-Agent": UA, Referer: "" } });
    return r.ok;
  } catch { return false; }
}

// 원문에서 대표 이미지 추출
async function ogImage(pageUrl: string): Promise<string | null> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    const res = await fetch(pageUrl, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA } });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200000);
    const pats = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const re of pats) {
      const m = html.match(re);
      if (m) {
        let u = dec(m[1]);
        if (u.startsWith("//")) u = "https:" + u;
        if (/^https?:\/\//.test(u)) return u;
      }
    }
    return null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const LIMIT = Math.min(body.limit ?? 40, 100);

  // 1) 히어로 없는 기사 → 소스 썸네일로 즉시 백필
  const { data: nulls } = await supa.from("galla_news")
    .select("id")
    .or("hero_image.is.null,hero_image.eq.")
    .eq("status", "published")
    .gt("published_at", new Date(Date.now() - 3 * 864e5).toISOString())
    .limit(LIMIT);
  let backfilled = 0;
  for (const n of nulls || []) {
    const { data: s } = await supa.from("galla_news_sources")
      .select("thumbnail_url").eq("news_id", n.id)
      .not("thumbnail_url", "is", null).neq("thumbnail_url", "").limit(1).maybeSingle();
    if (s?.thumbnail_url) {
      await supa.from("galla_news").update({ hero_image: dec(s.thumbnail_url) }).eq("id", n.id);
      backfilled++;
    }
  }

  // 2) 최근 기사 히어로 검증 → 깨진 것만 원문 og:image로 재수집
  const { data: recent } = await supa.from("galla_news")
    .select("id, hero_image")
    .eq("status", "published")
    .not("hero_image", "is", null).neq("hero_image", "")
    .order("published_at", { ascending: false }).limit(LIMIT);

  let checked = 0, healed = 0;
  await Promise.all((recent || []).map(async (n) => {
    checked++;
    if (await ok(n.hero_image)) return;                 // 정상이면 스킵
    // 소스 URL에서 og:image 재수집
    const { data: srcs } = await supa.from("galla_news_sources")
      .select("url").eq("news_id", n.id).limit(3);
    for (const s of srcs || []) {
      const img = await ogImage(s.url);
      if (img && await ok(img)) {
        await supa.from("galla_news").update({ hero_image: img }).eq("id", n.id);
        healed++;
        return;
      }
    }
  }));

  return new Response(JSON.stringify({ ok: true, backfilled, checked, healed }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
