import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4.52.0";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY")!,
});

serve(async (req) => {
  try {
    /* --------------------------------------------------
       1. Request Body
    -------------------------------------------------- */
    const {
      issue_id,
      article_title,
      article_body,
      source,
      url,
    } = await req.json();

    if (!issue_id || !article_title || !article_body || !url) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields",
          required: ["issue_id", "article_title", "article_body", "url"],
        }),
        { status: 400 }
      );
    }

    const numericIssueId = Number(issue_id);
    if (Number.isNaN(numericIssueId)) {
      return new Response(
        JSON.stringify({ error: "issue_id must be a number" }),
        { status: 400 }
      );
    }

    /* --------------------------------------------------
       2. 🔒 중복 기사 체크 (핵심)
       기준: issue_id + link
    -------------------------------------------------- */
    const { data: existing, error: dupError } = await supabase
      .from("ai_news")
      .select("id")
      .eq("issue_id", numericIssueId)
      .eq("link", url)
      .limit(1);

    if (dupError) throw dupError;

    if (existing && existing.length > 0) {
      // 이미 저장된 기사 → 정상 응답으로 종료
      return new Response(
        JSON.stringify({
          ok: true,
          duplicated: true,
          issue_id: numericIssueId,
        }),
        { status: 200 }
      );
    }

    /* --------------------------------------------------
       3. 이슈 클러스터(A/B) 조회
    -------------------------------------------------- */
    const { data: clusters, error: clusterError } = await supabase
      .from("issue_clusters")
      .select("cluster_key, label, description")
      .eq("issue_id", numericIssueId);

    if (clusterError) throw clusterError;

    const a = clusters?.find((c) => c.cluster_key === "A");
    const b = clusters?.find((c) => c.cluster_key === "B");

    if (!a || !b) {
      return new Response(
        JSON.stringify({ error: "Clusters A/B not found" }),
        { status: 400 }
      );
    }

    /* --------------------------------------------------
       4. GPT 기사 → A/B 분류
    -------------------------------------------------- */
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "기사를 두 논점 중 더 가까운 쪽으로 분류하라. A 또는 B만 JSON으로 출력.",
        },
        {
          role: "user",
          content: `
[논점 A]
${a.label}
${a.description}

[논점 B]
${b.label}
${b.description}

[기사 제목]
${article_title}

[기사 본문]
${article_body}

출력 형식:
{"matched_cluster":"A"} 또는 {"matched_cluster":"B"}
          `.trim(),
        },
      ],
    });

    let matchedCluster: "A" | "B" = "A";
    try {
      const parsed = JSON.parse(
        completion.choices[0].message.content ?? "{}"
      );
      if (parsed.matched_cluster === "B") matchedCluster = "B";
    } catch {}

    // A/B → pro/con 매핑
    const stance = matchedCluster === "A" ? "pro" : "con";

    /* --------------------------------------------------
       5. INSERT (중복 통과 후에만)
    -------------------------------------------------- */
    const { error: insertError } = await supabase.from("ai_news").insert({
      issue_id: numericIssueId,
      title: article_title,
      summary: article_body,
      source: source ?? null,
      link: url,
      stance,        // pro | con
      mode: "news",  // DB 체크 통과
    });

    if (insertError) throw insertError;

    /* --------------------------------------------------
       6. Response
    -------------------------------------------------- */
    return new Response(
      JSON.stringify({
        ok: true,
        duplicated: false,
        issue_id: numericIssueId,
        cluster: matchedCluster,
        stance,
      }),
      { status: 200 }
    );
  } catch (err) {
    console.error("match-article-to-cluster error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});