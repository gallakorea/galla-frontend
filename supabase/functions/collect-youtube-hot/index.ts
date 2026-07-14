// 핫 영상 수집 — YouTube Data API v3 의 '인기 급상승'(chart=mostPopular, KR)
// 30분마다 크론이 호출. videos.list = 1 unit/호출이라 무료 쿼터(10,000/일) 대비 무시할 수준.
// 영상은 우리가 저장/재호스팅하지 않고 메타데이터만 담는다(재생은 공식 iframe).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KEY = Deno.env.get("YOUTUBE_API_KEY");
const REGION = "KR";
const MAX = 50; // 한 번에 받을 수 있는 최대치

function bestThumb(t: any): string | null {
  if (!t) return null;
  return (t.maxres || t.standard || t.high || t.medium || t.default)?.url ?? null;
}

Deno.serve(async () => {
  if (!KEY) {
    return json({ ok: false, error: "YOUTUBE_API_KEY 미설정" }, 500);
  }

  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", REGION);
  url.searchParams.set("maxResults", String(MAX));
  url.searchParams.set("key", KEY);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (!res.ok || !Array.isArray(data.items)) {
    return json({ ok: false, error: "youtube_api_failed", detail: data?.error ?? data }, 502);
  }

  const now = new Date().toISOString();
  const rows = data.items.map((v: any, i: number) => ({
    video_id: v.id,
    title: v.snippet?.title ?? "",
    channel_title: v.snippet?.channelTitle ?? null,
    channel_id: v.snippet?.channelId ?? null,
    thumbnail: bestThumb(v.snippet?.thumbnails),
    description: (v.snippet?.description ?? "").slice(0, 500),
    published_at: v.snippet?.publishedAt ?? null,
    view_count: Number(v.statistics?.viewCount ?? 0),
    like_count: Number(v.statistics?.likeCount ?? 0),
    comment_count: Number(v.statistics?.commentCount ?? 0),
    duration: v.contentDetails?.duration ?? null,
    category_id: v.snippet?.categoryId ?? null,
    rank: i + 1,                 // 인기 급상승 순위
    collected_at: now,
  }));

  const { error } = await supa.from("youtube_hot").upsert(rows, { onConflict: "video_id" });
  if (error) return json({ ok: false, error: "upsert_failed", detail: error.message }, 500);

  // 이번 수집에 없던(=차트에서 내려간) 오래된 영상 정리 — 목록이 무한정 커지지 않게
  await supa.from("youtube_hot").delete().lt("collected_at", now);

  return json({ ok: true, collected: rows.length, region: REGION });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
