import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import OpenAI from "https://esm.sh/openai@4.52.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const openai = new OpenAI({
  apiKey: Deno.env.get("OPENAI_API_KEY"),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    const { issue_id, title, content } = await req.json();

    if (!issue_id || !title || !content) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // 1️⃣ OpenAI 호출 — 논점 클러스터 생성
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `
너는 판단자가 아니다.
하나의 이슈에 대해 실제로 존재하는 주요 입장을
논점 클러스터 형태로 정리한다.

규칙:
- 찬성/반대 단어 사용 금지
- 옳고 그름 판단 금지
- 반드시 논점은 정확히 2개
- JSON만 출력
          `,
        },
        {
          role: "user",
          content: `
제목:
${title}

본문:
${content}

출력 형식:
{
  "issue_question": "...",
  "clusters": [
    { "cluster_key": "A", "label": "...", "description": "..." },
    { "cluster_key": "B", "label": "...", "description": "..." }
  ]
}
          `,
        },
      ],
    });

    const parsed = JSON.parse(completion.choices[0].message.content);

    // 2️⃣ issues 테이블 업데이트
    await supabase
      .from("issues")
      .update({ issue_question: parsed.issue_question })
      .eq("id", issue_id);

    // 3️⃣ 기존 클러스터 삭제 (재생성 대비)
    await supabase
      .from("issue_clusters")
      .delete()
      .eq("issue_id", issue_id);

    // 4️⃣ 클러스터 A/B 저장
    const clusterRows = parsed.clusters.map((c: any) => ({
      issue_id,
      cluster_key: c.cluster_key,
      label: c.label,
      description: c.description,
    }));

    await supabase
      .from("issue_clusters")
      .insert(clusterRows);

    return new Response(
      JSON.stringify({
        ok: true,
        issue_question: parsed.issue_question,
        clusters: parsed.clusters,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error(err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500 }
    );
  }
});