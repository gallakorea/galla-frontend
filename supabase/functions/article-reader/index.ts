// GALLA 기사 리더 — 뉴스 원문을 서버에서 가져와 본문만 추출해 우리 포맷으로 반환.
// 프론트는 iframe(X-Frame 차단)이 안 되므로 이 함수로 본문을 받아 직접 렌더한다.
import { DOMParser, type Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "public, max-age=1800" },
  });

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const abs = (u: string | null | undefined, base: string): string | null => {
  if (!u) return null;
  try { return new URL(u, base).href; } catch { return null; }
};

// 본문 컨테이너 후보 (한국 언론사에서 흔한 셀렉터)
const CONTAINERS = [
  "article",
  "[itemprop='articleBody']",
  "#newsct_article", "#dic_area", "#articeBody", "#articleBody", "#article-body",
  "#article_body", "#articleBodyContents", "#news_body_area", "#newsEndContents",
  ".article-body", ".article_body", ".news_body", ".article-view-content-div",
  ".art_text", ".news-article", "#content", ".article_txt",
];

function textLen(el: Element): number {
  let n = 0;
  el.querySelectorAll("p").forEach((p) => { n += (p.textContent || "").trim().length; });
  if (n === 0) n = (el.textContent || "").trim().length;
  return n;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let url = new URL(req.url).searchParams.get("url") || "";
  if (!url && req.method === "POST") {
    try { url = (await req.json())?.url || ""; } catch { /* ignore */ }
  }
  if (!/^https?:\/\//i.test(url)) return json({ ok: false, error: "invalid url" }, 400);

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return json({ ok: false, error: `fetch ${resp.status}` }, 200);

    const finalUrl = resp.url || url;
    const raw = await resp.text();
    const doc = new DOMParser().parseFromString(raw, "text/html");
    if (!doc) return json({ ok: false, error: "parse fail" }, 200);

    const meta = (p: string) =>
      doc.querySelector(`meta[property="${p}"]`)?.getAttribute("content") ||
      doc.querySelector(`meta[name="${p}"]`)?.getAttribute("content") || null;

    const image = abs(meta("og:image"), finalUrl);
    const siteName = meta("og:site_name");
    const published = meta("article:published_time") || meta("date") || null;
    const title = (meta("og:title") || doc.querySelector("title")?.textContent || "").trim();

    // 방해 요소 제거
    doc.querySelectorAll("script,style,noscript,header,footer,nav,aside,form,figure figcaption")
      .forEach((n) => n.remove());

    // 최적 본문 컨테이너 선택 (p 텍스트 총량 최대)
    let best: Element | null = null, bestLen = 0;
    for (const sel of CONTAINERS) {
      let els: Element[] = [];
      try { els = [...doc.querySelectorAll(sel)] as Element[]; } catch { continue; }
      for (const el of els) {
        const l = textLen(el);
        if (l > bestLen) { bestLen = l; best = el; }
      }
    }

    // 문단 추출
    const paragraphs: string[] = [];
    const pushText = (t: string) => {
      const s = t.replace(/\s+/g, " ").trim();
      if (s.length >= 2) paragraphs.push(s);
    };
    if (best) {
      const ps = best.querySelectorAll("p");
      if (ps.length) ps.forEach((p) => pushText(p.textContent || ""));
      else (best.textContent || "").split(/\n{1,}/).forEach(pushText);
    } else {
      // 폴백: 문서 전체에서 긴 <p>만
      doc.querySelectorAll("p").forEach((p) => {
        const s = (p.textContent || "").trim();
        if (s.length >= 40) pushText(s);
      });
    }

    // 본문 이미지(최대 4장)
    const images: string[] = [];
    (best || doc).querySelectorAll("img").forEach((im) => {
      const src = abs(im.getAttribute("src") || im.getAttribute("data-src"), finalUrl);
      if (src && images.length < 4 && !images.includes(src)) images.push(src);
    });

    const totalLen = paragraphs.join("").length;
    if (totalLen < 200) {
      return json({ ok: false, error: "too short", title, image, siteName, finalUrl }, 200);
    }

    return json({
      ok: true, title, siteName, published, finalUrl,
      image, images, paragraphs,
    });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 200);
  }
});
