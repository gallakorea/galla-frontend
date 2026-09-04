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
import { ytFetch } from "../_shared/ytkey.ts";

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
  const r = await ytFetch(u);
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
      /* 설명란까지 담는다 — 제목엔 상호가 없어도 설명엔 있다.
         playlistItems 가 snippet 에 이미 실어주므로 추가 호출이 없다. */
      rows.push({ channel: slug, video_id: vid, title: s.title,
                  description: String(s.description || "").slice(0, 4000),
                  published_at: s.publishedAt });
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

  /* ── 매칭 ① 주소 기반 ── 상호보다 주소가 훨씬 강한 키다.
     설명란에 주소를 적는 채널이 많다(김사원 296편 중 240편). 상호는 표기가 흔들리고
     동명이인이 있지만 주소는 안 그렇다 — 실측: 이름 기반 18건 → 주소 기반 131곳.
     방금 동기화한 채널만 돌린다(전 채널을 한 번에 돌리면 statement timeout 이 난다). */
  for (const r of report) {
    if (!r.ch || r.err) continue;
    try {
      const { data } = await supa.rpc("food_link_videos_by_address", { p_channel: r.ch });
      r.addr = data || null;
    } catch (e) { r.addr_err = String(e).slice(0, 120); }
  }

  /* 🔴 이름 기반 매칭은 DB 안으로 옮겼다(food_link_videos_by_name).
     여기 자바스크립트 판은 영상 1.4만 편 + 대상 3만 건을 메모리로 다 올린 뒤
     링크마다 UPDATE 를 따로 날려 **엣지 150초를 늘 넘겼다** — 한 번도 끝까지 간 적이 없다.
     그런데 pg_cron 이력엔 성공으로 남아 아무도 몰랐다(실측 2026-09-04: 3회 호출 전부 timeout).
     카탈로그를 깊이 받을 때는 이 구간을 건너뛴다. 안 그러면 동기화까지 같이 죽는다. */
  if (url.searchParams.get("nolink") === "1") {
    return j({ ok: true, report, skipped: "name_match" });
  }

  /* ── 매칭 ② 이름 기반 ── 채널이 같은 영상 안에서만 상호를 찾는다 */
  /* ⚠️ 여기서도 PostgREST 1,000행 상한에 걸린다 — .limit(50000) 을 줘도 1,000편만 온다.
     카탈로그를 다 못 보면 매칭이 통째로 헛돈다(실측: linked 1~2건). range 로 끝까지 읽는다. */
  const vids: any[] = [];
  for (let from = 0; from < 60000; from += 1000) {
    const { data } = await supa.from("food_videos").select("channel,video_id,title,description")
      .range(from, from + 999);
    const arr = (data || []) as any[];
    vids.push(...arr);
    if (arr.length < 1000) break;
  }
  const byCh = new Map<string, { id: string; t: string }[]>();
  for (const v of vids) {
    const k = v.channel;
    /* 제목 + 설명을 한 덩어리로 본다. 상호는 둘 중 어디에든 있을 수 있다. */
    (byCh.get(k) || byCh.set(k, []).get(k)!)
      .push({ id: v.video_id, t: norm((v.title || "") + " " + (v.description || "")) });
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
    /* ⚠️ 설명란까지 보면 오탐이 늘어난다(설명에 다른 가게·협찬사가 섞인다).
       세 글자로는 부족해 **네 글자 이상**만 본다. 짧은 상호는 포기하는 게
       엉뚱한 영상을 붙이는 것보다 낫다 — '누가 갔나'가 거짓말이 되면 끝이다. */
    if (n.length < 4) { skipped++; continue; }
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
