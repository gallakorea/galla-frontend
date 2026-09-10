import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

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
/* 🔒 SSRF 방어 — 이 함수는 요청 본문의 url 을 서버가 대신 가져온다. 예전엔 검사 없이 가져갔다(2026-09-10 QA).
   article-reader·galla-friend 와 같은 규칙 + 리다이렉트를 손으로 따라가며 매 홉 다시 검사(최대 3홉). */
function isBlockedHost(u: string): boolean {
  let h = "";
  try { h = new URL(u).hostname.toLowerCase(); } catch { return true; }
  return h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local") ||
    /^\[?::1\]?$/.test(h) ||
    /^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) ||
    /^169\.254\./.test(h) || /^0\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^\[?f[cd][0-9a-f]{2}:/i.test(h);
}

async function extractThumbnail(url: string): Promise<string | null> {
  try {
    if (!/^https?:\/\//i.test(url) || isBlockedHost(url)) return null;
    let res: Response | null = null;
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      res = await fetch(cur, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
        redirect: "manual",
      });
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get("location");
      if (!loc) break;
      cur = new URL(loc, cur).toString();
      if (!/^https?:\/\//i.test(cur) || isBlockedHost(cur) || hop === 3) return null;
    }

    if (!res || !res.ok) return null;

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