// Cloudflare Pages Function: /imgproxy?u=<encoded image url>
// 커뮤니티 인기글 썸네일 핫링크 우회 프록시.
// 다수 한국 커뮤 이미지 서버는 Referer가 자기 도메인이 아니면 403을 준다.
// 엣지에서 '소스 도메인 Referer'로 대신 받아 galla.im 동일출처 이미지로 전달한다.
// 화이트리스트(SSRF 방지) + 이미지 타입/용량 제한 + 장기 캐시.

const ALLOW = /(^|\.)(dcinside\.com|inven\.co\.kr|ruliweb\.com|instiz\.net|pann\.com|nate\.com|namu\.la|donga\.com|82cook\.com)$/i;
/* 🗺 여행 사진(위키미디어 공용) — 원본 서버가 멀어 장당 1~2초 걸렸다(26.9.18 대만 카드).
   엣지에서 받아 캐시하고 &w= 로 줄여 보낸다. 공개 이미지 서버라 Referer 검사 없이 허용한다. */
const WIKI = /(^|\.)wikimedia\.org$/i;

function refererFor(host) {
  if (/inven/.test(host)) return "https://www.inven.co.kr/";
  if (/ruliweb/.test(host)) return "https://bbs.ruliweb.com/";
  if (/instiz/.test(host)) return "https://www.instiz.net/";
  if (/pann|nate/.test(host)) return "https://m.pann.nate.com/";
  if (/dcinside/.test(host)) return "https://m.dcinside.com/";
  if (/namu\.la/.test(host)) return "https://arca.live/";
  if (/donga/.test(host)) return "https://mlbpark.donga.com/";
  if (/82cook/.test(host)) return "https://www.82cook.com/";
  return "https://" + host + "/";
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const raw = url.searchParams.get("u");
  if (!raw) return new Response("no url", { status: 400 });

  let target;
  try { target = new URL(raw); } catch { return new Response("bad url", { status: 400 }); }
  if (target.protocol !== "https:" && target.protocol !== "http:") return new Response("bad proto", { status: 400 });
  // IP 리터럴 금지 (SSRF 방지)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(target.hostname) || target.hostname.includes(":")) {
    return new Response("host not allowed", { status: 403 });
  }
  const isWiki = WIKI.test(target.hostname);
  if (!ALLOW.test(target.hostname) && !isWiki) {
    // 커뮤 화이트리스트 외(언론사 등 갈라뉴스 hero) — 오픈 프록시 방지를 위해
    // galla.im(또는 로컬 프리뷰)에서 온 이미지 요청만 통과, https만 허용
    const ref = context.request.headers.get("Referer") || "";
    const sfs = context.request.headers.get("Sec-Fetch-Site") || "";
    const okOrigin = sfs === "same-origin" ||
      /^https:\/\/([a-z0-9-]+\.)?galla\.im\//i.test(ref) || /localhost|127\.0\.0\.1/.test(ref);
    if (!okOrigin) return new Response("host not allowed", { status: 403 });
    if (target.protocol !== "https:") return new Response("bad proto", { status: 400 });
  }

  /* 크기 줄이기(위키미디어만) — Cloudflare 이미지 변환. 지원 안 되면 원본 그대로 온다(무해). */
  let resize = null;
  const w = parseInt(url.searchParams.get("w") || "", 10);
  if (isWiki && w >= 120 && w <= 1600) {
    const acc = context.request.headers.get("Accept") || "";
    resize = { width: w, quality: 78, fit: "scale-down" };
    if (/image\/avif/.test(acc)) resize.format = "avif";
    else if (/image\/webp/.test(acc)) resize.format = "webp";
  }

  let resp;
  try {
    resp = await fetch(target.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Referer": refererFor(target.hostname),
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(isWiki ? 10000 : 5000), // 일부 사이트(ruliweb 등)가 CF 엣지 IP를 느리게 드롭 → 빨리 실패시켜 onerror(스켈레톤 제거) 유도
      cf: Object.assign({ cacheTtl: 604800, cacheEverything: true }, resize ? { image: resize } : {}),
    });
  } catch { return new Response("fetch fail", { status: 502 }); }

  if (!resp.ok) return new Response("upstream " + resp.status, { status: 502 });
  const ct = resp.headers.get("content-type") || "";
  if (!ct.startsWith("image/")) return new Response("not image", { status: 415 });

  const buf = await resp.arrayBuffer();
  if (buf.byteLength > 6_000_000) return new Response("too big", { status: 413 });

  return new Response(buf, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=604800, immutable",
      "Access-Control-Allow-Origin": "*",
      "X-Content-Type-Options": "nosniff",
      ...(resize ? { "Vary": "Accept" } : {}),
    },
  });
}
