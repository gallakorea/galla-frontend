import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { parse } from "https://deno.land/x/xml@2.1.3/mod.ts";
import OpenAI from "https://esm.sh/openai@4.28.0";

/* ================================
   Basic Setup
================================ */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* ================================
   Utils
================================ */
const clean = (t: string) =>
  (t ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const getDomain = (url: string) =>
  (url ?? "").replace(/^https?:\/\//, "").split("/")[0] || "unknown";

function normalizeLink(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "object") {
    if (typeof raw["#text"] === "string") return raw["#text"].trim();
    if (Array.isArray(raw) && raw.length > 0) return normalizeLink(raw[0]);
  }
  return "";
}

function dedupeByLink(list: any[]) {
  const seen = new Set<string>();
  return list.filter((a) => {
    if (!a.link || seen.has(a.link)) return false;
    seen.add(a.link);
    return true;
  });
}

async function sbFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`[supabase] ${res.status} ${res.statusText} :: ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return await res.json();
}

/* ================================
   Server
================================ */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let issueId: number | null = null;

  try {
    const body = await req.json().catch(() => ({}));
    issueId = Number(body?.issue_id);
    const title = body?.title;
    const description = body?.description ?? "";

    if (!issueId || !title) {
      return new Response(
        JSON.stringify({ success: false, reason: "invalid_params" }),
        { headers: corsHeaders }
      );
    }

    /* --------------------------------------------------
       1) job pending 락
    -------------------------------------------------- */
    const job = await sbFetch(
      `/rest/v1/ai_news_jobs?issue_id=eq.${issueId}&mode=eq.news&select=status`
    );

    if (job?.[0]?.status === "pending") {
      return new Response(
        JSON.stringify({ success: true, skipped: "already_pending" }),
        { headers: corsHeaders }
      );
    }

    await sbFetch(`/rest/v1/ai_news_jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        issue_id: issueId,
        mode: "news",
        status: "pending",
        error: null,
        updated_at: new Date().toISOString(),
      }),
    });

    /* --------------------------------------------------
       2) Google News RSS 수집 (안전)
    -------------------------------------------------- */
    let articles: any[] = [];

    try {
      const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
        title
      )}&hl=ko&gl=KR&ceid=KR:ko`;

      const rssRes = await fetch(rssUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0",
        },
      });

      const text = await rssRes.text();
      const parsed: any = parse(text);

      const items =
        parsed?.rss?.channel?.item ??
        parsed?.rss?.channel?.[0]?.item ??
        [];

      articles = (Array.isArray(items) ? items : [items])
        .map((n: any) => {
          const link = normalizeLink(n?.link);
          return {
            title: clean(n?.title),
            link,
            source: getDomain(link),
          };
        })
        .filter((a) => a.title && a.link);

      articles = dedupeByLink(articles).slice(0, 6);
    } catch {
      articles = [];
    }

    /* --------------------------------------------------
       기사 2개 미만 → insufficient
    -------------------------------------------------- */
    if (articles.length < 2) {
      await sbFetch(
        `/rest/v1/ai_news_jobs?issue_id=eq.${issueId}&mode=eq.news`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "insufficient",
            error: null,
            updated_at: new Date().toISOString(),
          }),
        }
      );

      return new Response(
        JSON.stringify({
          success: true,
          news_status: "insufficient",
          article_count: articles.length,
        }),
        { headers: corsHeaders }
      );
    }

    /* --------------------------------------------------
       3) AI 분류
    -------------------------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "아래 기사들을 찬성(pro) 또는 반대(con)로 분류하라. JSON 배열만 반환하라.",
        },
        {
          role: "user",
          content: JSON.stringify({ issue: title, description, articles }),
        },
      ],
    });

    let mapping: { index: number; stance: "pro" | "con" }[] = [];

    try {
      mapping = JSON.parse(
        completion.choices[0].message.content.replace(/```json|```/g, "")
      );
    } catch {
      mapping = articles.map((_, i) => ({
        index: i,
        stance: i % 2 === 0 ? "pro" : "con",
      }));
    }

    await sbFetch(`/rest/v1/ai_news?issue_id=eq.${issueId}&mode=eq.news`, {
      method: "DELETE",
    });

    await sbFetch(`/rest/v1/ai_news`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mapping.map((m) => ({
          issue_id: issueId,
          mode: "news",
          status: "done",
          stance: m.stance,
          title: articles[m.index].title,
          link: articles[m.index].link,
          source: articles[m.index].source,
        }))
      ),
    });

    await sbFetch(
      `/rest/v1/ai_news_jobs?issue_id=eq.${issueId}&mode=eq.news`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "done",
          error: null,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    return new Response(
      JSON.stringify({ success: true }),
      { headers: corsHeaders }
    );
  } catch (e) {
    console.error("[generate-ai-news]", e);

    if (issueId) {
      await sbFetch(
        `/rest/v1/ai_news_jobs?issue_id=eq.${issueId}&mode=eq.news`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "insufficient",
            error: String(e),
            updated_at: new Date().toISOString(),
          }),
        }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: String(e) }),
      { headers: corsHeaders }
    );
  }
});