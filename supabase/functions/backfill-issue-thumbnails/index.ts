import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  console.log("[BACKFILL] start");

  const { data: issues } = await supabase
    .from("news_issues")
    .select("id, issue_title")
    .is("thumbnail_url", null)
    .limit(100);

  let updated = 0;

  for (const issue of issues ?? []) {
    const { data: articles } = await supabase
      .from("news_articles")
      .select("url")
      .eq("issue_id", issue.id)
      .order("published_at", { ascending: false })
      .limit(5);

    if (!articles || articles.length === 0) continue;

    const candidates: { url: string; score: number }[] = [];

    for (const a of articles) {
      const og = await fetchOgImage(a.url);
      if (!og) continue;

      const score = scoreImage(og);
      if (score > 0) {
        candidates.push({ url: og, score });
      }
    }

    if (candidates.length === 0) continue;

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    await supabase
      .from("news_issues")
      .update({ thumbnail_url: best.url })
      .eq("id", issue.id);

    updated++;
    console.log("[THUMBNAIL SELECTED]", issue.issue_title, best.url);
  }

  return new Response(
    JSON.stringify({ ok: true, updated }),
    { headers: { "Content-Type": "application/json" } }
  );
});

/* =========================
   OG IMAGE FETCH
========================= */
async function fetchOgImage(pageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(pageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GALLA/1.0; +https://galla.app)",
      },
    });

    if (!res.ok) return null;
    const html = await res.text();

    const match =
      html.match(
        /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
      ) ||
      html.match(
        /<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i
      );

    if (!match) return null;

    let img = match[1];
    if (img.startsWith("//")) img = "https:" + img;
    if (img.startsWith("/")) {
      const u = new URL(pageUrl);
      img = u.origin + img;
    }

    return img;
  } catch {
    return null;
  }
}

/* =========================
   IMAGE SCORER
========================= */
function scoreImage(url: string): number {
  let score = 0;

  if (url.match(/\.(jpg|jpeg|png)$/i)) score += 2;
  if (url.includes("logo") || url.includes("icon")) score -= 100;
  if (url.includes("naver") || url.includes("daum")) score -= 50;
  if (url.length > 50) score += 1;

  return score;
}