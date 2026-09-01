// 인증 여행지를 채운다 — 사장님: "맛집처럼 관광공사 추천 여행지 같은 걸로, 미슐랭처럼"
//
// 맛집의 kind='guide'(백년가게·미쉐린·블루리본)와 같은 자리다.
// 크리에이터 발자국이 주인공이고, 그 위에 **권위 있는 인증**을 뱃지로 얹는다.
//
// 1호는 유네스코 세계유산이다.
//   ⚖️ 유네스코 공식 사이트(whc.unesco.org)는 클라우드플레어가 막는다(403 실측).
//      위키데이터에 P1435=Q9259 로 3,383건이 있고 **CC0** 라 권리도 깨끗하다.
//      한국어 표기·좌표·커먼즈 사진이 같이 온다.
//   ⚠️ 3,383건은 구성요소(부분 유산)까지 포함한 수다. 좌표 없는 항목은 건너뛴다.
//
// ⚠️ QLever 를 쓴다. 위키데이터 공식 엔드포인트(WDQS)는 이 정도 질의에서도 60초 타임아웃이
//    나는 반면 QLever 는 2초 안에 답한다(맛집·여행에서 반복 실측).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const UA = "GallaTravel/1.0 (https://galla.im; contact@galla.im)";
const QLEVER = "https://qlever.dev/api/wikidata";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* CSV 한 줄 파싱(따옴표 안의 쉼표를 지킨다) */
function csvRow(line: string) {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

async function sparqlCsv(query: string) {
  const u = new URL(QLEVER);
  u.searchParams.set("query", query);
  const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/csv" } });
  if (!r.ok) throw new Error(`qlever_${r.status}`);
  const lines = (await r.text()).split("\n").filter(Boolean);
  const head = csvRow(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = csvRow(l);
    const o: Record<string, string> = {};
    head.forEach((h, i) => (o[h] = cells[i] ?? ""));
    return o;
  });
}

/* 커먼즈 사진의 저작자·라이선스 — 표시 의무가 있는 라이선스가 대부분이다. */
async function commonsCredits(files: string[]) {
  const out = new Map<string, string>();
  if (!files.length) return out;
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  u.searchParams.set("action", "query");
  u.searchParams.set("titles", files.slice(0, 50).map((f) => "File:" + f).join("|"));
  u.searchParams.set("prop", "imageinfo");
  u.searchParams.set("iiprop", "extmetadata");
  u.searchParams.set("format", "json");
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA } });
    if (!r.ok) return out;
    const pages = (await r.json())?.query?.pages || {};
    for (const p of Object.values<any>(pages)) {
      const m = p?.imageinfo?.[0]?.extmetadata || {};
      const artist = strip(m?.Artist?.value || "").slice(0, 60);
      const lic = strip(m?.LicenseShortName?.value || "").slice(0, 30);
      const t = String(p?.title || "").replace(/^File:/, "");
      const c = [artist, lic].filter(Boolean).join(" · ");
      if (t) out.set(t, c ? `${c} / Wikimedia Commons` : "Wikimedia Commons");
    }
  } catch (_) { /* 크레딧 실패가 적재를 막지는 않는다 */ }
  return out;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("n") || "200"), 500);
  const offset = Math.max(Number(url.searchParams.get("offset") || "0"), 0);

  /* 세계유산 + 좌표 + (있으면) 한국어 표기·영문 표기·사진·국가 */
  const q = `
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
SELECT ?item ?ko ?en ?coord ?img ?cc WHERE {
  ?item wdt:P1435 wd:Q9259 .
  ?item wdt:P625 ?coord .
  OPTIONAL { ?item rdfs:label ?ko . FILTER(lang(?ko)="ko") }
  OPTIONAL { ?item rdfs:label ?en . FILTER(lang(?en)="en") }
  OPTIONAL { ?item wdt:P18 ?img }
  OPTIONAL { ?item wdt:P17 ?country . ?country wdt:P297 ?cc }
} ORDER BY ?item LIMIT ${limit} OFFSET ${offset}`;

  let rows: Record<string, string>[];
  try { rows = await sparqlCsv(q); }
  catch (e) { return j({ ok: false, reason: String(e).slice(0, 120) }, 502); }
  if (!rows.length) return j({ ok: true, picked: 0, note: "더 없음", offset });

  const files: string[] = [];
  const items = rows.map((r) => {
    const qid = (r.item || "").split("/").pop() || "";
    const m = /POINT\(([-\d.]+)\s+([-\d.]+)\)/.exec(r.coord || "");
    const file = r.img ? decodeURIComponent((r.img.split("/").pop() || "")) : "";
    if (file) files.push(file);
    /* 한국어 표기가 없으면 영문을 쓴다. 이름이 아예 없으면 버린다 — 이름 없는 핀은 뜻이 없다. */
    const name = r.ko || r.en || "";
    return {
      qid, name, name_en: r.en || null,
      country_code: (r.cc || "").toUpperCase() || null,
      lat: m ? m[2] : null, lon: m ? m[1] : null,
      photo: file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=1200` : null,
      _file: file,
    };
  }).filter((x) => x.qid && x.name && x.lat);

  const credits = await commonsCredits([...new Set(files)]);
  items.forEach((it: any) => {
    if (it._file) it.photo_credit = credits.get(it._file) || "Wikimedia Commons";
    delete it._file;
  });

  const { data, error } = await supa.rpc("travel_cert_ingest", { p_code: "unesco", p_items: items });
  if (error) return j({ ok: false, error: error.message.slice(0, 200) }, 500);
  return j({ ok: true, picked: rows.length, usable: items.length, offset,
             next: offset + limit, ...(data || {}) });
});
