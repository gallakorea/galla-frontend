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

  /* 🔴 '사진 없는 곳'을 그냥 앞에서부터 가져오면 **실패한 곳이 매번 다시 온다** —
     구글에 사진이 없던 집은 계속 사진이 없으니 영원히 큐 맨 앞이다.
     실측: 매칭 12 → 7 → 4 → 2 → 0. 같은 20곳을 여섯 번 다시 물어봤다(유료 API에서).
     → places_tried 에 물어본 사실을 남기고, 안 물어본 곳만 대상으로 받는다. */
  const { data: targets } = await supa.rpc("food_places_for_places_api", { p_limit: budget });

  let called = 0, matched = 0, inserted = 0, quotaDead = false;
  const errs: string[] = [];
  const rows: any[] = [];
  const tried: any[] = [];
  const info: any[] = [];

  for (const p of (targets || []) as any[]) {
    if (called >= budget) break;
    called++;
    try {
      /* 🔎 1단계 — **무료** 검색. 필드마스크를 places.id 하나로 좁히면
         'Text Search Essentials (IDs Only)' SKU 가 되고, 이건 무료 한도가 **무제한**이다.
         예전엔 여기서 전화·영업시간·평점까지 같이 받았는데(한 번에 끝나서 좋아 보였다),
         그 필드들이 Enterprise+Atmosphere 등급을 불러서 곳당 $0.040 이 됐다.
         지금은 아이디만 받고, 실제 정보는 2단계 Place Details Pro($0.017)에서 받는다.
         곳당 $0.047 → $0.024 로 **절반**이다. 크레딧 안에 들어가느냐를 가르는 차이였다.
         ⚠️ 대신 전화·영업시간·평점은 포기한다 — 그게 값의 두 배를 만들던 범인이다. */
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "places.id",
        },
        body: JSON.stringify({
          textQuery: `${p.name} ${p.address || ""}`.trim(),
          languageCode: "ko", regionCode: "KR", maxResultCount: 1,
        }),
      });
      if (!r.ok) {
        if (errs.length < 3) errs.push(`${r.status}:${(await r.text()).slice(0, 120)}`);
        /* 🔴 429 는 '이 집이 안 된다'가 아니라 '오늘 구글이 문을 닫았다'는 뜻이다.
           예전엔 continue 라서 남은 대상 전부에 429 를 한 번씩 더 맞았다 —
           예산은 선차감이라 그 몫이 그대로 증발했다(8/31: 980콜). 즉시 멈춘다. */
        if (r.status === 429 || r.status === 403) { quotaDead = true; break; }
        continue;
      }
      const cand = ((await r.json())?.places || [])[0];
      if (!cand?.id) { tried.push({ place_id: p.id, found: false }); continue; }

      /* 🔎 2단계 — Place Details **Pro**($17/1,000, 월 5,000 무료). 여기서 이름·좌표·사진을 받는다.
         1단계가 아이디만 주므로 **여기서 처음** 맞는 집인지 확인할 수 있다. 그래서 아닌 집에도
         한 번은 쓰게 되는데, 그래도 예전 한 방($0.047)보다 싸다. */
      const dres = await fetch(`https://places.googleapis.com/v1/places/${cand.id}?languageCode=ko`, {
        headers: {
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos",
        },
      });
      if (!dres.ok) {
        if (errs.length < 3) errs.push(`d${dres.status}:${(await dres.text()).slice(0, 100)}`);
        if (dres.status === 429 || dres.status === 403) { quotaDead = true; break; }
        continue;
      }
      const hit = await dres.json();
      tried.push({ place_id: p.id, found: !!hit?.photos?.length });
      if (!hit) continue;

      /* 이름이 겹치고 좌표가 2km 안일 때만 인정 — 정보든 사진이든 이 관문을 지나야 한다 */
      const t = norm(hit.displayName?.text || ""), n = norm(p.name);
      if (!(t.includes(n) || n.includes(t))) continue;
      const dy = Number(hit.location?.latitude) - Number(p.lat);
      const dx = Number(hit.location?.longitude) - Number(p.lon);
      if (!isFinite(dx) || !isFinite(dy) || (dx * dx + dy * dy) >= 0.02 * 0.02) continue;
      /* ⚠️ 전화·영업시간·평점은 이제 안 받는다(Enterprise 필드라 단가를 두 배로 만들었다).
         빈 값을 밀어넣으면 이미 있던 정보가 지워지므로 info 수집 자체를 걷어냈다. */
      if (!hit.photos?.length) continue;

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

  /* 물어본 사실을 먼저 남긴다 — 사진 저장이 실패해도 재조회는 막아야 한다 */
  for (let i = 0; i < tried.length; i += 200) {
    await supa.from("places_tried").upsert(tried.slice(i, i + 200), { onConflict: "place_id" });
  }
  /* ⚠️ 이제 대상이 '사진 없는 곳'이 아니라 '안 물어본 곳'이라, 이미 사진이 있는 집도
     정보를 받으려고 다시 온다. 그때 사진 insert 는 유니크 충돌이 나므로 미리 걸러낸다. */
  const keys = rows.map((r) => r.ext_key);
  const have = new Set<string>();
  for (let i = 0; i < keys.length; i += 200) {
    const { data } = await supa.from("food_photos").select("ext_key")
      .in("ext_key", keys.slice(i, i + 200));
    for (const r of (data || []) as any[]) have.add(r.ext_key);
  }
  const fresh = rows.filter((r) => !have.has(r.ext_key));
  for (let i = 0; i < fresh.length; i += 200) {
    const chunk = fresh.slice(i, i + 200);
    const { error } = await supa.from("food_photos").insert(chunk);
    if (error) { if (errs.length < 5) errs.push(String(error.message).slice(0, 160)); }
    else inserted += chunk.length;
  }
  /* 받아놓고 못 쓴 몫을 돌려준다 — 429 로 일찍 멈췄을 때가 대부분이다 */
  if (budget > called) await supa.rpc("places_refund", { p_n: budget - called });
  /* ⚠️ 장부의 하루는 구글 할당량과 같은 태평양시다(KST 아님). 여기서 KST 를 쓰면
        하루가 어긋나 엉뚱한 행의 photos 를 덮어쓴다. */
  const laDay = new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
  /* ⚠️ 예전엔 update({photos: inserted}) 였다 — 회차마다 **덮어써서** 마지막 회차 값만 남았다.
     calls 는 누적인데 photos 만 아니어서, 650장 받은 날이 장부엔 21장으로 찍혔다.
     한도를 올릴지 판단할 때 보는 숫자가 30분의 1이었다. 누적으로 더한다. */
  await supa.rpc("places_photos_add", { p_day: laDay, p_n: inserted });

  let infoN = 0;
  for (let i = 0; i < info.length; i += 200) {
    const { data } = await supa.rpc("food_place_info_set", { p_items: info.slice(i, i + 200) });
    infoN += (data?.n ?? 0);
  }
  return j({ ok: true, budget, called, matched, inserted, info: infoN, tried: tried.length, quotaDead, errs });
});
