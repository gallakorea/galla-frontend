import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const NAVER_NEWS_API = "https://openapi.naver.com/v1/search/news.json";
const KEYWORDS = ["대통령", "금리", "사건", "AI", "야구"];

const clean = (s?: string, max = 300) =>
  s
    ?.replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .slice(0, max);

/* =========================
   ✅ 언론사명 추출 함수 (여기 추가)
========================= */
function extractPressName(originUrl: string): string {
  try {
    const host = new URL(originUrl).hostname.replace("www.", "");

    const PRESS_MAP: Record<string, string> = {
      "chosun.com": "조선일보",
      "joins.com": "중앙일보",
      "hani.co.kr": "한겨레",
      "mk.co.kr": "매일경제",
      "sedaily.com": "서울경제",
      "khan.co.kr": "경향신문",
      "yonhapnews.co.kr": "연합뉴스",
      "news.kbs.co.kr": "KBS",
      "imnews.imbc.com": "MBC",
      "news.sbs.co.kr": "SBS",
      "ytn.co.kr": "YTN",
      "ohmynews.com": "오마이뉴스",
      "news.mt.co.kr": "머니투데이",
      "asiae.co.kr": "아시아경제",
      "fnnews.com": "파이낸셜뉴스",
      "hankyung.com": "한국경제"
    };

    for (const domain in PRESS_MAP) {
      if (host.endsWith(domain)) {
        return PRESS_MAP[domain];
      }
    }

    // 🔥 기타 언론 금지 → 도메인 이름을 그대로 사용
    return host.split(".")[0].toUpperCase();
  } catch {
    return "UNKNOWN";
  }
}

serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  console.log("🔥 collect-raw-news invoked from cron");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const CLIENT_ID = Deno.env.get("NAVER_CLIENT_ID")!;
  const CLIENT_SECRET = Deno.env.get("NAVER_CLIENT_SECRET")!;

  let inserted = 0;
  const errors: any[] = [];

  for (const q of KEYWORDS) {
    await new Promise(r => setTimeout(r, 200));

    const res = await fetch(
      `${NAVER_NEWS_API}?query=${encodeURIComponent(q)}&display=10&sort=date`,
      {
        headers: {
          "X-Naver-Client-Id": CLIENT_ID,
          "X-Naver-Client-Secret": CLIENT_SECRET,
        },
      }
    );

    const json = await res.json();

    for (const item of json.items ?? []) {
      // ✅ 여기서 언론사명 결정
      const pressName = extractPressName(
        item.originallink || item.link
      );

      const { error } = await supabase
        .from("news_articles_raw")
        .insert({
          source: "naver_api",
          url: item.originallink || item.link, // 원본 기사 URL
          title: clean(item.title, 300),
          description: clean(item.description, 500),
          published_at: item.pubDate
            ? new Date(item.pubDate).toISOString()
            : null,

          // ✅ ✅ ✅ 핵심 추가
          press_name: pressName,

          processed: false,
        });

      if (error) {
        errors.push({ q, url: item.link, error: error.message });
      } else {
        inserted++;
      }
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      inserted,
      error_count: errors.length,
      errors: errors.slice(0, 5),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});