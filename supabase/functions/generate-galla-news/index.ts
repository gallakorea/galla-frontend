// 갈라뉴스 생성 — 최근 헤드라인을 AI로 주제별 묶고, 각 주제의 여러 소스를 종합해
// 우리 표현으로 새 기사 작성(사실 기반, 원문 복제 아님). 소스는 관련기사로 링크.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser, type Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o-mini";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function chat(messages: unknown[], maxTokens = 900): Promise<any> {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${OPENAI}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL, messages, temperature: 0.4,
      max_tokens: maxTokens, response_format: { type: "json_object" },
    }),
  });
  const j = await r.json();
  const txt = j?.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(txt); } catch { return {}; }
}

// 소스 본문 일부 추출 (합성 근거용, 각 ~1200자)
async function fetchBody(url: string): Promise<string> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    const resp = await fetch(url, { redirect: "follow", signal: ctl.signal, headers: { "User-Agent": UA } });
    clearTimeout(t);
    if (!resp.ok) return "";
    const doc = new DOMParser().parseFromString(await resp.text(), "text/html");
    if (!doc) return "";
    doc.querySelectorAll("script,style,nav,header,footer,aside").forEach((n) => n.remove());
    const sels = ["article", "[itemprop='articleBody']", "#dic_area", "#article_body", "#newsct_article", ".article-body", ".news_body", "#content"];
    let best: Element | null = null, bl = 0;
    for (const s of sels) {
      let els: Element[] = [];
      try { els = [...doc.querySelectorAll(s)] as Element[]; } catch { continue; }
      for (const el of els) {
        let n = 0; el.querySelectorAll("p").forEach((p) => n += (p.textContent || "").length);
        if (n > bl) { bl = n; best = el; }
      }
    }
    const ps: string[] = [];
    (best || doc).querySelectorAll("p").forEach((p) => {
      const s = (p.textContent || "").replace(/\s+/g, " ").trim();
      if (s.length >= 20) ps.push(s);
    });
    return ps.join("\n").slice(0, 1200);
  } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const MAX_TOPICS = Math.min(body.max_topics ?? 12, 20);
  const HOURS = body.hours ?? 12;

  // 1) 최근 헤드라인
  const since = new Date(Date.now() - HOURS * 3600e3).toISOString();
  const { data: arts } = await supa.from("news_articles_raw")
    .select("id,title,press_name,url,thumbnail_url,published_at")
    .gte("published_at", since)
    .not("thumbnail_url", "is", null).neq("thumbnail_url", "")
    .order("published_at", { ascending: false }).limit(120);
  if (!arts || arts.length < 4) return new Response(JSON.stringify({ ok: false, error: "not enough news" }), { headers: { ...cors, "Content-Type": "application/json" } });

  // 2) AI 주제 클러스터링
  const headlines = arts.map((a, i) => `${i}. ${a.title}`).join("\n");
  const cluster = await chat([
    { role: "system", content: "너는 한국 뉴스 데스크 편집자다. 헤드라인 목록에서 뉴스가치 있는 주제를 골라 같은 사건끼리 묶는다. 광고성/단순 홍보/선정적 가십은 제외. JSON만 출력." },
    { role: "user", content: `헤드라인:\n${headlines}\n\n지침: 뉴스가치 있는 주제 상위 ${MAX_TOPICS}개를 골라라. 같은 사건인 헤드라인은 index를 묶고(다중 소스 우선), 중요한 단독 기사는 members가 1개인 주제로 넣어도 된다. category는 [정치,경제,사회,세계,IT과학,문화,스포츠,연예] 중 하나.\n형식: {"topics":[{"topic":"핵심 주제 한 줄","category":"정치","members":[0,5]}]}` },
  ], 1100);

  const topics: Array<{ topic: string; category: string; members: number[] }> = cluster?.topics || [];

  async function processTopic(t: { topic: string; category: string; members: number[] }) {
    const members = (t.members || []).map((i) => arts[i]).filter(Boolean).slice(0, 4);
    if (!members.length) return null;
    const topicKey = (t.topic || "").replace(/\s+/g, "").toLowerCase().slice(0, 60);
    if (!topicKey) return null;

    // 이미 있으면 skip
    const { data: dup } = await supa.from("galla_news").select("id").eq("topic_key", topicKey).maybeSingle();
    if (dup) return null;

    // 소스 본문 확보 (상위 2개)
    const bodies = await Promise.all(members.slice(0, 2).map((m) => fetchBody(m.url)));
    const sourceText = members.slice(0, 2).map((m, i) =>
      `[출처 ${i + 1}] ${m.press_name || ""} - ${m.title}\n${bodies[i] || "(본문 없음)"}`).join("\n\n");
    const multi = members.length > 1;

    const gen = await chat([
      { role: "system", content: "너는 갈라뉴스 기자다. 주어진 취재 자료를 바탕으로 사실만 담은 새 기사를 우리 표현으로 작성한다. 규칙: (1) 원문 문장을 그대로 베끼지 말고 반드시 네 표현으로 다시 써라(특히 단독 자료일 때 더 확실히 재구성·요약). (2) 자료에 없는 사실은 지어내지 마라. (3) 중립적이고 담백하게. JSON만 출력." },
      { role: "user", content: `주제: ${t.topic}\n\n자료(${multi ? "여러 언론사" : "단독"}):\n${sourceText}\n\n형식: {"title":"제목","summary":"한 줄 요약","category":"${t.category || "사회"}","body":"${multi ? "3~5문단" : "2~4문단으로 핵심 요약·재구성"}, 각 문단은 빈 줄로 구분"}` },
    ], 900);

    if (!gen?.title || !gen?.body) return null;
    const hero = members.find((m) => m.thumbnail_url && /^https?:/.test(m.thumbnail_url))?.thumbnail_url || null;

    const { data: ins, error } = await supa.from("galla_news").insert({
      title: gen.title, summary: gen.summary || null, body: gen.body,
      category: gen.category || t.category || "사회", hero_image: hero,
      topic_key: topicKey, source_count: members.length,
    }).select("id").single();
    if (error || !ins) return { topic: t.topic, error: error?.message };

    await supa.from("galla_news_sources").insert(
      members.map((m) => ({
        news_id: ins.id, url: m.url, press_name: m.press_name,
        title: m.title, thumbnail_url: m.thumbnail_url, published_at: m.published_at,
      })),
    );
    return { topic: t.topic, id: ins.id, sources: members.length };
  }

  // 병렬 처리(시간 단축) — 토픽 수 늘려도 타임아웃 방지
  const settled = await Promise.allSettled(topics.slice(0, MAX_TOPICS).map(processTopic));
  const results = settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter(Boolean);

  return new Response(JSON.stringify({ ok: true, generated: results.length, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
