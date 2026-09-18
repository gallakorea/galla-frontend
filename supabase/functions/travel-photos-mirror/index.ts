// 여행 사진을 우리 저장소(R2)로 옮긴다 — 위키미디어·한국관광공사 주소 → cdn.galla.im
//
// 왜: 외부 주소를 그대로 쓰면 ① 첫 조회가 원본 서버를 거쳐 1초 남짓 ② 원본이 지워지면 우리도 깨진다
//     (26.9.18 사장님: 대만 카드 느림 → 「우리 저장소로 전부 옮겨」).
// 어떻게: 한 번에 n곳(기본 40)의 서로 다른 외부 주소를 받아 R2 에 올리고, 그 주소를 쓰는
//     travel_places·travel_area_photos 행을 전부 우리 주소로 바꾼다. 대응표 travel_photo_mirror(src→dst).
//     크론이 주기적으로 돌아 새로 모인 외부 사진도 따라 옮긴다.
// ⚖️ 위키미디어는 저작자·라이선스 표시가 의무 — photo_credit/credit 은 그대로 둔다(옮겨도 표시 유지).
// ⚠️ 받기 실패(404 등)는 tries 를 올려 3번 넘으면 건너뛴다 — 같은 곳에서 큐가 막히지 않게.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const CF_ACCOUNT_ID = Deno.env.get("CF_ACCOUNT_ID") || "";
const R2_BUCKET = Deno.env.get("R2_BUCKET") || "";
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL") || "";
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID") || "",
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY") || "",
  service: "s3", region: "auto",
});
const UA = "GallaBot/1.0 (https://galla.im; admin@galla.im)";
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function sha1(s: string) {
  const b = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/* 원본을 받는다. 위키미디어 429(속도 제한)·12MB 넘는 원본은 갈라 엣지 프록시로 1600px 로 줄여 받는다
   (26.9.18 실측: 막바지 309장이 429·13~15MB 원본으로 실패). */
async function fetchImg(u: string, viaProxy: boolean) {
  const url = viaProxy ? "https://galla.im/imgproxy?u=" + encodeURIComponent(u) + "&w=1600" : u;
  const g = await fetch(url, {
    headers: viaProxy ? { "Referer": "https://galla.im/", "Accept": "image/webp,image/jpeg,image/*" } : { "User-Agent": UA },
    redirect: "follow", signal: AbortSignal.timeout(25000),
  });
  if (!g.ok) throw new Error("get " + g.status);
  const ct = g.headers.get("content-type") || "";
  if (!/^image\//.test(ct)) throw new Error("not image " + ct);
  const buf = new Uint8Array(await g.arrayBuffer());
  if (!buf.length || buf.length > 12 * 1024 * 1024) throw new Error("size " + buf.length);
  return { ct, buf };
}

async function mirror(src: string): Promise<string | null> {
  let got: Awaited<ReturnType<typeof fetchImg>>;
  try { got = await fetchImg(src, false); }
  catch (e) {
    if (!/get 429|size /.test(String((e as Error).message))) throw e;
    got = await fetchImg(src, true);
  }
  const ct = got.ct, buf = got.buf;
  const ext = ct.includes("png") ? "png" : ct.includes("webp") ? "webp" : ct.includes("gif") ? "gif" : "jpg";
  const key = `travel/mirror/${(await sha1(src)).slice(0, 32)}.${ext}`;
  const put = await r2.fetch(`https://${CF_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`, {
    method: "PUT",
    headers: { "content-type": ct, "cache-control": "public, max-age=31536000, immutable" },
    body: buf,
  });
  if (!put.ok) throw new Error("put " + put.status);
  return `${R2_PUBLIC_URL}/${key}`;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (!CRON_SECRET || (xcron !== CRON_SECRET && !auth.includes(CRON_SECRET))) return j({ ok: false, reason: "unauthorized" }, 401);
  const url = new URL(req.url);
  const n = Math.min(Math.max(Number(url.searchParams.get("n") || "40"), 1), 80);
  const par = Math.min(Math.max(Number(url.searchParams.get("par") || "4"), 1), 8);

  const { data: todo, error } = await supa.rpc("travel_photo_mirror_todo", { p_n: n });
  if (error) return j({ ok: false, reason: error.message }, 500);
  const list: string[] = (todo || []).map((r: any) => r.src);
  const t0 = Date.now();
  let done = 0, fail = 0, rows = 0;
  const errs: string[] = [];
  for (let i = 0; i < list.length; i += par) {
    if (Date.now() - t0 > 110_000) break;   // 150초 벽 전에 끊는다(남은 건 다음 회차)
    await Promise.all(list.slice(i, i + par).map(async (src) => {
      try {
        const dst = await mirror(src);
        const { data: r, error: e } = await supa.rpc("travel_photo_mirror_apply", { p_src: src, p_dst: dst });
        if (e) throw new Error(e.message);
        done++; rows += Number(r || 0);
      } catch (e) {
        fail++; if (errs.length < 5) errs.push(String((e as Error).message || e).slice(0, 80));
        await supa.rpc("travel_photo_mirror_fail", { p_src: src, p_err: String((e as Error).message || e).slice(0, 200) });
      }
    }));
  }
  return j({ ok: true, picked: list.length, done, fail, rows, ms: Date.now() - t0, errs });
});
