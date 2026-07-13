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
// ua:"pc" 는 모바일 UA를 차단/다른레이아웃 주는 사이트용. 전 소스 모바일에서 링크 정상 열림 확인분만.
type Src = { name: string; url: string; re: RegExp; base: string; ua?: "pc"; warm?: string };
const SOURCES: Src[] = [
  { name: "dcinside",   url: "https://m.dcinside.com/board/dcbest",                        re: /\/board\/[\w]+\/\d+/,                             base: "https://m.dcinside.com" },
  { name: "ruliweb",    url: "https://bbs.ruliweb.com/best",                               re: /\/(best|community|news)\/board\/\d+\/read\/\d+/,  base: "https://bbs.ruliweb.com" },
  { name: "arca.live",  url: "https://arca.live/b/live",                                   re: /\/b\/[\w]+\/\d{5,}/,                              base: "https://arca.live" },
  { name: "inven",      url: "https://m.inven.co.kr/board/webzine/2097",                   re: /\/board\/webzine\/\d+\/\d+/,                      base: "https://m.inven.co.kr" },
  { name: "mlbpark",    url: "https://mlbpark.donga.com/mp/best.php",                      re: /\/mp\/b\.php\?[^"'#]*b=/,                         base: "https://mlbpark.donga.com" },
  { name: "pann",       url: "https://m.pann.nate.com/talk/ranking",                       re: /\/talk\/\d{5,}/,                                  base: "https://m.pann.nate.com" },
  { name: "instiz",     url: "https://www.instiz.net/pt",                                  re: /\/pt\/\d{5,}/,                                    base: "https://www.instiz.net" },
  { name: "82cook",     url: "https://www.82cook.com/entiz/enti.php?bn=15",                re: /\/entiz\/read\.php\?num=\d+/,                     base: "https://www.82cook.com", ua: "pc" },
  // 제외: fmkorea(보안차단430)·theqoo(피드잠금)·clien(빈스텁)·dogdrip(RSS잠금)·etoland(JS SPA)·humoruniv(글페이지차단)·slrclub(데이터센터차단) = 서버수집 불가
  //       ppomppu·bobaedream·todayhumor·gasengi·hygall·orbi = 모바일링크/구조 문제
  //       damoang = 기술상 정상이나 자유게시판 정치색 과다로 제외(사용자 결정)
  //       ppomppu(모바일 클릭시 빈페이지)·bobaedream(best링크 순환만료)·todayhumor(모바일 링크 문제) = 모바일 링크 신뢰성 미달
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

// 인코딩 자동감지 fetch (한국 커뮤 상당수가 euc-kr/cp949 → UTF-8로 읽으면 모지바케)
async function fetchDecoded(url: string, ua: string, referer: string, cookie?: string): Promise<string | null> {
  const r = await fetch(url, { headers: browserHeaders(ua, referer, cookie), redirect: "follow", signal: AbortSignal.timeout(9000) });
  if (!r.ok) return null;
  const buf = new Uint8Array(await r.arrayBuffer());
  let cs = (r.headers.get("content-type") || "").match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase() || "";
  if (!cs) cs = new TextDecoder("latin1").decode(buf.slice(0, 3072)).match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase() || "";
  if (["euc-kr", "ks_c_5601-1987", "ksc5601", "cp949", "x-windows-949"].includes(cs)) cs = "euc-kr";
  try { return new TextDecoder(cs || "utf-8").decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

function decodeEntities(s: string) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&#x27;/gi, "'").replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// 글 페이지에서 진짜 제목 = og:title 우선(없으면 <title>), 사이트명 꼬리 제거
function pageTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']*)["'][^>]*property=["']og:title["']/i);
  let t = decodeEntities(og?.[1] || html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
  // 마지막 구분자(- | :) 뒤 조각이 사이트/보드명 토큰을 포함하면 꼬리로 보고 제거
  //  예) "제목 - 실시간 베스트 갤러리", "제목 - 베스트 라이브", "제목 | 네이트 판", "제목 : MLBPARK", "제목 - OO 채널"
  const SUFFIX = /\s*[-|:｜–]\s*[^-|:｜–]*(갤러리|채널|라이브|웹진|인벤|MLBPARK|네이트|인스티즈|보배드림|82cook|오늘의유머|웃긴대학|명조|디시인사이드|루리웹|아카라이브|에펨코리아|SLR클럽|다모앙|damoang|자유게시판|게시판)[^-|:｜–]*$/i;
  // 다모앙 "제목 - 자유게시판 | 다모앙…"처럼 꼬리가 2단이면 2회까지 제거
  for (let i = 0; i < 2 && SUFFIX.test(t); i++) t = t.replace(SUFFIX, "").trim();
  return cleanTitle(t);
}

// 글 대표 이미지 = og:image(없으면 twitter:image). 로고/플레이스홀더는 제외, 절대 https URL 반환.
function pageImage(html: string, pageUrl: string): string | null {
  const m = html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]*content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i)
    || html.match(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  let u = decodeEntities((m?.[1] || "").trim());
  if (!u) return null;
  try { u = new URL(u, pageUrl).href; } catch { return null; }
  u = u.replace(/^http:\/\//i, "https://");
  // 로고·기본이미지·아이콘·빈이미지 필터(대표성 없음)
  if (/(temp|logo|ico[_-]|icon|no[_-]?image|noimg|default|blank|avatar|profile|sprite|_bi[._]|[/_-]og[-_.]|share_?default)/i.test(u)) return null;
  if (!/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(u) && !/(dcinside|instiz|inven|pann|nate|donga|82cook|arca|ruliweb)/i.test(u)) return null;
  return u;
}

async function collectOne(src: Src) {
  const out: any[] = [];
  try {
    const ua = src.ua === "pc" ? UA_PC : UA;
    // 워밍업: 홈 GET → 세션쿠키 확보
    let cookie = "";
    if (src.warm) {
      try {
        const w = await fetch(src.warm, { headers: browserHeaders(ua, src.base + "/"), redirect: "follow", signal: AbortSignal.timeout(8000) });
        cookie = jar(w); await w.body?.cancel();
      } catch (_) {}
    }
    // 1) 목록에서 후보 URL만 추출(앵커 텍스트는 신뢰 안 함 — 순위번호/날짜/접두어/깨진인코딩 섞임)
    const listHtml = await fetchDecoded(src.url, ua, src.warm || (src.base + "/"), cookie);
    if (!listHtml) return out;
    const doc = new DOMParser().parseFromString(listHtml, "text/html");
    if (!doc) return out;
    const urls: string[] = []; const seenU = new Set<string>();
    const baseNoSlash = src.base.replace(/\/+$/, "");
    doc.querySelectorAll("a").forEach((a: any) => {
      const href = a.getAttribute("href") || "";
      if (!src.re.test(href)) return;
      let url = href.startsWith("http") ? href : baseNoSlash + (href.startsWith("/") ? href : "/" + href);
      url = url.replace(/(https?:\/\/)|\/{2,}/g, (m, p) => p ? p : "/"); // protocol 제외 // → /
      if (seenU.has(url)) return; seenU.add(url);
      urls.push(url);
    });
    // 2) 상위 6개 글 페이지를 순차로 열어 og:title(정확한 제목) 확보 + 생존검증
    //    (순차 = 사이트 스로틀/봇차단 회피). 삭제글은 og:title이 사이트명뿐이라 꼬리제거 후 빈값 → 버림.
    for (const url of urls.slice(0, 6)) {
      try {
        const html = await fetchDecoded(url, ua, src.url, cookie);
        if (!html) continue;
        const t = pageTitle(html);
        if (!t || t.length < 6 || t.length > 120) continue;  // 제목 못 얻음/삭제 → 버림
        const key = titleKey(t); if (!key) continue;
        out.push({ source: src.name, src_title: t, src_url: url, title_key: key, thumb: pageImage(html, url), score: 0 });
      } catch (_) {}
    }
  } catch (_) {}
  return out;
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
