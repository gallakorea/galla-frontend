// 사진 없는 맛집에 '그 집이 나온 영상'을 붙인다 — 카드 썸네일이 통째로 비어 있던 문제.
//
// 배경: 4,076곳 중 영상이 연결된 건 253곳뿐이었다. 나머지는 블로그 스윕으로 들어와서
//   어느 영상에 나왔는지 모른다. 그런데 채널들은 **제목에 상호를 쓴다**.
//   업로드 플레이리스트는 50편에 1유닛이라, 채널 전체 제목을 받아두는 게 거의 공짜다.
//   (search.list 는 100유닛이라 4,000번 부르는 건 불가능하다 — 그래서 이 경로다.)
//
// ⚠️ 짧은 상호는 오탐이 난다("본가", "청기와" 같은 두 글자). 3글자 이상만 매칭하고,
//    그마저도 채널이 일치하는 영상 안에서만 찾는다 — 다른 채널 영상이 붙으면 거짓말이 된다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const YT = Deno.env.get("YOUTUBE_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const norm = (s: string) => String(s || "").replace(/[\s()\[\]<>·,.\-_'"`~!?·]/g, "").toLowerCase();

async function ytGet(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set("key", YT);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`yt ${path} ${r.status} ${(await r.text()).slice(0, 160)}`);
  return await r.json();
}

/* 채널 전체 업로드를 훑어 제목을 쌓는다. 50편에 1유닛. */
async function syncChannel(slug: string, chId: string, cap: number) {
  const uploads = "UU" + chId.slice(2);
  let token = "", got = 0;
  const rows: any[] = [];
  for (let i = 0; i < cap; i++) {
    const d: any = await ytGet("playlistItems", {
      part: "snippet", playlistId: uploads, maxResults: "50",
      ...(token ? { pageToken: token } : {}),
    });
    for (const it of d.items || []) {
      const s = it.snippet || {};
      const vid = s.resourceId?.videoId;
      if (!vid || !s.title) continue;
      rows.push({ channel: slug, video_id: vid, title: s.title, published_at: s.publishedAt });
    }
    got += (d.items || []).length;
    token = d.nextPageToken || "";
    if (!token) break;
  }
  for (let i = 0; i < rows.length; i += 500) {
    await supa.from("food_videos").upsert(rows.slice(i, i + 500), { onConflict: "channel,video_id" });
  }
  return got;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const only = url.searchParams.get("channel");
  const doSync = url.searchParams.get("sync") !== "0";
  const pages = Number(url.searchParams.get("pages") || "12");     // 12*50 = 600편
  const rotN = Number(url.searchParams.get("n") || "6");

  const report: any[] = [];

  if (doSync && YT) {
    let q = supa.from("food_channels").select("slug,yt_channel_id,last_video_at")
      .eq("active", true).not("yt_channel_id", "is", null);
    const { data: chans } = only ? await q.eq("slug", only) : await q.limit(rotN);
    for (const c of (chans || []) as any[]) {
      try { report.push({ ch: c.slug, videos: await syncChannel(c.slug, c.yt_channel_id, pages) }); }
      catch (e) { report.push({ ch: c.slug, err: String(e).slice(0, 140) }); }
    }
  }

  /* ── 매칭 ── 채널이 같은 영상 안에서만 상호를 찾는다 */
  /* ⚠️ 여기서도 PostgREST 1,000행 상한에 걸린다 — .limit(50000) 을 줘도 1,000편만 온다.
     카탈로그를 다 못 보면 매칭이 통째로 헛돈다(실측: linked 1~2건). range 로 끝까지 읽는다. */
  const vids: any[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data } = await supa.from("food_videos").select("channel,video_id,title")
      .range(from, from + 999);
    const arr = (data || []) as any[];
    vids.push(...arr);
    if (arr.length < 1000) break;
  }
  const byCh = new Map<string, { id: string; t: string }[]>();
  for (const v of vids) {
    const k = v.channel;
    (byCh.get(k) || byCh.set(k, []).get(k)!).push({ id: v.video_id, t: norm(v.title) });
  }

  /* ⚠️ PostgREST 는 RPC 결과도 기본 1,000행에서 자른다 — p_limit 을 6000 으로 줘도
     1,000곳만 돌아왔다(관광공사 사진에서 밟은 것과 같은 함정). 끝까지 페이징한다. */
  const targets: any[] = [];
  for (let off = 0; off < 30000; off += 1000) {
    const { data } = await supa.rpc("food_sources_without_video", { p_limit: 1000, p_offset: off });
    const arr = (data || []) as any[];
    targets.push(...arr);
    if (arr.length < 1000) break;
  }
  let linked = 0, skipped = 0;
  const ups: any[] = [];
  for (const t of targets) {
    const n = norm(t.name);
    if (n.length < 3) { skipped++; continue; }          // 두 글자 상호는 오탐이 많다
    const list = byCh.get(t.channel);
    if (!list) continue;
    const hit = list.find((v) => v.t.includes(n));
    if (!hit) continue;
    ups.push({ id: t.source_id, video_id: hit.id });
    linked++;
  }
  for (const u of ups) {
    await supa.from("food_place_sources").update({ video_id: u.video_id }).eq("id", u.id);
  }
  return j({ ok: true, report, catalog: vids.length,
             targets: targets.length, linked, skipped_short: skipped });
});
