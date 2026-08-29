import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SID_CATEGORY_MAP: Record<string, string> = {
  "100": "정치",
  "101": "경제",
  "102": "사회",
  "103": "생활/문화",
  "104": "세계",
  "105": "IT/과학",
  "106": "연예",
  "107": "스포츠",
};

const KEYWORD_CATEGORY_RULES: Record<string, string[]> = {
  "정치": ["대통령", "국회", "선거", "정당", "윤석열", "민주당"],
  "경제": ["금리", "환율", "증시", "주식", "부동산", "물가"],
  "사회": ["사건", "사고", "경찰", "법원", "재판", "사망"],
  "IT/과학": ["AI", "인공지능", "반도체", "테크", "로봇"],
  "스포츠": ["야구", "축구", "농구", "올림픽", "월드컵"],
};

function extractSidFromUrl(url?: string): string | null {
  if (!url) return null;
  const m = url.match(/sid1?=(\d{3})/);
  return m ? m[1] : null;
}

function inferCategoryByKeyword(text: string): string | null {
  for (const [category, keywords] of Object.entries(KEYWORD_CATEGORY_RULES)) {
    if (keywords.some(k => text.includes(k))) {
      return category;
    }
  }
  return null;
}

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: raws, error } = await supabase
    .from("news_articles_raw")
    .select("id, url, title, description")
    .is("sid", null)
    .limit(200);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }

  let byUrl = 0;
  let byKeyword = 0;

  for (const r of raws ?? []) {
    let sid = extractSidFromUrl(r.url);
    let category = sid ? SID_CATEGORY_MAP[sid] : null;

    if (!category) {
      const text = `${r.title ?? ""} ${r.description ?? ""}`;
      category = inferCategoryByKeyword(text);
      if (category) {
        sid = Object.entries(SID_CATEGORY_MAP)
          .find(([, v]) => v === category)?.[0] ?? null;
        byKeyword++;
      }
    } else {
      byUrl++;
    }

    if (!sid) continue;

    await supabase
      .from("news_articles_raw")
      .update({ sid, category })
      .eq("id", r.id);
  }

  return new Response(JSON.stringify({
    ok: true,
    stats: {
      fetched: raws?.length ?? 0,
      updated: byUrl + byKeyword,
      by_url: byUrl,
      by_keyword: byKeyword,
    }
  }), { headers: { "Content-Type": "application/json" } });
});