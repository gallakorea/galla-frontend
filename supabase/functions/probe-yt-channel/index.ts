// 후보 유튜브 채널을 **검증만** 하는 일회용 함수.
//
// 왜 따로 만드나: 채널을 food_channels 에 바로 넣으면 그 순간부터 '누가 갔나'에 뜬다.
// 엉뚱한 채널이면 서비스가 통째로 거짓말이 된다. 그래서 스테이징(yt_probe)에만 받아두고,
// 우리 가게 이름과 얼마나 맞는지 SQL 로 재본 뒤에 사람이 판단해서 등록한다.
//
// 비용: channels.list 1유닛 + playlistItems 50편당 1유닛. 7채널 × 600편 ≈ 90유닛.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const YT = Deno.env.get("YOUTUBE_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function yt(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set("key", YT);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 140)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!YT) return j({ ok: false, reason: "no_yt_key" }, 500);

  const url = new URL(req.url);

  /* 검색 모드 — 프로그램 이름으로 후보 채널을 찾는다.
     ⚠️ search.list 는 100유닛이라(playlistItems 의 100배) 남발하면 안 된다. 프로그램당 1회.
        그리고 결과의 videoCount 는 search 가 안 주므로 channels.list 로 한 번 더 받는다(1유닛). */
  const q = url.searchParams.get("search");
  if (q) {
    const d: any = await yt("search", { part: "snippet", type: "channel", q, maxResults: "8",
                                        regionCode: "KR", relevanceLanguage: "ko" });
    const ids = (d.items || []).map((i: any) => i.snippet?.channelId || i.id?.channelId).filter(Boolean);
    const c: any = ids.length
      ? await yt("channels", { part: "snippet,statistics", id: ids.join(",") }) : { items: [] };
    return j({ ok: true, q, candidates: (c.items || []).map((i: any) => ({
      id: i.id, name: i.snippet?.title, handle: i.snippet?.customUrl,
      videos: Number(i.statistics?.videoCount || 0),
      subs: Number(i.statistics?.subscriberCount || 0),
    })) });
  }

  const handles = (url.searchParams.get("handles") || "").split(",").map((h) => h.trim()).filter(Boolean);
  const pages = Number(url.searchParams.get("pages") || "12");   // 12*50 = 600편
  const report: any[] = [];

  for (const h of handles) {
    try {
      /* 핸들이 없거나 못 찾는 채널이 있어 채널ID(UC...)도 받는다 */
      const c: any = await yt("channels", h.startsWith("UC")
        ? { part: "snippet,contentDetails,statistics", id: h }
        : { part: "snippet,contentDetails,statistics", forHandle: h });
      const it = (c.items || [])[0];
      if (!it) { report.push({ handle: h, err: "not_found" }); continue; }
      const uploads = it.contentDetails?.relatedPlaylists?.uploads;
      let token = "", got = 0;
      const rows: any[] = [];
      for (let i = 0; i < pages && uploads; i++) {
        const d: any = await yt("playlistItems", {
          part: "snippet", playlistId: uploads, maxResults: "50",
          ...(token ? { pageToken: token } : {}),
        });
        for (const v of d.items || []) {
          const s = v.snippet || {};
          const vid = s.resourceId?.videoId;
          if (!vid || !s.title) continue;
          rows.push({ handle: h, channel_id: it.id, video_id: vid, title: s.title,
                      description: String(s.description || "").slice(0, 4000),
                      published_at: s.publishedAt });
        }
        got += (d.items || []).length;
        token = d.nextPageToken || "";
        if (!token) break;
      }
      for (let i = 0; i < rows.length; i += 500) {
        await supa.from("yt_probe").upsert(rows.slice(i, i + 500), { onConflict: "handle,video_id" });
      }
      const addr = rows.filter((r) =>
        /[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]/.test(r.description || "")).length;
      report.push({ handle: h, channelId: it.id, name: it.snippet?.title,
                    thumb: it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || null,
                    subs: Number(it.statistics?.subscriberCount || 0),
                    totalVideos: Number(it.statistics?.videoCount || 0), pulled: got,
                    withAddr: addr, addrPct: got ? Math.round(addr * 100 / got) : 0 });
    } catch (e) { report.push({ handle: h, err: String(e).slice(0, 160) }); }
  }
  return j({ ok: true, report });
});
