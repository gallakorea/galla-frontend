// 구글 Places 사진 채우기 — 관광공사로 544곳을 채우고도 3,300곳이 비어 있었다.
//
// 💰 **돈이 나가는 API 다.** 다른 수집기와 성격이 다르다.
//    · 호출 전에 DB 장부(places_take)에서 오늘 몫을 받아온다. 받은 만큼만 부른다.
//    · 버그로 루프가 돌아도 하루 상한(기본 1,200콜) 이상은 구조적으로 못 태운다.
//    · 한 곳당 Text Search 1회만 쓴다. 사진 URL 은 photo name 으로 만들 수 있어
//      Place Details 를 따로 부르지 않는다(호출 절반 절약).
//
// ⚖️ 사진은 구글 CDN URL 을 참조한다 — 우리 서버에 복제하지 않는다.
//    출처 표기는 photos[].authorAttributions 를 credit 에 담아 화면에 띄운다.
//
// ⚠️ 동명이인: 이름이 같아도 좌표가 2km 넘게 떨어지면 다른 집이다. 반드시 거른다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const KEY = Deno.env.get("GOOGLE_PLACES_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
/* 🔴 사진은 반드시 우리 R2 로 옮겨 담는다.
   구글 Photo URL 을 그대로 저장하면 ① 이용자가 볼 때마다 구글에 과금되고
   ② 그 URL 에 API 키가 박혀 앱에서 키가 통째로 새어나간다(처음 설계의 실책).
   ⚖️ 구글 약관은 Place ID 외 콘텐츠를 최대 30일까지 캐시하도록 허용한다 —
      30일마다 갱신하는 전제로 저장한다(fetched_at 으로 관리). */
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  service: "s3", region: "auto",
});

/* 구글에서 사진 바이트를 받아 R2 에 올리고 우리 공개 URL 을 돌려준다. */
async function toR2(photoName: string, placeId: string): Promise<string | null> {
  const src = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${KEY}`;
  const g = await fetch(src, { redirect: "follow" });
  if (!g.ok) return null;
  const ct = g.headers.get("content-type") || "image/jpeg";
  if (!/^image\//.test(ct)) return null;
  const buf = new Uint8Array(await g.arrayBuffer());
  if (!buf.length || buf.length > 8 * 1024 * 1024) return null;
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : "jpg";
  const key = `food/places/${placeId}.${ext}`;
  const put = await r2.fetch(
    `https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`,
    { method: "PUT", headers: { "content-type": ct }, body: buf },
  );
  if (!put.ok) return null;
  return `${R2_PUBLIC_URL}/${key}`;
}

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const norm = (s: string) => String(s || "").replace(/[\s()\[\]·,\-]/g, "").toLowerCase();

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!KEY) return j({ ok: false, reason: "no_places_key" }, 500);

  const url = new URL(req.url);
  const want = Math.min(Number(url.searchParams.get("n") || "150"), 400);
  const cap = Number(url.searchParams.get("cap") || "1200");

  /* 💰 오늘 몫을 먼저 받는다 — 이걸 넘기면 아예 부르지 않는다 */
  const { data: allowed } = await supa.rpc("places_take", { p_want: want, p_cap: cap });
  const budget = Number(allowed || 0);
  if (budget <= 0) return j({ ok: true, reason: "daily_cap_reached", budget: 0 });

  const { data: targets } = await supa.rpc("food_places_without_photo",
    { p_limit: budget, p_offset: 0 });

  let called = 0, matched = 0, inserted = 0;
  const errs: string[] = [];
  const rows: any[] = [];

  for (const p of (targets || []) as any[]) {
    if (called >= budget) break;
    called++;
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.photos",
        },
        body: JSON.stringify({
          textQuery: `${p.name} ${p.address || ""}`.trim(),
          languageCode: "ko", regionCode: "KR", maxResultCount: 1,
        }),
      });
      if (!r.ok) { if (errs.length < 3) errs.push(`${r.status}:${(await r.text()).slice(0, 120)}`); continue; }
      const hit = ((await r.json())?.places || [])[0];
      if (!hit?.photos?.length) continue;

      /* 이름이 겹치고 좌표가 2km 안일 때만 인정 */
      const t = norm(hit.displayName?.text || ""), n = norm(p.name);
      if (!(t.includes(n) || n.includes(t))) continue;
      const dy = Number(hit.location?.latitude) - Number(p.lat);
      const dx = Number(hit.location?.longitude) - Number(p.lon);
      if (!isFinite(dx) || !isFinite(dy) || (dx * dx + dy * dy) >= 0.02 * 0.02) continue;

      matched++;
      const ph = hit.photos[0];
      const stored = await toR2(ph.name, p.id);
      if (!stored) continue;                       // R2 에 못 담으면 아예 저장하지 않는다
      const who = (ph.authorAttributions || [])[0]?.displayName || "";
      rows.push({
        place_id: p.id, user_id: null, url: stored, status: "live",
        source: "google", ext_key: "google:" + hit.id,
        credit: who ? `Google · ${who}` : "Google",
      });
    } catch (e) { if (errs.length < 3) errs.push(String(e).slice(0, 120)); }
  }

  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await supa.from("food_photos").insert(chunk);
    if (error) { if (errs.length < 5) errs.push(String(error.message).slice(0, 160)); }
    else inserted += chunk.length;
  }
  await supa.from("places_usage").update({ photos: inserted })
    .eq("day", new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10));

  return j({ ok: true, budget, called, matched, inserted, errs });
});
