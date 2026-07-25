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

/* AI 일일 상한 — 플랫폼 전체 하루 예산(app_settings.ai_daily_caps)에서 1건 당긴다.
   한도 초과면 false로 AI 호출을 건너뛴다. DB가 죽었을 땐 통과시킨다(예산 조회 실패로 기능을 멈추지 않게). */
const AI_FN = "generate-galla-news";
async function aiBudgetOk(n = 1): Promise<boolean> {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_fn: AI_FN, p_n: n }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    if (j && j.ok === false) { console.warn("[ai-budget] blocked", AI_FN, JSON.stringify(j)); return false; }
    return true;
  } catch { return true; }
}

async function chat(messages: unknown[], maxTokens = 900): Promise<any> {
  if (!(await aiBudgetOk())) throw new Error("ai_daily_cap");
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

// 제목 단어 집합(2글자 이상) — 소스 관련성 판단용
function tokenize(s: string): Set<string> {
  return new Set(
    (s || "").replace(/[^가-힣A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length >= 2),
  );
}

// 카테고리 키워드 교정 — AI가 경제/정치/스포츠 기사를 문화 등으로 잘못 라벨하는 걸 바로잡는다.
const CAT_RULES: Array<[string, RegExp]> = [
  ["경제", /금리|주가|증시|코스피|코스닥|나스닥|환율|부동산|집값|전셋값|물가|수출|무역|반도체|실적|매출|영업이익|투자|재정|예산|세금|대출|연봉|임금|고용|경기|무역수지|가상자산|비트코인/],
  ["정치", /대통령|국회|여당|야당|의원|장관|정당|총선|대선|외교|정상회담|법안|개헌|탄핵|청와대|대통령실|국정감사|공천/],
  ["스포츠", /야구|축구|농구|배구|골프|올림픽|월드컵|리그|국가대표|선수|감독|경기|우승|메달|KBO|프로야구|손흥민|류현진/],
  ["IT과학", /인공지능|반도체|스마트폰|앱\b|플랫폼|우주|위성|백신|바이러스|연구진|논문|과학자|배터리|전기차|로봇/],
];
function fixCategory(cat: string, text: string): string {
  for (const [c, re] of CAT_RULES) if (re.test(text)) return c;
  return cat;
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
    { role: "user", content: `헤드라인:\n${headlines}\n\n지침: 뉴스가치 있는 주제 상위 ${MAX_TOPICS}개를 골라라. ⚠️ 같은 '사건·인물·사안'인 헤드라인만 묶어라 — 인물·분야·주제가 다르면 절대 한 members로 묶지 마라(예: 배우 복귀 기사와 축구 경기 기사를 함께 묶으면 안 됨). 확실히 같은 사건이 아니면 각각 members 1개로 분리해라. category는 기사 내용에 맞게 [정치,경제,사회,세계,IT과학,문화,스포츠,연예] 중 하나로 정확히 고른다.\n형식: {"topics":[{"topic":"핵심 주제 한 줄","category":"정치","members":[0,5]}]}` },
  ], 1100);

  const topics: Array<{ topic: string; category: string; members: number[] }> = cluster?.topics || [];

  async function processTopic(t: { topic: string; category: string; members: number[] }) {
    const members = (t.members || []).map((i) => arts[i]).filter(Boolean).slice(0, 4);
    if (!members.length) return null;
    const topicKey = (t.topic || "").replace(/\s+/g, "").toLowerCase().slice(0, 60);
    if (!topicKey) return null;

    // ── 중복 방지 ────────────────────────────────────────
    // ⚠️ topic_key 완전일치만 보던 방식은 사실상 작동하지 않았다(2026-07-25 실측:
    //    2일 2,272건 / topic_key 2,272개 = 중복 판정 0건, 그런데 "이강인 이적"류는 4~5번씩 생성).
    //    topic_key가 'AI가 매번 새로 지어내는 주제 문장'에서 나오니 표현이 조금만 달라도 안 겹친다.
    //    → 원본 기사 URL이 겹치는지로 본다. AI 표현이 어떻든 취재원이 같으면 같은 사건이다.
    const { data: dup } = await supa.from("galla_news").select("id").eq("topic_key", topicKey).maybeSingle();
    if (dup) return null;

    const urls = members.map((m) => m.url).filter(Boolean);
    if (urls.length) {
      const since48 = new Date(Date.now() - 48 * 3600e3).toISOString();
      const { data: seen } = await supa.from("galla_news_sources")
        .select("news_id, galla_news!inner(created_at)")
        .in("url", urls)
        .gte("galla_news.created_at", since48)
        .limit(1);
      if (seen && seen.length) return null;   // 같은 원본으로 이미 썼다
    }

    // URL 겹침만으론 부족하다(2026-07-25 실측): 언론사들이 같은 사건을 몇 시간에 걸쳐
    // 계속 '새 URL'로 쏟아내므로, 취재원이 달라도 사건은 같은 경우가 남는다
    // (이강인 이적 → 4~5회 중복의 실제 원인). 그래서 제목 단어 겹침도 함께 본다.
    {
      const since48 = new Date(Date.now() - 48 * 3600e3).toISOString();
      const { data: recent } = await supa.from("galla_news")
        .select("title").gte("created_at", since48).limit(400);
      const mine = tokenize(members.map((m) => m.title).join(" "));
      if (mine.size >= 2) {
        for (const r of (recent || [])) {
          const his = tokenize(r.title || "");
          if (his.size < 2) continue;
          let ov = 0;
          for (const w of mine) if (his.has(w)) ov++;
          // 상대 제목 단어의 60% 이상이 겹치면 같은 사건으로 본다
          if (ov / his.size >= 0.6) return null;
        }
      }
    }

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

    // ── 관련성 필터 ──────────────────────────────────────
    // AI 클러스터링이 가끔 무관한 기사(예: 김수현 기사에 음바페)를 한 주제로 묶는다.
    // 생성된 제목과 단어가 겹치는 소스만 '관련 기사'로 남기고, 썸네일도 거기서 뽑는다.
    const genTok = tokenize(`${gen.title} ${gen.summary || ""}`);
    const scored = members.map((m) => ({
      m, ov: [...tokenize(m.title)].filter((w) => genTok.has(w)).length,
    })).sort((a, b) => b.ov - a.ov);
    let rel = scored.filter((s) => s.ov > 0).map((s) => s.m);
    if (!rel.length) rel = [scored[0].m];          // 하나도 안 겹치면 최상위 1개 유지
    const hero = rel.find((m) => m.thumbnail_url && /^https?:/.test(m.thumbnail_url))?.thumbnail_url || null;

    const category = fixCategory(gen.category || t.category || "사회", `${gen.title} ${gen.summary || ""}`);

    const { data: ins, error } = await supa.from("galla_news").insert({
      title: gen.title, summary: gen.summary || null, body: gen.body,
      category, hero_image: hero,
      topic_key: topicKey, source_count: rel.length,
    }).select("id").single();
    if (error || !ins) return { topic: t.topic, error: error?.message };

    await supa.from("galla_news_sources").insert(
      rel.map((m) => ({
        news_id: ins.id, url: m.url, press_name: m.press_name,
        title: m.title, thumbnail_url: m.thumbnail_url, published_at: m.published_at,
      })),
    );
    return { topic: t.topic, id: ins.id, sources: rel.length };
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
