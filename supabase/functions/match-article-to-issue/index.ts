import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/* =========================
   Utils
========================= */
function tokenize(text: string): string[] {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[^가-힣a-zA-Z0-9\s]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length >= 2);
}

function overlapScore(a: string[], b: string[]) {
  return a.filter(w => b.includes(w)).length;
}

/* =========================
   MAIN
========================= */
serve(async () => {
  // 1️⃣ issue_id 없는 기사 가져오기
  const { data: articles, error } = await supabase
    .from("news_articles")
    .select("id, title, published_at, category")
    .is("issue_id", null)
    .order("published_at", { ascending: true })
    .limit(100);

  if (error || !articles || articles.length === 0) {
    return new Response(JSON.stringify({ success: true, processed: 0 }));
  }

  let linked = 0;
  let created = 0;

  for (const article of articles) {
    const words = tokenize(article.title);
    if (!words.length) continue;

    // 2️⃣ 최근 48시간 이슈 후보
    const since = new Date(article.published_at);
    since.setHours(since.getHours() - 48);

    const { data: issues } = await supabase
      .from("news_issues")
      .select("id, issue_title, articles_count")
      .eq("category", article.category)
      .gte("last_article_at", since.toISOString())
      .order("last_article_at", { ascending: false })
      .limit(30);

    let matchedIssue: any = null;

    for (const issue of issues || []) {
      const issueWords = tokenize(issue.issue_title);
      if (overlapScore(words, issueWords) >= 2) {
        matchedIssue = issue;
        break;
      }
    }

    // 3️⃣ 이슈 없으면 새로 생성
    if (!matchedIssue) {
      const { data: newIssue } = await supabase
        .from("news_issues")
        .insert({
          issue_title: article.title,
          issue_summary: article.title,
          category: article.category,
          articles_count: 0,
          last_article_at: article.published_at
        })
        .select()
        .single();

      if (!newIssue) continue;
      matchedIssue = newIssue;
      created++;
    }

    // 4️⃣ 기사 → 이슈 연결
    await supabase
      .from("news_articles")
      .update({ issue_id: matchedIssue.id })
      .eq("id", article.id);

    // 5️⃣ 이슈 메타 업데이트
    await supabase
      .from("news_issues")
      .update({
        articles_count: (matchedIssue.articles_count || 0) + 1,
        last_article_at: article.published_at
      })
      .eq("id", matchedIssue.id);

    linked++;
  }

  return new Response(
    JSON.stringify({
      success: true,
      linked_articles: linked,
      created_issues: created
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});