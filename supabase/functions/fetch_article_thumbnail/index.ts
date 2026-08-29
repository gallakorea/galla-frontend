import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "method not allowed" }),
        { status: 405 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { article_id, url } = body;

    if (!article_id || !url) {
      return new Response(
        JSON.stringify({ error: "missing article_id or url" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* =====================================================
       1️⃣ 이미 썸네일 있는지 먼저 확인 (🔥 핵심 수정)
    ===================================================== */
    const { data: article, error: fetchError } = await supabase
      .from("news_articles_raw")
      .select("thumbnail_url")
      .eq("id", article_id)
      .single();

    if (fetchError) {
      return new Response(
        JSON.stringify({ error: "article not found" }),
        { status: 404 }
      );
    }

    // ✅ 이미 썸네일 있으면 바로 종료 (크론 안정화 핵심)
    if (article.thumbnail_url && article.thumbnail_url.trim() !== "") {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "thumbnail already exists",
          thumbnail_url: article.thumbnail_url,
        }),
        { status: 200 }
      );
    }

    /* =====================================================
       2️⃣ 썸네일 추출
    ===================================================== */
    const thumbnailUrl = await extractThumbnail(url);

    if (!thumbnailUrl) {
      return new Response(
        JSON.stringify({
          success: false,
          reason: "thumbnail not found",
        }),
        { status: 200 }
      );
    }

    /* =====================================================
       3️⃣ DB 업데이트
    ===================================================== */
    const { error: updateError } = await supabase
      .from("news_articles_raw")
      .update({ thumbnail_url: thumbnailUrl })
      .eq("id", article_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "db update failed" }),
        { status: 500 }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        thumbnail_url: thumbnailUrl,
      }),
      { status: 200 }
    );

  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "internal error",
        message: String(err),
      }),
      { status: 500 }
    );
  }
});

/* =====================================================
   🧠 NAVER NEWS THUMBNAIL EXTRACTOR
===================================================== */
async function extractThumbnail(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
    });

    if (!res.ok) return null;

    const html = await res.text();

    // 1️⃣ og:image 우선
    const ogMatch = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    );
    if (ogMatch?.[1]) {
      return ogMatch[1];
    }

    // 2️⃣ 네이버 뉴스 이미지 fallback
    const imgMatch = html.match(
      /https:\/\/imgnews\.pstatic\.net\/image\/[^"']+/i
    );
    if (imgMatch?.[0]) {
      return imgMatch[0];
    }

    return null;
  } catch {
    return null;
  }
}