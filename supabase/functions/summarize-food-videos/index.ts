// 영상마다 '이 집을 어떻게 소개했나'를 한 줄로 만든다 — 상세의 재생 영상 카드에 붙는다.
//
// 🔑 DEEPSEEK_API_KEY (없으면 GEMINI_API_KEY 로 폴백)
//
// 왜: 상세를 열면 채널 로고와 영상 제목뿐이다. 제목은 "디저트 특집! 후식이 명란 밥!" 처럼
// **회차 제목**이라 이 집이 왜 나왔는지 눌러보기 전엔 모른다. 눌러야 아는 건 미리보기가 아니다.
//
// 가게 단위가 아니라 **영상 단위**로 붙인다 — 같은 집이 여러 영상에 나오면 영상마다 다른
// 얘기를 하기 때문이다. 한 영상에 여러 집이 나오면 한 번의 호출로 집마다 따로 뽑는다.
//
// ⚠️ 이건 기존 1,101편을 메우는 배치다. **새로 수확되는 영상은 harvest-creator-places 가
//    같은 LLM 호출에서 blurb 까지 받아오므로 여기 올 일이 없다(추가 비용 0).**

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const GEM = Deno.env.get("GEMINI_API_KEY") || "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

let dsDead = false;
const aiErrors: string[] = [];

async function chatJson(sys: string, user: string): Promise<string | null> {
  if (DS && !dsDead) {
    const r = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
    if (r.status === 402 || r.status === 401) dsDead = true;
    if (aiErrors.length < 4) aiErrors.push(`deepseek ${r.status}`);
  }
  if (!GEM) return null;
  const u = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEM}`;
  const g = await fetch(u, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!g.ok) { if (aiErrors.length < 6) aiErrors.push(`gemini ${g.status}`); return null; }
  return (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/* 문장 규칙이 곧 품질이다. 제목을 되풀이하거나 "맛있는 집" 같은 말을 쓰면 안 붙이느니만 못하다.
   설명에 근거가 없으면 **빈 문자열**을 주게 한다 — 지어낸 한 줄이 없는 것보다 나쁘다. */
const SYS = [
  "너는 한국 음식 유튜브 영상의 제목·설명을 읽고, 거기 나온 음식점 각각에 대해",
  "'이 영상이 이 집을 어떻게 소개했는지'를 한 문장으로 요약하는 요약기다.",
  "규칙:",
  "1) 한 문장, 45자 이내. 마침표 없이 명사형으로 끝낸다. 예: '숯불에 구워 내는 생삼겹 전문'",
  "2) 설명에 적힌 사실만 쓴다 — 대표 메뉴·조리 방식·특징·가격대. **지어내지 않는다.**",
  "3) 근거가 없으면 그 집은 blurb 를 빈 문자열로 준다. 억지로 채우지 않는다.",
  "4) '맛있다'·'존맛'·'대박' 같은 감상은 쓰지 않는다. 무엇을 파는 집인지가 먼저다.",
  "5) 영상 제목을 그대로 옮기지 않는다. 회차 제목은 그 집 얘기가 아니다.",
  "6) 채널명·구독·협찬 문구는 넣지 않는다.",
  'JSON 만: {"blurbs":[{"name":"상호","blurb":"한 문장"}]}',
].join("\n");

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!DS && !GEM) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "20"), 60);
  const { data: vids } = await supa.rpc("food_videos_to_blurb", { p_limit: n });
  const list = (vids || []) as any[];
  if (!list.length) return j({ ok: true, picked: 0, note: "요약할 영상 없음" });

  const t0 = Date.now();
  const rows: any[] = [];
  let done = 0, empty = 0, halted = "";

  for (const v of list) {
    if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; break; }
    const names = (v.places || []).map((p: any) => p.name).join(" · ");
    let out: any = null;
    try {
      const raw = await chatJson(
        SYS,
        `제목: ${v.title}\n\n이 영상에 나온 가게: ${names}\n\n설명:\n${v.description || ""}`,
      );
      out = raw ? JSON.parse(raw) : null;
    } catch (_) { out = null; }
    done++;
    const got: any[] = out?.blurbs || [];

    /* 상호를 정규화해 맞춘다 — LLM 이 띄어쓰기·지점명을 조금씩 바꿔 돌려준다 */
    const norm = (s: string) => String(s || "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();
    for (const p of (v.places || [])) {
      const hit = got.find((b: any) => {
        const a = norm(b?.name), c = norm(p.name);
        return a && c && (a === c || a.includes(c) || c.includes(a));
      });
      const text = String(hit?.blurb || "").trim();
      if (!text) { empty++; continue; }
      rows.push({ video_id: v.video_id, place_id: p.id, blurb: text });
    }
  }

  let set = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await supa.rpc("food_blurb_set", { p_rows: rows.slice(i, i + 200) });
    set += Number(data?.set || 0);
  }
  return j({ ok: true, picked: list.length, videos: done, set, empty,
             halted: halted || undefined, ai: aiErrors });
});
