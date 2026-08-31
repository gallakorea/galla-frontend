import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Cluster = "A" | "B";

serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json();
    const { news_id } = body;

    if (!news_id) {
      return new Response(
        JSON.stringify({ error: "news_id is required" }),
        { status: 400 }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /* -------------------------------------------------
       1) 기준 news 조회
    ------------------------------------------------- */
    const { data: news, error: newsErr } = await supabase
      .from("ai_news")
      .select("id, issue_id, title, summary")
      .eq("id", news_id)
      .eq("mode", "news")
      .single();

    if (newsErr || !news) {
      return new Response(
        JSON.stringify({ error: "News not found" }),
        { status: 404 }
      );
    }

    const issueId = news.issue_id;

    /* -------------------------------------------------
       2) 이미 argument가 있으면 스킵
    ------------------------------------------------- */
    const { data: exists } = await supabase
      .from("ai_news")
      .select("id")
      .eq("issue_id", issueId)
      .eq("mode", "argument")
      .limit(1);

    if (exists && exists.length > 0) {
      return new Response(
        JSON.stringify({
          ok: true,
          skipped: true,
          reason: "arguments already exist",
        }),
        { status: 200 }
      );
    }

    /* -------------------------------------------------
       3) 클러스터 결정 (MVP 규칙)
       - A: 성과/능력/위기대응 프레임
       - B: 갈등/리스크/사회적 비용 프레임
    ------------------------------------------------- */
    const cluster: Cluster =
      /위기|대응|성과|능력|극복|성장/.test(news.title + " " + news.summary)
        ? "A"
        : "B";

    /* -------------------------------------------------
       4) 클러스터별 찬/반 논지 생성
    ------------------------------------------------- */
    const proByCluster: Record<Cluster, string> = {
      A: "위기 대응 능력과 실행력은 국가 리더십에서 핵심적인 강점으로 평가될 수 있다.",
      B: "사회적 갈등을 관리하면서도 정책을 추진하려는 시도는 일정 부분 긍정적으로 볼 수 있다.",
    };

    const conByCluster: Record<Cluster, string> = {
      A: "강한 추진력은 충분한 사회적 합의 없이 정책이 진행될 위험을 내포한다.",
      B: "정책 추진 과정에서 발생하는 갈등과 분열은 장기적 비용으로 작용할 수 있다.",
    };

    const proArgument = {
      issue_id: issueId,
      title: `[${cluster}] ${news.title} – 찬성`,
      summary: proByCluster[cluster],
      mode: "argument",
      stance: "pro",
      source: "GALLA AI",
      link: null,
    };

    const conArgument = {
      issue_id: issueId,
      title: `[${cluster}] ${news.title} – 반대`,
      summary: conByCluster[cluster],
      mode: "argument",
      stance: "con",
      source: "GALLA AI",
      link: null,
    };

    /* -------------------------------------------------
       5) Insert
    ------------------------------------------------- */
    const { error: insertErr } = await supabase
      .from("ai_news")
      .insert([proArgument, conArgument]);

    if (insertErr) {
      return new Response(
        JSON.stringify({
          error: "Insert failed",
          detail: insertErr.message,
        }),
        { status: 500 }
      );
    }

    /* -------------------------------------------------
       6) 응답
    ------------------------------------------------- */
    return new Response(
      JSON.stringify({
        ok: true,
        issue_id: issueId,
        cluster,
        generated: ["pro", "con"],
      }),
      { status: 200 }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: "Unexpected error",
        detail: String(e),
      }),
      { status: 500 }
    );
  }
});