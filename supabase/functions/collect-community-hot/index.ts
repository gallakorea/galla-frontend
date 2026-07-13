// 🔥 커뮤니티 인기글 수집 — 디씨 실베·펨코 포텐 (일베 등 고위험 소스 제외)
// 제목/링크/썸네일/점수만 수집(본문 복제 X). 안전 키워드 사전필터. community_hot에 upsert.
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

// 안전 사전필터 — 혐오·불법·정치극단·개인정보 유발 키워드 포함 시 수집 자체를 스킵
const BLOCK = ["일베","전라디언","홍어","슴가","분탕","https://","좌좀","우꼴","한남","김치녀","된장녀","보슬","자살","마약","도박","성인","19금","섹","야동","불법","주작","박제","신상","전번","계좌"];
function blocked(t: string) { const s = (t||"").toLowerCase(); return BLOCK.some(w => s.includes(w.toLowerCase())); }

async function fetchDoc(url: string) {
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ko-KR,ko;q=0.9" }, redirect: "follow" });
  if (!r.ok) throw new Error(`fetch ${r.status}`);
  const html = await r.text();
  return new DOMParser().parseFromString(html, "text/html");
}

// 소스별 파서 (모바일 베스트 리스트) — 사이트 구조 변경 시 셀렉터만 조정
async function collectDcinside() {
  const out: any[] = [];
  try {
    const doc = await fetchDoc("https://m.dcinside.com/board/dcbest");
    if (!doc) return out;
    doc.querySelectorAll("a").forEach((a: any) => {
      const href = a.getAttribute("href") || "";
      const title = (a.textContent || "").trim();
      if (!/\/board\/\w+\/\d+/.test(href)) return;      // 게시글 링크 패턴
      if (title.length < 6 || title.length > 120) return;
      const url = href.startsWith("http") ? href : "https://m.dcinside.com" + href;
      out.push({ source: "dcinside", src_title: title, src_url: url, thumb: null, score: 0 });
    });
  } catch (_) {}
  return out.slice(0, 15);
}
async function collectFmkorea() {
  const out: any[] = [];
  try {
    const doc = await fetchDoc("https://www.fmkorea.com/best");
    if (!doc) return out;
    doc.querySelectorAll("a").forEach((a: any) => {
      const href = a.getAttribute("href") || "";
      const title = (a.textContent || "").trim();
      if (!/^\/\d+$|fmkorea\.com\/\d+/.test(href)) return;
      if (title.length < 6 || title.length > 120) return;
      const url = href.startsWith("http") ? href : "https://www.fmkorea.com" + href;
      out.push({ source: "fmkorea", src_title: title, src_url: url, thumb: null, score: 0 });
    });
  } catch (_) {}
  return out.slice(0, 15);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let items: any[] = [];
  for (const c of [collectDcinside, collectFmkorea]) {
    try { items = items.concat(await c()); } catch (_) {}
  }
  // 중복 제거(제목) + 안전필터
  const seen = new Set<string>();
  const clean = items.filter(i => {
    const k = (i.src_title || "").replace(/\s+/g, "");
    if (!i.src_url || seen.has(k)) return false; seen.add(k);
    if (blocked(i.src_title)) return false;
    return true;
  });
  let inserted = 0;
  for (const i of clean) {
    const { error } = await sb.from("community_hot").upsert(i, { onConflict: "src_url", ignoreDuplicates: true });
    if (!error) inserted++;
  }
  return new Response(JSON.stringify({ ok: true, fetched: items.length, clean: clean.length, inserted }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
