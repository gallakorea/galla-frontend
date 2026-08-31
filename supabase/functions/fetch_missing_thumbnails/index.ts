import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36";

function normalizeImageUrl(src: string, baseUrl: string): string | null {
  try {
    if (src.startsWith("http")) return src;
    if (src.startsWith("//")) return "https:" + src;
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

function isBadImage(url: string): boolean {
  return /logo|icon|sprite|ads?|banner|emblem|profile|avatar|default|blank/i.test(
    url
  );
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: articles, error } = await supabase
    .from("news_articles_raw")
    .select("id, url")
    .is("thumbnail_url", null)
    .eq("thumbnail_checked", false)
    .order("published_at", { ascending: false })
    .limit(50); // 🔥 50 → 30 (안정성)

  if (error || !articles || articles.length === 0) {
    return Response.json({ ok: true, message: "no targets" });
  }

  let success = 0;
  let skipped = 0;

  for (const a of articles) {
    try {
      const res = await fetch(a.url, {
        headers: { "User-Agent": UA },
        redirect: "follow",
      });

      if (!res.ok) throw new Error("fetch failed");

      const html = await res.text();
      const $ = cheerio.load(html);

      let img: string | null = null;

      // ✅ 메타 이미지 ONLY
      const metaCandidates = [
        $('meta[property="og:image"]').attr("content"),
        $('meta[property="og:image:secure_url"]').attr("content"),
        $('meta[name="twitter:image"]').attr("content"),
      ];

      for (const m of metaCandidates) {
        if (!m) continue;
        const normalized = normalizeImageUrl(m, a.url);
        if (normalized && !isBadImage(normalized)) {
          img = normalized;
          break;
        }
      }

      // ✅ 결과 저장 (throw 절대 없음)
      await supabase
        .from("news_articles_raw")
        .update({
          thumbnail_url: img,           // 없으면 null
          thumbnail_checked: true,
        })
        .eq("id", a.id);

      if (img) success++;
      else skipped++;

    } catch {
      // 🔥 실패해도 조용히 마킹만
      await supabase
        .from("news_articles_raw")
        .update({ thumbnail_checked: true })
        .eq("id", a.id);

      skipped++;
    }
  }

  return Response.json({
    ok: true,
    success,
    skipped,
    total: articles.length,
  });
});