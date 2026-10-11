/* 🛡 외부 URL 안전 fetch(26.10.11 보안 감사)
   유저가 준 URL 을 서버가 대신 가져오는 함수(link-preview·article-reader·썸네일 수집 등)가
   제각각 호스트 문자열만 보거나 아예 안 봐서, 리다이렉트·DNS 로 내부망/메타데이터 주소에 닿을 수 있었다.
   여기서는 리다이렉트를 **한 홉씩 직접** 따라가며 매 홉마다
   ① http(s) 만 ② 호스트 문자열(사설·루프백·링크로컬·IPv6 리터럴·내부 도메인) ③ DNS 결과 IP 를 검사한다.
   (DNS 조회가 런타임에서 안 되면 ①②만 — 런타임 자체도 127/10/169.254 를 막는다고 실측돼 있다) */

const PRIVATE_V4 = [
  /^0\./, /^10\./, /^127\./, /^169\.254\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, /^192\.0\.0\./, /^198\.1[89]\./, /^2(2[4-9]|[3-5]\d)\./,
];

function isPrivateIp(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(v)) return PRIVATE_V4.some((r) => r.test(v));
  if (v.includes(":")) {
    if (v === "::" || v === "::1") return true;
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(v)) return true;        // ULA·링크로컬
    const m = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);              // IPv4 매핑
    if (m) return isPrivateIp(m[1]);
    if (/^::ffff:/.test(v)) return true;                            // ::ffff:7f00:1 같은 16진 표기
    return false;
  }
  return false;
}

export function isBlockedHostName(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (!h) return true;
  if (h.startsWith("[") || h.includes(":")) return true;            // IPv6 리터럴은 통째로 거부
  if (/^\d+$/.test(h) || /^0x/i.test(h)) return true;                 // 10진·16진 정수 IP 표기
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return isPrivateIp(h);
  if (/^[\d.]+$/.test(h)) return true;                                // 8진·축약 IP 표기(127.1 등)
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")
      || h.endsWith(".lan") || h.endsWith(".home") || h.endsWith(".corp")) return true;
  if (h === "metadata.google.internal" || h.endsWith(".supabase.internal")) return true;
  return false;
}

async function resolvesPrivate(host: string): Promise<boolean> {
  const rd = (Deno as unknown as { resolveDns?: (h: string, t: string) => Promise<string[]> }).resolveDns;
  if (!rd) return false;
  for (const t of ["A", "AAAA"]) {
    try {
      const ips = await rd(host, t);
      if (ips.some(isPrivateIp)) return true;
    } catch { /* 레코드 없음·조회 불가 → 다음 */ }
  }
  return false;
}

export class BlockedUrlError extends Error {}

/** 안전 fetch — 리다이렉트를 수동으로 최대 maxHops 번 따라가며 홉마다 검사. 막히면 BlockedUrlError. */
export async function safeFetch(url: string, init: RequestInit = {}, maxHops = 5): Promise<Response> {
  let cur = url;
  for (let i = 0; i <= maxHops; i++) {
    let u: URL;
    try { u = new URL(cur); } catch { throw new BlockedUrlError("bad_url"); }
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError("bad_proto");
    if (u.username || u.password) throw new BlockedUrlError("userinfo");
    if (isBlockedHostName(u.hostname)) throw new BlockedUrlError("blocked_host");
    if (await resolvesPrivate(u.hostname)) throw new BlockedUrlError("blocked_ip");
    const r = await fetch(u.href, { ...init, redirect: "manual" });
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
      cur = new URL(r.headers.get("location")!, u.href).href;
      try { await r.body?.cancel(); } catch { /**/ }
      continue;
    }
    return r;
  }
  throw new BlockedUrlError("too_many_redirects");
}
