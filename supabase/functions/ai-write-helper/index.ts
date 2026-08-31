// supabase/functions/ai-write-helper/index.ts
import { serve } from "https://deno.land/std@0.192.0/http/server.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

serve(async (req) => {
  /* ================= CORS ================= */
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers":
          "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const {
      text,
      stance = "neutral",
      tone = 3,
      custom_prompt = null,
    } = await req.json();

    if (!text || !text.trim()) {
      return json({ error: "텍스트가 비어 있습니다." }, 400);
    }

    /* ======================================================
       1️⃣ 어조 강도 매핑 (tone: 1~5)
    ====================================================== */
    const toneMap: Record<number, string> = {
      5: "매우 공격적이지만 욕설·폭력·선동은 사용하지 않는다.",
      4: "공격적이고 직설적인 어조를 사용한다.",
      3: "중립적이고 설명적인 어조를 유지한다.",
      2: "온화하고 조심스러운 어조로 정리한다.",
      1: "매우 온화하며 설득 중심으로 작성한다.",
    };

    const tonePrompt = toneMap[tone] ?? toneMap[3];

    /* ======================================================
       2️⃣ 논쟁 입장(stance) 매핑
    ====================================================== */
    const stanceMap: Record<string, string> = {
      neutral: `
- 특정 입장을 들지 않는다.
- 쟁점이 무엇인지 구조적으로 정리한다.
- 찬성과 반대가 갈리는 이유를 모두 제시한다.
`,
      pro: `
- 찬성 입장에서 논리를 강화한다.
- 반대 의견이 왜 설득력이 약하다고 볼 수 있는지 언급한다.
- 결론은 찬성 방향으로 정리한다.
`,
      con: `
- 반대 입장에서 논리를 강화한다.
- 찬성 의견의 한계와 위험 요소를 지적한다.
- 결론은 반대 방향으로 정리한다.
`,
      dual: `
- 찬성 논리와 반대 논리를 명확히 분리해 제시한다.
- 어느 쪽도 최종 결론으로 단정하지 않는다.
- 독자가 비교·판단할 수 있도록 구성한다.
`,
      question: `
- 결론을 제시하지 않는다.
- 독자가 스스로 판단하도록 질문 중심으로 구성한다.
- 쟁점의 모순과 선택지를 드러낸다.
`,
    };

    const stancePrompt = stanceMap[stance] ?? stanceMap.neutral;

    /* ======================================================
       3️⃣ 시스템 프롬프트 (고정 규칙)
    ====================================================== */
    const systemPrompt = `
너는 "논쟁용 글"을 만드는 AI다.

❗중요 규칙
- 글을 예쁘게 쓰는 것이 목적이 아니다.
- 감정 표현을 제거하고 논리 구조를 재구성하는 것이 핵심이다.
- 사실 여부 판단, 사상 판단, 정치적 옳고 그름은 하지 않는다.
- 선동, 혐오, 폭력 조장은 절대 하지 않는다.

출력 목표:
- 논쟁이 가능한 형태의 글
- 독자가 찬반 중 어디에 설지 고민하게 만드는 구조
`;

    /* ======================================================
       4️⃣ 최종 유저 프롬프트
    ====================================================== */
    const userPrompt = `
[논쟁 입장 규칙]
${stancePrompt}

[어조 강도 규칙]
${tonePrompt}

${custom_prompt ? `[추가 사용자 지시]\n${custom_prompt}\n` : ""}

[원문]
"""
${text}
"""

위 기준을 모두 지켜 하나의 완성된 글로 재구성하라.
`;

    /* ======================================================
       5️⃣ OpenAI 호출 (✅ 수정 완료)
    ====================================================== */
    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.6,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      }
    );

    const jsonRes = await response.json();
    console.log("[OPENAI RAW RESPONSE]", JSON.stringify(jsonRes));

    const result = jsonRes?.choices?.[0]?.message?.content;

    if (!result) {
      throw new Error("OpenAI returned empty result");
    }

    return json({ result });

  } catch (err) {
    console.error("[AI WRITE ERROR]", err);
    return json({ error: "AI 처리 중 오류 발생" }, 500);
  }
});

/* ================= 공통 JSON 헬퍼 ================= */
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}