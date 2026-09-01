// 여행지 설명을 채운다 — 사장님: "그 여행지에 대한 설명란이 상세에 들어가야 할 것 같다"
//
// ⚖️ 설명은 **지어내지 않는다**. LLM 에게 쓰게 하면 안 가본 곳을 그럴듯하게 묘사하고,
//    그건 여행 정보로서 거짓말이다(가격·운영시간·분위기를 태연히 만들어낸다).
//    실제 출처에서 가져오고 출처를 화면에 표시한다:
//      ① 위키백과 도입부 — 한국어 우선, 없으면 영어. CC BY-SA 라 출처 표시가 의무다.
//      ② 한국관광공사 detailCommon 개요 — 공공누리. 국내 관광지에 강하다.
//    둘 다 없으면 설명을 비운다. 비워두는 게 지어내는 것보다 낫다.
//
// ⚠️ summary_at 은 결과와 무관하게 찍는다(RPC 가 그렇게 저장한다).
//    '못 찾았다'와 '안 찾아봤다'를 안 가르면 설명 없는 곳을 매 회차 다시 물어본다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const GOV = Deno.env.get("DATA_GO_KR_KEY") || "";
const UA = "GallaTravel/1.0 (https://galla.im; contact@galla.im)";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: string) =>
  String(s || "").replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ").trim();

/* 두 문장까지만 쓴다. 상세 카드에 문단이 통째로 들어가면 아무도 안 읽는다.
   ⚠️ 한국어 위키 도입부는 괄호 안 외국어 표기가 본문보다 길다:
      "바누아투 공화국(프랑스어: République du Vanuatu 레퓌블리크 뒤 바누아투[*], 영어: …)".
      그대로 두면 두 문장 제한이 괄호로만 채워진다. 언어 표기 괄호와 [*] 주석을 먼저 걷는다. */
function twoSentences(t: string, cap = 220) {
  let s = clean(t);
  if (!s) return "";
  s = s.replace(/\[[^\]]{0,20}\]/g, "");                 // [*], [1] 같은 주석
  /* 괄호 안이 중첩돼 있으면 한 번의 치환으로는 안 걷힌다(티베트고원 실측:
     "(티베트어: …, 중국어: …, 병음: … 칭짱 가오위안, 영어: …)").
     안쪽부터 세 번 훑고, 콜론이 든 괄호는 모두 표기 나열로 본다. */
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\([^()]*:[^()]*\)/g, "");             // (…어: …), (병음: …)
    s = s.replace(/\([^()]{40,}\)/g, "");                // 지나치게 긴 괄호 = 표기 나열
  }
  s = s.replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").trim();
  const cut = s.split(/(?<=[.。!?])\s+/).slice(0, 2).join(" ");
  return (cut.length > cap ? cut.slice(0, cap - 1) + "…" : cut);
}

/* 위키데이터 항목의 위키백과 연결(ko 우선, 없으면 en) */
async function wikiTitles(qid: string) {
  const r = await fetch(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
                        { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const links = (await r.json())?.entities?.[qid]?.sitelinks || {};
  if (links.kowiki?.title) return { lang: "ko", title: links.kowiki.title as string };
  if (links.enwiki?.title) return { lang: "en", title: links.enwiki.title as string };
  return null;
}

async function wikiSummary(lang: string, title: string) {
  const u = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetch(u, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  const d = await r.json();
  const ex = twoSentences(d?.extract || "");
  if (!ex) return null;
  return { summary: ex, url: d?.content_urls?.desktop?.page ||
           `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}` };
}

/* 국내 — 관광공사 개요. 키워드로 콘텐츠ID 를 찾고 detailCommon 으로 개요를 받는다. */
async function tourSummary(name: string) {
  if (!GOV) return null;
  const s = `https://apis.data.go.kr/B551011/KorService2/searchKeyword2?serviceKey=${GOV}` +
            `&numOfRows=3&pageNo=1&MobileOS=ETC&MobileApp=GALLA&_type=json` +
            `&keyword=${encodeURIComponent(name)}`;
  const r = await fetch(s);
  if (!r.ok) return null;
  const items = (await r.json())?.response?.body?.items?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];
  const norm = (x: string) => String(x || "").replace(/[\s()·]/g, "");
  const hit = list.find((it: any) => {
    const t = norm(it?.title);
    return t === norm(name) || t.startsWith(norm(name));
  });
  if (!hit?.contentid) return null;
  const d = `https://apis.data.go.kr/B551011/KorService2/detailCommon2?serviceKey=${GOV}` +
            `&MobileOS=ETC&MobileApp=GALLA&_type=json&contentId=${hit.contentid}&overviewYN=Y`;
  const r2 = await fetch(d);
  if (!r2.ok) return null;
  const it2 = (await r2.json())?.response?.body?.items?.item;
  const one = Array.isArray(it2) ? it2[0] : it2;
  const ex = twoSentences(one?.overview || "");
  if (!ex) return null;
  return { summary: ex, url: one?.homepage ? clean(one.homepage).slice(0, 200) : null };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "20"), 40);

  const { data: todo } = await supa.rpc("travel_places_needing_summary", { p_limit: n });
  const list = (todo || []) as any[];
  if (!list.length) return j({ ok: true, picked: 0, note: "설명 채울 곳 없음" });

  const items: any[] = [];
  let got = 0;
  for (const p of list) {
    const row: any = { id: p.id };
    try {
      if (p.wikidata_qid) {
        const t = await wikiTitles(p.wikidata_qid);
        if (t) {
          const w = await wikiSummary(t.lang, t.title);
          if (w) { row.summary = w.summary; row.src = "wikipedia"; row.url = w.url; }
        }
      }
      if (!row.summary && p.country_code === "KR") {
        const t = await tourSummary(p.name);
        if (t) { row.summary = t.summary; row.src = "tour"; row.url = t.url; }
      }
    } catch (_) { /* 한 건 실패가 회차를 죽이지 않는다 */ }
    if (row.summary) got++;
    items.push(row);          // 못 찾아도 저장한다 — summary_at 이 찍혀야 다시 안 물어본다
    await sleep(120);
  }

  const { data: saved } = await supa.rpc("travel_summary_save", { p_items: items });
  return j({ ok: true, picked: list.length, saved: saved || 0, withSummary: got });
});
