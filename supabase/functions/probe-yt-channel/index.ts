// 후보 유튜브 채널을 **검증만** 하는 일회용 함수.
//
// 왜 따로 만드나: 채널을 food_channels 에 바로 넣으면 그 순간부터 '누가 갔나'에 뜬다.
// 엉뚱한 채널이면 서비스가 통째로 거짓말이 된다. 그래서 스테이징(yt_probe)에만 받아두고,
// 우리 가게 이름과 얼마나 맞는지 SQL 로 재본 뒤에 사람이 판단해서 등록한다.
//
// 비용: channels.list 1유닛 + playlistItems 50편당 1유닛. 7채널 × 600편 ≈ 90유닛.

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

async function yt(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await ytFetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 140)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!YT) return j({ ok: false, reason: "no_yt_key" }, 500);

  const url = new URL(req.url);

  /* 🔎 해소 검증 — 자동 해소한 yt_channel_id 가 **진짜 그 채널인지** 사람이 눈으로 본다.
     titleMatches 가 느슨해서(2글자 토큰 하나만 겹쳐도 통과) 엉뚱한 채널이 박힐 수 있다.
     '누가 갔나'에 잘못 뜨면 서비스가 통째로 거짓말이 되므로 등록 전에 반드시 센다.
     channels.list 는 50개까지 1유닛. */
  const ids = url.searchParams.get("ids");
  if (ids) {
    const d: any = await yt("channels", { part: "snippet,statistics", id: ids });
    return j({ ok: true, rows: (d.items || []).map((it: any) => ({
      id: it.id, title: it.snippet?.title, handle: it.snippet?.customUrl,
      subs: Number(it.statistics?.subscriberCount || 0),
      videos: Number(it.statistics?.videoCount || 0),
    })) });
  }

  /* 🔎 고정 댓글 진단 — 설명에 주소를 안 쓰는 채널(또간집·쯔양·홍유)이 있다.
     한국 먹방은 가게 목록을 **고정 댓글**에 다는 일이 흔하다. 사실이면 수확 물량이
     크게 는다. commentThreads.list 는 1유닛이라 확인 비용이 사실상 0이다. */
  /* 🔎 번역 대량 진단 — 영상 50편씩 묶어 본다(videos.list 는 id 50개까지 1유닛).
     ⚠️ 앞선 진단이 부실했다: **한국어 주소 정규식으로만** 봤다. 영어 번역은
        "123 Jong-ro, Jongno-gu, Seoul" 처럼 로마자로 나오는데 그 패턴을 못 잡는다.
        표본도 3편뿐이었다. 여러 언어·여러 패턴으로 다시 센다. */
  const bulk = url.searchParams.get("locbulk");
  if (bulk) {
    const { data: vs } = await supa.rpc("food_videos_no_addr", { p_channel: bulk, p_limit: 50 });
    const ids = ((vs || []) as any[]).map((v) => v.video_id);
    if (!ids.length) return j({ ok: true, channel: bulk, note: "대상 없음" });
    const d: any = await yt("videos", { part: "snippet,localizations", id: ids.join(",") });
    const KO = /[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]/;
    /* 로마자 주소: 'Jong-ro', 'Gangnam-gu', 'Seoul' 같은 조각 */
    const EN = /\b[A-Z][a-z]+(-(ro|gil|dong|gu|si|gun|eup|myeon))\b|\b(Seoul|Busan|Daegu|Incheon|Gwangju|Daejeon|Ulsan|Jeju)\b/;
    let withLoc = 0, koHit = 0, enHit = 0, anyLonger = 0;
    const samples: any[] = [];
    for (const it of (d.items || [])) {
      const base = String(it.snippet?.description || "");
      const locs: any = it.localizations || {};
      const keys = Object.keys(locs).filter((k) => String(locs[k]?.description || "").trim().length > 0);
      if (!keys.length) continue;
      withLoc++;
      for (const k of keys) {
        const t = String(locs[k].description || "");
        const ko = KO.test(t), en = EN.test(t);
        if (t.length > base.length) anyLonger++;
        if (ko) koHit++;
        if (en) enHit++;
        if ((ko || en) && samples.length < 4) samples.push({ id: it.id, lang: k, ko, en, head: t.slice(0, 160) });
      }
    }
    return j({ ok: true, channel: bulk, 영상수: ids.length, 번역있는영상: withLoc,
               한국어주소_적중: koHit, 로마자주소_적중: enHit, 원문보다긴번역: anyLonger, samples });
  }

  /* 🔎 번역(localizations) 진단 — 제작자가 단 번역 제목·설명이다.
     공식 API 로 받을 수 있는 유일한 '번역'이다(자막 다운로드는 채널 소유자 인증이 필요하고,
     비공식 경로는 안 쓴다). 기본 설명에 없는 주소가 번역본에 있는지 본다. */
  const lv = url.searchParams.get("loc");
  if (lv) {
    const d: any = await yt("videos", { part: "snippet,localizations", id: lv });
    const it = (d.items || [])[0] || {};
    const RE = /[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]/;
    const base = String(it.snippet?.description || "");
    const locs = it.localizations || {};
    return j({ ok: true, video: lv,
      기본설명_주소: RE.test(base), 기본설명_길이: base.length,
      번역언어: Object.keys(locs),
      번역별: Object.entries(locs).map(([k, v]: any) => ({
        lang: k, len: String(v?.description || "").length,
        주소: RE.test(String(v?.description || "")),
        head: String(v?.description || "").slice(0, 120) })) });
  }

  const cv = url.searchParams.get("comments");
  if (cv) {
    const d: any = await yt("commentThreads", {
      part: "snippet", videoId: cv, order: "relevance", maxResults: "5", textFormat: "plainText",
    });
    return j({ ok: true, video: cv, comments: (d.items || []).map((i: any) => {
      const c = i.snippet?.topLevelComment?.snippet || {};
      const t = String(c.textDisplay || "");
      return { author: c.authorDisplayName, likes: c.likeCount,
               addr: /[가-힣]+(시|군|구)\s*[가-힣0-9]+(로|길)\s*[0-9]/.test(t),
               head: t.slice(0, 220) };
    }) });
  }

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
