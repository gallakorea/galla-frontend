// 핫 영상 수집 — YouTube Data API v3 '인기 급상승'(chart=mostPopular, KR)
// 30분마다 크론이 호출. 영상은 저장/재호스팅하지 않고 메타데이터만 담는다(재생은 공식 iframe).
//
// 피드(feed) = 방송 카테고리. 유튜브 카테고리 몇 개 + 키워드를 묶어 하나로 만든다.
// PK가 (feed, video_id)라 같은 영상이 여러 피드에 들어갈 수 있고, rank는 피드 안에서 매긴다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const KEY = Deno.env.get("YOUTUBE_API_KEY");
const REGION = "KR";

/* ── 키워드 (유튜브에 없는 분류) ───────────────────────── */
const KW = {
  drama: /드라마|\d+\s*회|\d+\s*화|예고|하이라이트|스페셜\s*클립|메이킹|EP\.?\s*\d+|티저|명장면/i,
  dramaCh: /드라마|스튜디오|tvN|JTBC|SBS|KBS|MBC|ENA|넷플릭스|Netflix|Drama|채널A|TV조선/i,
  food: /먹방|맛집|먹어|리얼사운드|ASMR\s*먹|쿡방|레시피|요리|한끼|폭식|메뉴|식당|맛있|존맛|국밥|치킨|디저트|카페|백종원|편의점\s*신상/i,
  travel: /여행|캠핑|백패킹|배낭|호캉스|호텔|리조트|항공|공항|제주|부산|유럽|일본\s*여행|동남아|기차\s*여행|로드트립|투어|해외/i,
  hobby: /취미|만들기|DIY|조립|프라모델|피규어|낚시|등산|자전거|사진\s*찍|그림\s*그리|뜨개|목공|다꾸|키보드\s*빌드|하울|언박싱/i,
  money: /주식|증시|코스피|나스닥|부동산|금리|환율|비트코인|코인|재테크|투자|연금|세금|월급|적금|대출|경제|물가|배당|ETF/i,
  edu: /강의|배우기|기초|입문|공부|수능|토익|영어|문법|정리해|알려드림|해설|원리|역사|과학|총정리|하는\s*법/i,
};

/* ── 피드 정의 ─────────────────────────────────────────
   cats: 유튜브 videoCategoryId · kw: 전체 풀에서 걸러낼 키워드
   편수가 얇던 분류(드라마·취미·경제·교육·여행)를 큰 축에 통폐합했다. */
type Feed = { feed: string; cats: string[]; kw?: RegExp[]; kwCh?: RegExp };
const FEEDS: Feed[] = [
  { feed: "news",   cats: ["25"],       kw: [KW.money] },              // 뉴스·경제
  { feed: "ent",    cats: ["24", "23"] },                              // 예능·코믹
  { feed: "drama",  cats: ["1"],        kw: [KW.drama], kwCh: KW.dramaCh }, // 드라마·영화
  { feed: "music",  cats: ["10"] },                                    // 음악
  { feed: "game",   cats: ["20", "17"] },                              // 게임·스포츠
  { feed: "food",   cats: [],           kw: [KW.food] },               // 맛집·먹방
  { feed: "life",   cats: ["22"],       kw: [KW.travel, KW.hobby] },   // 라이프·여행·취미
  { feed: "beauty", cats: ["26"] },                                    // 뷰티·패션
  { feed: "animal", cats: ["15"] },                                    // 동물
  { feed: "tech",   cats: ["28"],       kw: [KW.edu] },                // IT·과학·교육
];

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

/* ── 쇼츠 판별 ─────────────────────────────────────────
   API는 쇼츠 여부를 안 준다. 길이만으로는 3분짜리 쇼츠가 롱폼에 섞인다.
   유튜브는 '세로 영상'에만 원본비율 썸네일(oardefault.jpg)을 만든다 →
   그게 존재하면 세로 = 쇼츠. (가로 영상은 404) */
const SHORT_MAX_SEC = 185;   // 쇼츠 상한 3분 + 여유

async function isVertical(id: string): Promise<boolean> {
  try {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/oardefault.jpg`, { method: "HEAD" });
    return r.ok;
  } catch { return false; }
}

// 동시 요청은 적당히 제한 (수백 개를 한꺼번에 던지지 않게)
async function markShorts(pool: Map<string, any>): Promise<Set<string>> {
  const cand = [...pool.values()]
    .filter((v) => {
      const s = durSec(v.contentDetails?.duration ?? null);
      return s > 0 && s <= SHORT_MAX_SEC;
    })
    .map((v) => v.id);

  const shorts = new Set<string>();
  const SIZE = 20;
  for (let i = 0; i < cand.length; i += SIZE) {
    const batch = cand.slice(i, i + SIZE);
    const res = await Promise.all(batch.map(isVertical));
    batch.forEach((id, j) => { if (res[j]) shorts.add(id); });
  }
  return shorts;
}

function toRow(v: any, feed: string, rank: number, now: string, shorts: Set<string>) {
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
    is_short: shorts.has(v.id),
    category_id: v.snippet?.categoryId ?? null,
    rank,
    collected_at: now,
  };
}

async function fetchChart(cat: string | null, max: number): Promise<any[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  // status 추가 → status.embeddable 로 '임베드 차단'(디즈니·방송사·음원 Topic 등) 영상을 걸러낸다.
  url.searchParams.set("part", "snippet,statistics,contentDetails,status");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", REGION);
  url.searchParams.set("maxResults", String(max));
  if (cat) url.searchParams.set("videoCategoryId", cat);
  url.searchParams.set("key", KEY!);

  const res = await fetch(url.toString());
  const data = await res.json();
  // 카테고리에 따라 KR 차트가 비어 있을 수 있다 → 그냥 건너뛴다.
  if (!res.ok || !Array.isArray(data.items)) return [];
  // 🚫 임베드 차단 영상 제외 — 앱 안에서 재생 불가(오류 150/153)라 목록에 넣지 않는다.
  //    status.embeddable===false 인 것만 걸러내고, 값이 없으면(구버전 응답) 통과시킨다.
  return data.items.filter((v: any) => v?.status?.embeddable !== false);
}

const views = (v: any) => Number(v.statistics?.viewCount ?? 0);

Deno.serve(async () => {
  if (!KEY) return json({ ok: false, error: "YOUTUBE_API_KEY 미설정" }, 500);

  const now = new Date().toISOString();
  const pool = new Map<string, any>();          // 전체 풀(키워드 매칭용)
  const byCat = new Map<string, any[]>();       // 카테고리별 원본

  // 1) 전체 인기차트
  const allItems = await fetchChart(null, 50);
  allItems.forEach((v) => pool.set(v.id, v));

  // 2) 필요한 카테고리만 한 번씩
  const cats = [...new Set(FEEDS.flatMap((f) => f.cats))];
  for (const c of cats) {
    const items = await fetchChart(c, 45);
    byCat.set(c, items);
    items.forEach((v) => pool.set(v.id, v));
  }

  // 3) 쇼츠 판별 (세로 썸네일 존재 여부)
  const shorts = await markShorts(pool);

  // 4) 피드 조립
  const rows: any[] = [];
  const counts: Record<string, number> = {};

  allItems.forEach((v, i) => rows.push(toRow(v, "all", i + 1, now, shorts)));
  counts["all"] = allItems.length;

  const all = [...pool.values()];
  for (const f of FEEDS) {
    const picked = new Map<string, any>();
    for (const c of f.cats) (byCat.get(c) || []).forEach((v) => picked.set(v.id, v));
    for (const re of f.kw || []) {
      for (const v of all) {
        const t = v.snippet?.title ?? "";
        const d = (v.snippet?.description ?? "").slice(0, 200);
        const ch = v.snippet?.channelTitle ?? "";
        if (!re.test(`${t} ${d} ${ch}`)) continue;
        if (f.kwCh && !f.kwCh.test(`${t} ${ch}`)) continue;
        picked.set(v.id, v);
      }
    }
    const list = [...picked.values()].sort((a, b) => views(b) - views(a));
    list.forEach((v, i) => rows.push(toRow(v, f.feed, i + 1, now, shorts)));
    counts[f.feed] = list.length;
  }

  if (!rows.length) return json({ ok: false, error: "youtube_api_failed" }, 502);

  const { error } = await supa
    .from("youtube_hot")
    .upsert(rows, { onConflict: "feed,video_id" });
  if (error) return json({ ok: false, error: "upsert_failed", detail: error.message }, 500);

  // 이번 수집에 없던(=차트에서 내려간) 영상 정리
  await supa.from("youtube_hot").delete().lt("collected_at", now);

  return json({
    ok: true,
    total: rows.length,
    uniqueVideos: pool.size,
    shorts: shorts.size,
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
