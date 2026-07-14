// 핫 영상 수집 — YouTube Data API v3 '인기 급상승'(chart=mostPopular, KR)
// 30분마다 크론이 호출. 영상은 저장/재호스팅하지 않고 메타데이터만 담는다(재생은 공식 iframe).
//
// 피드(feed) 단위로 수집: '전체' + 방송 카테고리.
// 유튜브에 없는 카테고리(드라마·맛집먹방·취미·경제금융)는 수집한 전체 풀에서
// 제목/채널/설명 신호로 뽑아낸다.
// PK가 (feed, video_id)라 같은 영상이 여러 피드에 들어갈 수 있고, rank는 피드 안에서 매긴다.
// videos.list = 1 unit/호출 → 14호출 × 48회/일 ≈ 672 unit (무료 쿼터 10,000/일).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KEY = Deno.env.get("YOUTUBE_API_KEY");
const REGION = "KR";

// 유튜브 videoCategoryId 로 바로 받는 피드
const API_FEEDS: { feed: string; cat: string | null; max: number }[] = [
  { feed: "all",    cat: null, max: 50 },
  { feed: "news",   cat: "25", max: 40 }, // 뉴스·시사
  { feed: "ent",    cat: "24", max: 40 }, // 예능·엔터
  { feed: "music",  cat: "10", max: 40 }, // 음악
  { feed: "movie",  cat: "1",  max: 40 }, // 영화·애니
  { feed: "comic",  cat: "23", max: 40 }, // 코믹
  { feed: "game",   cat: "20", max: 40 }, // 게임
  { feed: "sports", cat: "17", max: 40 }, // 스포츠
  { feed: "life",   cat: "22", max: 40 }, // 라이프스타일·브이로그
  { feed: "beauty", cat: "26", max: 40 }, // 뷰티·패션 (Howto & Style)
  { feed: "tech",   cat: "28", max: 40 }, // IT·과학
  { feed: "animal", cat: "15", max: 40 }, // 동물·펫
  // 여행(19)·교육(27)은 한국 인기차트가 비어 있어(items 0) 아래 키워드로 뽑는다.
];

// 키워드로 뽑는 피드 — 위에서 모은 전체 풀에서 걸러낸다
const KEYWORD_FEEDS: { feed: string; re: RegExp; ch?: RegExp }[] = [
  {
    // 드라마: 회차·예고·방송사 신호가 함께 있어야 한다(영화 예고편과 섞이지 않게)
    feed: "drama",
    re: /드라마|\d+\s*회|\d+\s*화|예고|하이라이트|스페셜\s*클립|메이킹|EP\.?\s*\d+|티저|명장면/i,
    ch: /드라마|스튜디오|tvN|JTBC|SBS|KBS|MBC|ENA|넷플릭스|Netflix|Drama|채널A|TV조선/i,
  },
  {
    feed: "food",
    re: /먹방|맛집|먹어|리얼사운드|ASMR\s*먹|쿡방|레시피|요리|한끼|폭식|메뉴|식당|맛있|존맛|물회|국밥|치킨|디저트|카페\s*투어/i,
  },
  {
    feed: "hobby",
    re: /취미|만들기|DIY|조립|프라모델|피규어|캠핑|낚시|등산|자전거|사진\s*찍|그림\s*그리|뜨개|목공|다꾸|키보드\s*빌드|하울/i,
  },
  {
    feed: "money",
    re: /주식|증시|코스피|나스닥|부동산|금리|환율|비트코인|코인|재테크|투자|연금|세금|월급|적금|대출|경제|물가|배당|ETF/i,
  },
  {
    feed: "travel",
    re: /여행|캠핑|백패킹|배낭|호캉스|호텔|리조트|항공|공항|제주|부산|유럽|일본\s*여행|동남아|기차\s*여행|로드트립|투어|해외/i,
  },
  {
    feed: "edu",
    re: /강의|배우기|기초|입문|공부|수능|토익|영어|문법|정리해|알려드림|해설|원리|역사|과학|총정리|팁\s*\d|하는\s*법/i,
  },
];

// 쇼츠 판별: 유튜브는 세로 60초 이하(최근 3분까지)를 쇼츠로 본다.
// API가 쇼츠 여부를 안 주므로 길이 + #Shorts 해시태그로 판단한다.
const SHORTS_RE = /#shorts?|#쇼츠/i;

function bestThumb(t: any): string | null {
  if (!t) return null;
  return (t.maxres || t.standard || t.high || t.medium || t.default)?.url ?? null;
}

// PT1H2M3S → 3723
function durSec(iso: string | null): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || "");
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

function isShort(v: any): boolean {
  const sec = durSec(v.contentDetails?.duration ?? null);
  if (sec > 0 && sec <= 60) return true;
  const text = `${v.snippet?.title ?? ""} ${v.snippet?.description ?? ""}`;
  return sec > 0 && sec <= 180 && SHORTS_RE.test(text);
}

function toRow(v: any, feed: string, rank: number, now: string) {
  const sec = durSec(v.contentDetails?.duration ?? null);
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
    duration_sec: sec,
    is_short: isShort(v),
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
  // 카테고리에 따라 KR 차트가 비어 있을 수 있다 → 그 피드만 건너뛴다.
  if (!res.ok || !Array.isArray(data.items)) return [];
  return data.items;
}

Deno.serve(async () => {
  if (!KEY) return json({ ok: false, error: "YOUTUBE_API_KEY 미설정" }, 500);

  const now = new Date().toISOString();
  const rows: any[] = [];
  const counts: Record<string, number> = {};
  const pool = new Map<string, any>();   // 키워드 피드를 뽑을 전체 풀

  for (const { feed, cat, max } of API_FEEDS) {
    const items = await fetchChart(cat, max);
    items.forEach((v, i) => rows.push(toRow(v, feed, i + 1, now)));
    counts[feed] = items.length;
    for (const v of items) pool.set(v.id, v);
  }

  const all = [...pool.values()];
  for (const { feed, re, ch } of KEYWORD_FEEDS) {
    const hits = all.filter((v) => {
      const t = v.snippet?.title ?? "";
      const d = (v.snippet?.description ?? "").slice(0, 200);
      const c = v.snippet?.channelTitle ?? "";
      if (!re.test(`${t} ${d} ${c}`)) return false;
      return ch ? ch.test(`${t} ${c}`) : true;
    }).sort(
      (a, b) => Number(b.statistics?.viewCount ?? 0) - Number(a.statistics?.viewCount ?? 0),
    );
    hits.forEach((v, i) => rows.push(toRow(v, feed, i + 1, now)));
    counts[feed] = hits.length;
  }

  if (!rows.length) return json({ ok: false, error: "youtube_api_failed" }, 502);

  const { error } = await supa
    .from("youtube_hot")
    .upsert(rows, { onConflict: "feed,video_id" });
  if (error) return json({ ok: false, error: "upsert_failed", detail: error.message }, 500);

  // 이번 수집에 없던(=차트에서 내려간) 영상 정리 — 목록이 무한정 커지지 않게
  await supa.from("youtube_hot").delete().lt("collected_at", now);

  return json({
    ok: true,
    total: rows.length,
    shorts: rows.filter((r) => r.is_short).length,
    feeds: counts,
    region: REGION,
  });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
