// 여행 장소의 사진·설명을 구글 Places 로 채운다
//
// 왜 지금까지 안 찼나: 사진은 위키미디어 커먼즈·한국관광공사, 설명은 위키백과뿐이었다.
// 셋 다 '알려진 곳'만 있다. 크리에이터가 다녀온 식당·카페·전망대는 거기 없다.
// 실측(2026-09-04): 사진 9,860곳·설명 10,828곳이 비었고, 크론을 올려도 큐가 비어 있었다.
// 고장이 아니라 **재료가 없었다.**
//
// 💰 돈이 나가는 API 다 — ingest-places-photos(맛집)와 **같은 원장**을 쓴다.
//    여행 쪽 일 상한을 낮게(기본 4,000) 잡아 맛집 몫을 남긴다. 원장의 날 카운터는 하나라,
//    상한이 낮은 쪽이 먼저 멈추고 높은 쪽이 계속 간다.
// 💰 한 곳당 Text Search 1회. 사진·설명·좌표를 한 번에 받는다.
//
// 🔴 사진은 반드시 R2 로 옮겨 담는다. 구글 Photo URL 을 그대로 저장하면
//    ① 볼 때마다 구글에 과금되고 ② URL 에 API 키가 박혀 앱에서 새어나간다.
//    ⚖️ 구글 약관은 Place ID 외 콘텐츠를 30일까지 캐시하도록 허용한다.
//
// ⚠️ 동명이인: 좌표가 있는 곳은 거리로 거른다(spot 5km, 도시 이상 50km).
//    좌표가 없는 곳은 이름이 맞아야 받는다 — 아니면 엉뚱한 나라 동명 장소가 박힌다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KEY = Deno.env.get("GOOGLE_PLACES_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  service: "s3", region: "auto",
});

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const norm = (s: string) => String(s || "").replace(/[\s()\[\]·,\-'"]/g, "").toLowerCase();

function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371, d = Math.PI / 180;
  const dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d;
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function toR2(photoName: string, id: string): Promise<string | null> {
  const src = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=900&key=${KEY}`;
  const g = await fetch(src, { redirect: "follow" });
  if (!g.ok) return null;
  const ct = g.headers.get("content-type") || "image/jpeg";
  if (!/^image\//.test(ct)) return null;
  const buf = new Uint8Array(await g.arrayBuffer());
  if (!buf.length || buf.length > 8 * 1024 * 1024) return null;
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const key = `travel/places/${id}.${ext}`;
  const put = await r2.fetch(
    `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`,
    { method: "PUT", headers: { "content-type": ct }, body: buf },
  );
  if (!put.ok) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}

/* 🔴 필드마스크가 곧 요금 등급이다. 이 사실을 모르고 짜서 ₩281,968 이 나갔다.
   실측 2026-09-04 청구서:
     places.editorialSummary 를 넣으면 **Text Search Enterprise + Atmosphere** 로 올라간다
       → 6,096건 × 약 ₩46 = ₩281,968 (그날 정가의 58%)
     places.id 만 요청하면 **Essentials** 등급이라 사실상 공짜다.
   장소 소개문 한 줄의 값이 ₩28만이면 안 사는 게 맞다. 뺀다.
   ⚠️ 이 마스크에 필드를 더할 때는 **반드시 요금 등급을 먼저 확인**할 것.
      https://developers.google.com/maps/documentation/places/web-service/usage-and-billing */
async function search(q: string, lat: number | null, lon: number | null) {
  const mask = [
    "places.id", "places.displayName", "places.location",
    "places.formattedAddress", "places.photos",
  ].join(",");
  const body: any = { textQuery: q, languageCode: "ko", maxResultCount: 3 };
  if (lat != null && lon != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lon }, radius: 20000 } };
  }
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": mask },
    body: JSON.stringify(body),
  });
  if (r.status === 400) throw new Error(`places_400:${(await r.text()).slice(0, 120)}`);
  if (!r.ok) throw new Error(`places_${r.status}:${(await r.text()).slice(0, 120)}`);
  return (await r.json())?.places || [];
}

Deno.serve(async (req) => {
  /* 🔴 구글 유료 차단 스위치. 2026-09-04 카드 결제 ₩200,000 사고로 들어왔다.
     지금은 blackid 계정의 **무료 체험 크레딧**(₩414,984, 12/5 만료)으로 돈다 —
     체험 계정은 크레딧이 바닥나면 **스스로 멈추고 카드로 안 넘어간다.**
     ⚠️ 그 계정을 '정식 계정'으로 업그레이드하면 그 보호가 사라진다. 절대 하지 말 것.
     그리고 실제 지출은 places_spend 가 **원화로** 막는다(기본 예산 0). */
  if (Deno.env.get("GOOGLE_PAID_OK") !== "1") {
    return new Response(JSON.stringify({ ok: false, reason: "GOOGLE_PAID_BLOCKED" }),
      { status: 503, headers: { "content-type": "application/json" } });
  }
  if (!KEY) return j({ ok: false, reason: "no_places_key" }, 500);

  const url = new URL(req.url);
  const want = Math.min(Number(url.searchParams.get("n") || "60"), 200);
  const cap = Number(url.searchParams.get("cap") || "4000");
  const DRY = url.searchParams.get("dry") === "1";

  /* 💰 원화 예산. 여기 Text Search 는 places.id 외 필드를 요구하므로 Details 급으로 계량한다.
     (editorialSummary 를 빼서 Enterprise 등급은 벗어났다 — 그 필드 하나가 ₩281,968 이었다) */
  const { data: allow } = await supa.rpc("places_spend", { p_kind: "details", p_want: want });
  const budget = Number(allow || 0);
  if (budget <= 0) return j({ ok: true, picked: 0, note: "예산 소진" });

  const { data: rows } = await supa.rpc("travel_places_for_places_api", { p_limit: budget });
  const list = (rows || []) as any[];
  if (!list.length) {
    await supa.rpc("places_refund", { p_kind: "details", p_n: budget });
    return j({ ok: true, picked: 0, note: "채울 장소 없음" });
  }

  const t0 = Date.now();
  const out: any[] = [];
  const sample: any[] = [];
  let called = 0, photos = 0, sums = 0, geos = 0, missed = 0, halted = "";

  for (const p of list) {
    if (Date.now() - t0 > 105_000) { halted = "시간 상자(105초) 도달"; break; }
    if (called >= budget) { halted = "budget"; break; }
    const name = String(p.name_en || p.name_local || p.name || "").trim();
    const ko = String(p.name || "").trim();
    if (name.length < 2) { missed++; continue; }
    /* 나라·지역은 이름 하나로 묻는다 — 도시·나라를 덧붙이면 오히려 안 걸린다.
       (실측: 'Georgia, 트빌리시, 조지아' 는 트빌리시를 준다) */
    const q = p.scale === "spot" || p.scale === "city"
      ? [name, p.city, p.country].filter(Boolean).join(", ")
      : name;
    const lat = p.lat != null ? Number(p.lat) : null;
    const lon = p.lon != null ? Number(p.lon) : null;

    let hit: any = null;
    let cands: any[] = [];
    try {
      called++;
      cands = await search(q, lat, lon);
      /* 규모마다 '같은 곳'의 기준이 다르다. 나라는 중심점 정의가 서로 달라 수백 km 씩 벌어진다
         — 실측: 모로코 497km, 아르헨티나 492km 가 **맞는 답인데** 50km 기준에 걸렸다. */
      const maxKm = p.scale === "spot" ? 5
                  : p.scale === "city" ? 60
                  : p.scale === "region" ? 400
                  : 2000;
      hit = cands.find((c: any) => {
        const cl = c?.location;
        if (lat != null && lon != null && cl) {
          return km(lat, lon, Number(cl.latitude), Number(cl.longitude)) <= maxKm;
        }
        /* 좌표가 없으면 이름으로만 판단한다 — 느슨하면 딴 나라 동명 장소가 박힌다 */
        const a = norm(c?.displayName?.text || ""), b = norm(name), c2 = norm(ko);
        return !!a && (a === b || a.includes(b) || b.includes(a) || a === c2);
      }) || null;
    } catch (e) {
      halted = String(e).slice(0, 90);
      called--;                                  // 못 부른 건 안 쓴 것이다
      break;
    }
    if (!hit) {
      missed++;
      if (DRY && sample.length < 8) {
        sample.push({ q, ours: ko, scale: p.scale, hasCoord: lat != null,
                      got: cands.map((c: any) => c?.displayName?.text).slice(0, 3),
                      dist: (lat != null && cands[0]?.location)
                        ? Math.round(km(lat!, lon!, Number(cands[0].location.latitude),
                                        Number(cands[0].location.longitude))) + "km" : null });
      }
      out.push({ id: p.id });
      continue;
    }

    const row: any = { id: p.id };
    const cl = hit.location;
    if ((lat == null || lon == null) && cl) {
      row.lat = String(cl.latitude); row.lon = String(cl.longitude); geos++;
    }
    const es = String(hit?.editorialSummary?.text || "").trim();
    if (p.need_summary && es) { row.summary = es.slice(0, 400); sums++; }
    if (p.need_photo && Array.isArray(hit.photos) && hit.photos[0]?.name && !DRY) {
      const u = await toR2(hit.photos[0].name, p.id);
      if (u) {
        row.photo = u;
        row.photo_credit = (hit.photos[0].authorAttributions || [])
          .map((a: any) => a?.displayName).filter(Boolean).join(", ") || "Google";
        photos++;
      }
    }
    if (sample.length < 6) {
      sample.push({ name: ko, found: hit?.displayName?.text, summary: es.slice(0, 60) || null,
                    photo: !!row.photo });
    }
    out.push(row);
  }

  if (budget > called) await supa.rpc("places_refund", { p_kind: "details", p_n: budget - called });
  /* 받은 사진 수만큼 사진 SKU 도 계량한다 */
  if (photos > 0) await supa.rpc("places_spend", { p_kind: "photos", p_want: photos });
  let res: any = {};
  if (!DRY && out.length) {
    const { data, error } = await supa.rpc("travel_place_media_set", { p_items: out });
    /* 오류를 삼키면 '도장은 찍혔는데 아무것도 안 들어온' 상태가 된다 */
    if (error) return j({ ok: false, reason: "save_failed", detail: String(error.message).slice(0, 200) }, 500);
    res = data || {};
  }
  if (!DRY && photos) await supa.rpc("places_photos_add", { p_n: photos });

  return j({ ok: true, picked: list.length, called, photos, summaries: sums, geo: geos,
             missed, ...res, sample, halted: halted || undefined, noEditorial,
             took: Math.round((Date.now() - t0) / 1000) });
});
