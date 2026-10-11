/* 🌐 issue-outside — 이슈 '바깥 반응'(26.10.11)
   초기 판이 텅 비어 보이는 걸 조작 없이 채운다: 이슈 키워드로 네이버 카페·블로그를 검색해
   실제 외부 글을 **출처와 함께** 보여 준다. 숫자·의견을 지어내지 않는다.

   - 입력: { issue_id } — 제목·태그는 DB 에서 읽는다(요청 본문을 믿지 않는다)
   - 캐시: issue_outside 6시간. 공개 이슈만. 익명 호출 가능(읽기 전용 결과, 이슈 수만큼만 갱신되므로 남용 상한 있음)
   - 네이버 검색 API(일 25,000회) — NAVER_SEARCH_ID/SECRET (없으면 NAVER_CLIENT_*) */
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const TTL_MS = 6 * 3600 * 1000;
const CF_AI_TOKEN = Deno.env.get("CF_AI_TOKEN") || "";
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID") || "";
const MIN_SIM = Number(Deno.env.get("OUTSIDE_MIN_SIM") || "0.62"   /* 26.10.11 실측: 관련 0.64↑ / 엉뚱 0.59↓ */);

/* 🧲 의미 거르기 — 검색 결과엔 검색어가 다 들어 있어 단어 매칭으론 못 거른다(“미담 어린이 빵집”에 성심당 미담이 걸림).
   이슈 문장과 후보들을 bge-m3 로 한 번에 임베딩해 코사인이 MIN_SIM 이상인 것만 남긴다. 실패하면 거르지 않고 빈 결과(정확도 우선). */
async function embedBatch(texts: string[]): Promise<number[][] | null> {
  if (!CF_AI_TOKEN || !CF_ACCOUNT || !texts.length) return null;
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/baai/bge-m3`, {
      method: "POST", headers: { Authorization: `Bearer ${CF_AI_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: texts }), signal: AbortSignal.timeout(8000),
    });
    const j = await r.json();
    const d = j?.result?.data;
    return Array.isArray(d) && d.length === texts.length ? d : null;
  } catch { return null; }
}
const cos = (a: number[], b: number[]) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

const strip = (s: string) => String(s || "")
  .replace(/<[^>]+>/g, "")
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();

// 너무 넓은 태그는 검색어에서 뺀다(그 말만으로는 다른 얘기가 잔뜩 걸린다)
const GENERIC = new Set(["사회", "정치", "이슈", "논란", "사건", "사고", "뉴스", "한국", "국내", "해외", "논쟁", "여론", "반응", "사건사고", "안전사고"]);

function buildQuery(title: string, tags: string[] | null): string {
  const t = (tags || []).map((x) => String(x).trim()).filter((x) => x.length >= 2 && !GENERIC.has(x));
  if (t.length >= 2) return t.slice(0, 3).join(" ");
  // 태그가 빈약하면 제목에서 2글자 이상 명사구 몇 개
  const words = title.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length >= 2 && !GENERIC.has(w));
  return [...t, ...words].slice(0, 3).join(" ");
}

async function naver(kind: "cafearticle" | "blog", q: string, n: number) {
  if (!S_ID || !S_SEC || !q) return [];
  const u = new URL(`https://openapi.naver.com/v1/search/${kind}.json`);
  u.searchParams.set("query", q); u.searchParams.set("display", String(n)); u.searchParams.set("sort", "sim");
  try {
    const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const d = await r.json();
    return (d.items || []).map((it: Record<string, string>) => ({
      kind: kind === "blog" ? "blog" : "cafe",
      src: strip(kind === "blog" ? it.bloggername : it.cafename) || (kind === "blog" ? "블로그" : "카페"),
      title: strip(it.title).slice(0, 120),
      desc: strip(it.description).replace(/#[^\s#]+/g, "").replace(/\s+/g, " ").trim().slice(0, 160),   // 해시태그 나열 제거
      url: /^https?:\/\//i.test(it.link || "") ? it.link : "",
      date: it.postdate || null,
    })).filter((x: { url: string; title: string }) => x.url && x.title);
  } catch { return []; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  let body: { issue_id?: number } = {};
  try { body = await req.json(); } catch { /* */ }
  const id = Number(body.issue_id);
  if (!Number.isFinite(id) || id <= 0) return j({ ok: false, reason: "bad_id" }, 400);

  const { data: cached } = await sb.from("issue_outside").select("items, fetched_at").eq("issue_id", id).maybeSingle();
  if (cached && Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS) return j({ ok: true, cached: true, items: cached.items });

  const { data: iss } = await sb.from("issues").select("title, one_line, tags, visibility").eq("id", id).maybeSingle();
  if (!iss?.title) return j({ ok: false, reason: "not_found" }, 404);
  if (iss.visibility && iss.visibility !== "public") return j({ ok: false, reason: "not_public" }, 403);

  const q = buildQuery(iss.title, iss.tags);
  const [cafe, blog] = await Promise.all([naver("cafearticle", q, 20), naver("blog", q, 10)]);
  // 카페(커뮤니티 반응) 우선, 블로그로 보충 — 같은 주소 중복 제거
  const seen = new Set<string>();
  const cands = [...cafe, ...blog].filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));
  const issueText = iss.title + (iss.one_line ? " — " + iss.one_line : "");
  const vecs = await embedBatch([issueText, ...cands.map((c) => c.title + " " + c.desc)]);
  const items: Record<string, unknown>[] = [];
  if (vecs) {
    const all = cands.map((c, i) => ({ c, s: cos(vecs[0], vecs[i + 1]) })).sort((a, b) => b.s - a.s);
    const scored = all.filter((x) => x.s >= MIN_SIM);
    for (const { c, s } of scored.slice(0, 6)) items.push({ ...c, sim: Math.round(s * 100) / 100 });
  }
  await sb.from("issue_outside").upsert({ issue_id: id, query: q, items, fetched_at: new Date().toISOString() });
  return j({ ok: true, cached: false, query: q, items });
});
