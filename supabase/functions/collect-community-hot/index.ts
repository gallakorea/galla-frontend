// 🔥 커뮤니티 인기글 수집 — 상위 커뮤니티 다수 (일베 등 고위험 제외)
// 제목/링크/썸네일만 수집(본문 복제 X). 안전 키워드 사전필터 + 제목 정규화 중복제거.
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

// 안전 사전필터 — 혐오·불법·정치극단·개인정보·성인 유발 키워드
const BLOCK = ["일베","전라디언","홍어","분탕","좌좀","우꼴","한남충","김치녀","된장녀","자살","마약","도박","성인","19금","야동","불법촬영","주작","박제","신상털","섹스","자위","성기"];
function blocked(t: string) { const s = (t || "").toLowerCase(); return BLOCK.some(w => s.includes(w.toLowerCase())); }

// 제목 정리: 앞 "이미지"/[XX갤]/[XX] 태그·공백 정돈
function cleanTitle(t: string) {
  return (t || "").replace(/^이미지\s*/, "").replace(/^\[[^\]]{1,10}\]\s*/, "").replace(/\s+/g, " ").trim();
}
function titleKey(t: string) { return cleanTitle(t).replace(/[^가-힣a-z0-9]/gi, "").toLowerCase(); }

// 소스 설정 (베스트/인기 페이지 + 게시글 링크 패턴). 일베 제외. 구조 변경 시 여기만 조정.
// ua:"pc" 는 모바일 UA를 차단/다른레이아웃 주는 사이트(뽐뿌·보배·클리앙)용.
type Src = { name: string; url: string; re: RegExp; base: string; ua?: "pc"; warm?: string };
const SOURCES: Src[] = [
  { name: "dcinside",   url: "https://m.dcinside.com/board/dcbest",                        re: /\/board\/[\w]+\/\d+/,                             base: "https://m.dcinside.com" },
  { name: "ruliweb",    url: "https://bbs.ruliweb.com/best",                               re: /\/(best|community|news)\/board\/\d+\/read\/\d+/,  base: "https://bbs.ruliweb.com" },
  { name: "arca.live",  url: "https://arca.live/b/live",                                   re: /\/b\/[\w]+\/\d{5,}/,                              base: "https://arca.live" },
  { name: "inven",      url: "https://m.inven.co.kr/board/webzine/2097",                   re: /\/board\/webzine\/\d+\/\d+/,                      base: "https://m.inven.co.kr" },
  { name: "mlbpark",    url: "https://mlbpark.donga.com/mp/best.php",                      re: /\/mp\/b\.php\?[^"'#]*b=/,                         base: "https://mlbpark.donga.com" },
  { name: "ppomppu",    url: "https://www.ppomppu.co.kr/hot.php",                          re: /\/zboard\/view\.php\?[^"'#]*no=\d+/,              base: "https://www.ppomppu.co.kr", ua: "pc" },
  { name: "pann",       url: "https://m.pann.nate.com/talk/ranking",                       re: /\/talk\/\d{5,}/,                                  base: "https://m.pann.nate.com" },
  { name: "instiz",     url: "https://www.instiz.net/pt",                                  re: /\/pt\/\d{5,}/,                                    base: "https://www.instiz.net" },
  { name: "bobaedream", url: "https://www.bobaedream.co.kr/list?code=best",               re: /\/view\?code=best&No=\d+/,                        base: "https://www.bobaedream.co.kr", ua: "pc" },
  { name: "humoruniv",  url: "https://web.humoruniv.com/board/humor/list.html?table=pds", re: /read\.html\?[^"'#]*number=\d+/,                   base: "https://web.humoruniv.com/board/humor/" },
  { name: "todayhumor", url: "https://m.todayhumor.co.kr/list.php?table=bestofbest",       re: /view\.php\?table=bestofbest&no=\d+/,              base: "https://m.todayhumor.co.kr/" },
  { name: "82cook",     url: "https://www.82cook.com/entiz/enti.php?bn=15",                re: /\/entiz\/read\.php\?num=\d+/,                     base: "https://www.82cook.com", ua: "pc" },
  // 서버수집 불가(데이터센터 IP 안티봇/피드잠금)로 제외: fmkorea(보안차단 430)·theqoo(피드잠금)·clien(빈스텁)·dogdrip(RSS잠금+차단)·etoland(JS SPA)
];

// 실제 브라우저처럼 보이는 헤더 (쿠키 없는 첫 요청을 막는 사이트 대응)
function browserHeaders(ua: string, referer: string, cookie?: string) {
  const h: Record<string, string> = {
    "User-Agent": ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    "Referer": referer,
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "same-origin", "Sec-Fetch-User": "?1",
  };
  if (cookie) h["Cookie"] = cookie;
  return h;
}
// Set-Cookie 들을 "k=v; k=v" 요청 쿠키로 병합
function jar(res: Response): string {
  const raw = (res.headers as any).getSetCookie?.() as string[] | undefined;
  const list = raw && raw.length ? raw : (res.headers.get("set-cookie") ? [res.headers.get("set-cookie")!] : []);
  return list.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
}

async function collectOne(src: Src) {
  const out: any[] = [];
  try {
    const ua = src.ua === "pc" ? UA_PC : UA;
    // 워밍업: 홈 GET → 세션쿠키 확보 (theqoo/fmkorea/clien 등 쿠키 선요구 대응)
    let cookie = "";
    if (src.warm) {
      try {
        const w = await fetch(src.warm, { headers: browserHeaders(ua, src.base + "/"), redirect: "follow", signal: AbortSignal.timeout(8000) });
        cookie = jar(w);
        await w.body?.cancel();
      } catch (_) {}
    }
    const r = await fetch(src.url, { headers: browserHeaders(ua, src.warm || (src.base + "/"), cookie), redirect: "follow", signal: AbortSignal.timeout(9000) });
    if (!r.ok) return out;
    const doc = new DOMParser().parseFromString(await r.text(), "text/html");
    if (!doc) return out;
    const seen = new Set<string>();
    doc.querySelectorAll("a").forEach((a: any) => {
      const href = a.getAttribute("href") || "";
      if (!src.re.test(href)) return;
      const title = cleanTitle(a.textContent || "");
      if (title.length < 6 || title.length > 120) return;
      const key = titleKey(title); if (!key || seen.has(key)) return; seen.add(key);
      const url = href.startsWith("http") ? href : src.base + (href.startsWith("/") ? href : "/" + href);
      out.push({ source: src.name, src_title: title, src_url: url, title_key: key, thumb: null, score: 0 });
    });
  } catch (_) {}
  return out.slice(0, 12);  // 소스당 최대 12
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 소스 병렬 수집
  const results = await Promise.all(SOURCES.map(collectOne));
  const bySource: Record<string, number> = {};
  let items: any[] = [];
  results.forEach((arr, i) => { bySource[SOURCES[i].name] = arr.length; items = items.concat(arr); });

  // 최근 7일 title_key 로 크로스(커뮤니티/일자) 중복 제거
  const { data: recent } = await sb.from("community_hot").select("title_key").gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString());
  const known = new Set((recent || []).map((r: any) => r.title_key).filter(Boolean));

  const seen = new Set<string>();
  const clean = items.filter((i) => {
    if (!i.src_url || !i.title_key) return false;
    if (seen.has(i.title_key) || known.has(i.title_key)) return false;   // 중복 제거
    seen.add(i.title_key);
    if (blocked(i.src_title)) return false;                              // 안전 필터
    return true;
  });

  let inserted = 0;
  for (const i of clean) {
    const { error } = await sb.from("community_hot").upsert(i, { onConflict: "src_url", ignoreDuplicates: true });
    if (!error) inserted++;
  }
  return new Response(JSON.stringify({ ok: true, bySource, fetched: items.length, clean: clean.length, inserted }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
