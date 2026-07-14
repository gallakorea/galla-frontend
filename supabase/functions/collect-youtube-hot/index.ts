// 핫 영상 수집 — YouTube Data API v3 '인기 급상승'(chart=mostPopular, KR)
// 30분마다 크론이 호출. 영상은 저장/재호스팅하지 않고 메타데이터만 담는다(재생은 공식 iframe).
//
// 피드(feed) 단위로 수집한다: '전체' + 방송 카테고리별.
// 같은 영상이 전체와 자기 카테고리에 동시에 뜰 수 있으므로 PK가 (feed, video_id)이고
// rank도 피드 안에서 매긴다.
// videos.list = 1 unit/호출 → 13호출 × 48회/일 ≈ 624 unit (무료 쿼터 10,000/일).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KEY = Deno.env.get("YOUTUBE_API_KEY");
const REGION = "KR";

// 우리 피드 ↔ 유튜브 videoCategoryId
// (유튜브엔 '드라마' 카테고리가 없어서 drama는 아래에서 키워드로 뽑는다)
const FEEDS: { feed: string; cat: string | null; max: number }[] = [
  { feed: "all",    cat: null, max: 50 },
  { feed: "news",   cat: "25", max: 30 }, // 뉴스·정치
  { feed: "ent",    cat: "24", max: 30 }, // 예능·엔터
  { feed: "music",  cat: "10", max: 30 }, // 음악
  { feed: "movie",  cat: "1",  max: 30 }, // 영화·애니
  { feed: "comic",  cat: "23", max: 30 }, // 코믹
  { feed: "game",   cat: "20", max: 30 }, // 게임
  { feed: "sports", cat: "17", max: 30 }, // 스포츠
  { feed: "life",   cat: "22", max: 30 }, // 일상·브이로그
  { feed: "beauty", cat: "26", max: 30 }, // 뷰티·패션
  { feed: "tech",   cat: "28", max: 30 }, // IT·과학
  { feed: "animal", cat: "15", max: 30 }, // 동물
];

// 드라마: 유튜브 카테고리가 없어 제목/채널 신호로 판별한다.
// (본편·예고·하이라이트·클립이 대부분 '예능(24)'이나 '영화(1)'로 올라온다)
const DRAMA_RE =
  /드라마|\d+\s*회|\d+\s*화|예고|하이라이트|스페셜\s*클립|메이킹|EP\.?\s*\d+|티저|본예고|명장면/i;
const DRAMA_CH_RE = /드라마|스튜디오|tvN|JTBC|SBS|KBS|MBC|ENA|넷플릭스|Netflix|Drama/i;

function bestThumb(t: any): string | null {
  if (!t) return null;
  return (t.maxres || t.standard || t.high || t.medium || t.default)?.url ?? null;
}

function toRow(v: any, feed: string, rank: number, now: string) {
  return {
    feed,
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
    rank,
    collected_at: now,
  };
}

async function fetchChart(cat: string | null, max: number): Promise<any[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", REGION);
  url.searchParams.set("maxResults", String(max));
  if (cat) url.searchParams.set("videoCategoryId", cat);
  url.searchParams.set("key", KEY!);

  const res = await fetch(url.toString());
  const data = await res.json();
  // 카테고리에 따라 KR 차트가 비어 있을 수 있다(400/빈 배열) → 그 피드만 건너뛴다.
  if (!res.ok || !Array.isArray(data.items)) return [];
  return data.items;
}

Deno.serve(async () => {
  if (!KEY) return json({ ok: false, error: "YOUTUBE_API_KEY 미설정" }, 500);

  const now = new Date().toISOString();
  const rows: any[] = [];
  const counts: Record<string, number> = {};
  const dramaPool = new Map<string, any>();

  for (const { feed, cat, max } of FEEDS) {
    const items = await fetchChart(cat, max);
    items.forEach((v, i) => rows.push(toRow(v, feed, i + 1, now)));
    counts[feed] = items.length;

    // 드라마 후보는 예능/영화/전체 풀에서 모은다
    if (feed === "all" || feed === "ent" || feed === "movie") {
      for (const v of items) {
        const t = v.snippet?.title ?? "";
        const c = v.snippet?.channelTitle ?? "";
        if (DRAMA_RE.test(t) && DRAMA_CH_RE.test(`${t} ${c}`)) dramaPool.set(v.id, v);
      }
    }
  }

  // 드라마 피드 — 조회수 순
  const drama = [...dramaPool.values()].sort(
    (a, b) => Number(b.statistics?.viewCount ?? 0) - Number(a.statistics?.viewCount ?? 0),
  );
  drama.forEach((v, i) => rows.push(toRow(v, "drama", i + 1, now)));
  counts["drama"] = drama.length;

  if (!rows.length) return json({ ok: false, error: "youtube_api_failed" }, 502);

  const { error } = await supa
    .from("youtube_hot")
    .upsert(rows, { onConflict: "feed,video_id" });
  if (error) return json({ ok: false, error: "upsert_failed", detail: error.message }, 500);

  // 이번 수집에 없던(=차트에서 내려간) 영상 정리 — 목록이 무한정 커지지 않게
  await supa.from("youtube_hot").delete().lt("collected_at", now);

  return json({ ok: true, total: rows.length, feeds: counts, region: REGION });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
