// 나라·지역의 '가장 아름다운 사진'을 채운다.
//
// 사장님: "국가 사진은 그 나라의 가장 아름다운 사진이어야지 유튜브 썸네일이 아니다. 도시도 그렇고."
//
// 🖼 출처는 **위키보이저 여행 배너(위키데이터 P948)** 다.
//   위키데이터의 기본 대표사진(P18)은 나라 항목에선 위성사진·지도인 경우가 많다
//   (일본=위성사진, 미국=Location Map). 반면 P948 은 위키보이저가 여행 페이지 머리에 쓰려고
//   고른 컷이라 애초에 풍경이다 — 일본=등불, 베트남=하롱베이, 도쿄=스카이라인, 한국=한국 배너.
//   P948 이 없으면 P18 로 떨어지되 **지도·국기·위성 파일은 걸러낸다**(그림이 아니라 도해다).
//
// ⚖️ 커먼즈 사진은 대부분 표시 의무가 있는 라이선스다. 저작자·라이선스를 credit 에 담아
//    화면에 띄운다. 이미지는 우리 서버에 복제하지 않고 커먼즈 URL 을 참조한다.
//
// ⚠️ 결과와 무관하게 tried_at 을 찍는다(행을 만든다). '못 찾았다'와 '안 찾아봤다'를 구분하지
//    않으면 사진 없는 나라를 매 회차 다시 물어본다 — 맛집에서 네 번 밟은 함정과 같다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const UA = "GallaTravel/1.0 (https://galla.im; contact@galla.im)";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* 도해는 사진이 아니다 — 지도·국기·문장·위성사진은 카드에 쓰면 여행지가 아니라 백과사전이 된다. */
const NOT_PHOTO = /\.svg$|location.?map|locator|flag|coat.of.arms|orthographic|satellite|globe/i;

async function wd(path: string, params: Record<string, string>) {
  const u = new URL("https://www.wikidata.org/w/api.php");
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set("format", "json");
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`wd_${r.status}`);
  return await r.json();
}

async function entity(qid: string) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
                        { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  return (await r.json())?.entities?.[qid] || null;
}
const claim = (e: any, p: string) =>
  e?.claims?.[p]?.[0]?.mainsnak?.datavalue?.value ?? null;

/* 나라 → QID. ISO 3166-1 alpha-2(P297)로 직접 찾는다. 이름으로 찾으면 동명 지역이 걸린다. */
async function countryQid(cc: string) {
  const d = await wd("", { action: "query", list: "search", srsearch: `haswbstatement:P297=${cc}`, srlimit: "1" });
  return d?.query?.search?.[0]?.title || null;
}

/* 광역 → QID. 이름으로 찾되 **P17(국가)가 맞는지** 반드시 대조한다
   ('중구'·'서구' 같은 이름은 전 세계에 널려 있다). */
async function areaQid(name: string, cc: string) {
  const d = await wd("", { action: "wbsearchentities", search: name, language: "ko", uselang: "ko", limit: "5" });
  for (const h of (d?.search || []).slice(0, 5)) {
    const e = await entity(h.id);
    if (!e) continue;
    const cQid = claim(e, "P17")?.id;
    if (!cQid) continue;
    const ce = await entity(cQid);
    if (claim(ce, "P297") === cc) return h.id;
    await sleep(120);
  }
  return null;
}

/* 커먼즈 파일 → URL + 저작자·라이선스 */
async function commons(file: string) {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.searchParams.set("action", "query");
  u.searchParams.set("titles", "File:" + file);
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "extmetadata");
  u.searchParams.set("format", "json");
  let credit = "Wikimedia Commons";
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (r.ok) {
      const pages = (await r.json())?.query?.pages || {};
      for (const p of Object.values<any>(pages)) {
        const m = p?.imageinfo?.[0]?.extmetadata || {};
        const artist = strip(m?.Artist?.value || "").slice(0, 60);
        const lic = strip(m?.LicenseShortName?.value || "").slice(0, 30);
        const c = [artist, lic].filter(Boolean).join(" · ");
        if (c) credit = `${c} / Wikimedia Commons`;
      }
    }
  } catch (_) { /* 크레딧 실패가 사진을 막지는 않는다 */ }
  return {
    url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1200`,
    credit,
  };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "12"), 30);

  const { data: todo } = await supa.rpc("travel_areas_needing_photo", { p_limit: n });
  const list = (todo || []) as any[];
  if (!list.length) return j({ ok: true, picked: 0, note: "채울 지역 없음" });

  const items: any[] = [];
  const log: string[] = [];
  for (const t of list) {
    const row: any = { scope: t.scope, code: t.code, name: t.name };
    try {
      const qid = t.scope === "country"
        ? await countryQid(t.country_code)
        : await areaQid(t.name, t.country_code);
      if (qid) {
        row.qid = qid;
        const e = await entity(qid);
        const banner = claim(e, "P948");
        const p18 = claim(e, "P18");
        const file = (typeof banner === "string" && banner) ||
                     (typeof p18 === "string" && !NOT_PHOTO.test(p18) ? p18 : null);
        if (file) {
          const c = await commons(file);
          row.photo = c.url; row.credit = c.credit;
          row.is_banner = !!banner;
        }
      }
      log.push(`${t.name}: ${row.photo ? (row.is_banner ? "배너" : "사진") : "없음"}`);
    } catch (e) {
      log.push(`${t.name}: 실패 ${String(e).slice(0, 40)}`);
    }
    items.push(row);           // 실패해도 행을 남긴다 — 다음 회차에 또 물어보지 않게
    await sleep(150);
  }

  const { data: saved } = await supa.rpc("travel_area_photo_save", { p_items: items });
  return j({ ok: true, picked: list.length, saved: saved || 0,
             withPhoto: items.filter((i) => i.photo).length, log: log.slice(0, 20) });
});
