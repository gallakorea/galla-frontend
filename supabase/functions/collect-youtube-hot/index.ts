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
/* 🌍 수집 지역 — 코드에 박으면 언어를 열 때마다 배포가 필요하다.
   app_settings.collect_sources에서 읽되, 못 읽으면 KR로 돈다(한국 수집이 멈추면 안 된다). */
let REGION = "KR";
let LOCALE = "ko";

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
   cats: 유튜브 videoCategoryId(폴백) · kw: 제목·설명·채널명 키워드(우선)
   2026-08-08 재편: 편수가 얇던 '드라마'는 예능에 통합, 'life'를 지배하던 여행을 '여행'으로 분리. */
type Feed = { feed: string; cats: string[]; kw?: RegExp[]; kwCh?: RegExp };
const FEEDS: Feed[] = [
  { feed: "news",   cats: ["25"],       kw: [KW.money] },                       // 뉴스·시사·경제
  { feed: "ent",    cats: ["24", "23", "1"], kw: [KW.drama] },                  // 예능·코믹·드라마
  { feed: "music",  cats: ["10"] },                                             // 음악
  { feed: "game",   cats: ["20", "17"] },                                       // 게임·스포츠
  { feed: "food",   cats: [],           kw: [KW.food] },                        // 맛집·먹방
  { feed: "travel", cats: ["19"],       kw: [KW.travel] },                      // 여행 (신설 — life에서 분리)
  { feed: "life",   cats: ["22"],       kw: [KW.hobby] },                       // 일상·취미
  { feed: "beauty", cats: ["26"] },                                             // 뷰티·패션
  { feed: "animal", cats: ["15"] },                                             // 동물
  { feed: "tech",   cats: ["28"],       kw: [KW.edu] },                         // IT·과학·교육
];

/* ── 🎯 단일 배정 라우터 (2026-08-08 신설) ─────────────────
   기존 문제: 각 피드가 독립적으로 cats/kw를 긁어가 **한 영상이 여러 피드에 중복**되고,
   특히 '잡탕' 카테고리 22(People&Blogs, 전체의 25%)를 life가 통째로 먹어
   life 탭이 여행 브이로그로 도배됐다(실측).
   해결: 영상 하나당 **가장 잘 맞는 피드 하나**를 정한다.
     ① 구체적 키워드가 먼저(먹방·여행·뷰티·게임…) — 카테고리보다 정확
     ② 없으면 videoCategoryId로 폴백
   ※ 카테고리 차트로 '직접' 뽑힌 영상은 그 카테고리 신뢰도가 높아 폴백을 우선 적용. */
const KW_ROUTE: Array<[string, RegExp]> = [
  ["food",   KW.food],
  ["travel", KW.travel],
  ["news",   KW.money],
  ["beauty", /뷰티|메이크업|화장|스킨케어|코스메틱|립스틱|쿠션|헤어|염색|패션|코디|옷\s*추천|하울|겟레디위드미|GRWM/i],
  ["animal", /강아지|고양이|냥이|댕댕|반려|puppy|kitten|수달|햄스터|앵무|물고기\s*키우|파충류|유기견|유기묘/i],
  ["music",  /뮤직비디오|MV\b|음원|커버곡|노래\s*불러|버스킹|작곡|피아노|기타\s*연주|앨범|컴백|무대\s*직캠|라이브\s*클립/i],
  ["game",   /게임|플레이|공략|롤\b|리그오브레전드|배그|피파|메이플|던파|마크\b|마인크래프트|스팀\b|콘솔|e스포츠|롤드컵/i],
  ["tech",   /아이폰|갤럭시|노트북|리뷰\s*테크|언박싱\s*IT|AI\b|인공지능|챗GPT|코딩|프로그래밍|과학|우주|물리|화학/i],
  ["ent",    KW.drama],
  ["life",   KW.hobby],
];
const CAT_ROUTE: Record<string, string> = {
  "25": "news", "24": "ent", "23": "ent", "1": "ent", "10": "music",
  "20": "game", "17": "game", "19": "travel", "22": "life",
  "26": "beauty", "15": "animal", "28": "tech", "27": "tech", "2": "life",
};
function routeFeed(v: any, fromCat: string | null): string {
  const t = v?.snippet?.title ?? "";
  const d = (v?.snippet?.description ?? "").slice(0, 200);
  const ch = v?.snippet?.channelTitle ?? "";
  const blob = `${t} ${d} ${ch}`;
  // 카테고리 차트에서 직접 뽑힌 건 그 카테고리가 곧 정답(단, 잡탕 22는 키워드로 재판정)
  if (fromCat && fromCat !== "22" && CAT_ROUTE[fromCat]) return CAT_ROUTE[fromCat];
  for (const [feed, re] of KW_ROUTE) if (re.test(blob)) return feed;
  const cid = String(v?.snippet?.categoryId ?? "");
  return CAT_ROUTE[cid] || "life";
}

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

// 🧹 깨진 유니코드 제거 — 고립 서로게이트(이모지 반쪽)·널문자가 있으면 PostgREST의 jsonb 파싱이
//    "invalid input syntax for type json"으로 upsert 전체를 깨뜨린다(YouTube 제목/설명 + slice가 이모지 반절).
function sane(s: any): string {
  return String(s ?? "")
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")   // 짝 없는 상위 서로게이트
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")   // 짝 없는 하위 서로게이트
    .replace(/\u0000/g, "");                                 // 널문자
}
function toRow(v: any, feed: string, rank: number, now: string, shorts: Set<string>) {
  const sec = durSec(v.contentDetails?.duration ?? null);
  return {
    feed,
    video_id: v.id,
    title: sane(v.snippet?.title),
    channel_title: sane(v.snippet?.channelTitle) || null,
    channel_id: v.snippet?.channelId ?? null,
    thumbnail: bestThumb(v.snippet?.thumbnails),
    description: sane((v.snippet?.description ?? "").slice(0, 500)),
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
    // 📈 다음 런에서 '지금 얼마나 오르는 중인지'를 재기 위한 스냅샷(직전 수집치 보존)
    prev_view_count: PREV.get(v.id)?.views ?? null,
    prev_collected_at: PREV.get(v.id) ? new Date(PREV.get(v.id)!.at).toISOString() : null,
    velocity: Math.round(velocityOf(v)),
  };
}

const embeddable = (v: any) => v?.status?.embeddable !== false;

// 인기 급상승 차트 — pageToken으로 여러 장 이어받아 더 깊게(50→최대 max). 각 콜 1유닛으로 저렴.
async function fetchChart(cat: string | null, max: number): Promise<any[]> {
  const out: any[] = [];
  let pageToken = "";
  while (out.length < max) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics,contentDetails,status");
    url.searchParams.set("chart", "mostPopular");
    url.searchParams.set("regionCode", REGION);
    url.searchParams.set("maxResults", String(Math.min(50, max - out.length)));
    if (cat) url.searchParams.set("videoCategoryId", cat);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    url.searchParams.set("key", KEY!);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.items)) break;   // 카테고리 KR 차트가 비면 중단
    out.push(...data.items.filter(embeddable));          // 임베드 차단(디즈니·방송사·음원 Topic) 제외
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;                                // 차트 끝(보통 ~200)
  }
  return out;
}

// 채널명/핸들 → 채널ID. 결과는 youtube_channels에 캐시해 재해석 안 함.
//  · '@핸들'  → channels.list?forHandle (1유닛, 정확)
//  · 그냥 이름 → search.list?type=channel (100유닛, 근접매칭)
async function resolveChannelId(nameOrHandle: string): Promise<string | null> {
  if (nameOrHandle.startsWith("@")) {
    const u = new URL("https://www.googleapis.com/youtube/v3/channels");
    u.searchParams.set("part", "id");
    u.searchParams.set("forHandle", nameOrHandle);
    u.searchParams.set("key", KEY!);
    const r = await fetch(u.toString());
    const d = await r.json();
    if (r.ok && Array.isArray(d.items) && d.items.length) return d.items[0].id || null;
    return null;
  }
  const name = nameOrHandle;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("type", "channel");
  url.searchParams.set("q", name);
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("regionCode", REGION);
  url.searchParams.set("relevanceLanguage", "ko");
  url.searchParams.set("key", KEY!);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.items) || !data.items.length) return null;
  return data.items[0]?.id?.channelId || data.items[0]?.snippet?.channelId || null;
}

// 채널 업로드 재생목록(UU…)의 최신 영상 id 목록(1콜=1유닛).
async function playlistRecent(uploads: string, n: number): Promise<string[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  url.searchParams.set("part", "contentDetails");
  url.searchParams.set("playlistId", uploads);
  url.searchParams.set("maxResults", String(n));
  url.searchParams.set("key", KEY!);
  const res = await fetch(url.toString());
  const data = await res.json();
  if (!res.ok || !Array.isArray(data.items)) return [];
  return data.items.map((i: any) => i?.contentDetails?.videoId).filter(Boolean);
}

// 영상 id들 → 상세(snippet/stats/contentDetails/status), 50개씩. 임베드 가능만.
async function hydrate(ids: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,statistics,contentDetails,status");
    url.searchParams.set("id", ids.slice(i, i + 50).join(","));
    url.searchParams.set("key", KEY!);
    const res = await fetch(url.toString());
    const data = await res.json();
    if (res.ok && Array.isArray(data.items)) out.push(...data.items.filter(embeddable));
  }
  return out;
}

const views = (v: any) => Number(v.statistics?.viewCount ?? 0);

/* 🔥 급상승 점수 (2026-08-08 2차 수정)
   1차: 조회수 ÷ **평생 나이** → 14주 전 영상이 상단을 막던 건 고쳤지만,
        **옛날 영상이 지금 다시 터지는 경우**(재발견·밈화·관련 이슈)를 영영 못 잡는다(사장님 지적).
   2차: 30분마다 수집하므로 **직전 조회수와의 증가분**으로 매긴다 — 이게 진짜 '지금 오르는 중'.
     · 델타를 아는 영상 → (Δ조회수 ÷ Δ시간) × log10(조회수)  ← 옛 영상도 다시 뜨면 상위로
     · 처음 본 영상(델타 없음) → 평생 평균 속도로 대체(신규 급상승을 놓치지 않게)
   prevMap은 DB에 저장된 직전 수집치(youtube_hot.view_count/collected_at). */
const ageHours = (v: any) => {
  const t = Date.parse(v?.snippet?.publishedAt || "");
  if (!Number.isFinite(t)) return 24 * 30;                 // 게시일 불명 → 오래된 것으로 취급
  return Math.max(1, (Date.now() - t) / 3600000);
};
type Prev = { views: number; at: number };
let PREV = new Map<string, Prev>();                        // videoId → 직전 수집치
function velocityOf(v: any): number {
  const n = views(v);
  if (n <= 0) return 0;
  const p = PREV.get(v.id);
  if (p && p.views > 0) {
    const dh = Math.max(0.25, (Date.now() - p.at) / 3600000);   // 최소 15분
    const dv = n - p.views;
    if (dv >= 0) return dv / dh;                            // 시간당 증가 (음수=집계 정정이면 폴백)
  }
  return n / ageHours(v);                                   // 처음 본 영상 → 평생 평균
}
const hotScore = (v: any) => {
  const n = views(v);
  if (n <= 0) return 0;
  return velocityOf(v) * Math.log10(n + 10);
};
/* 🕰 나이 상한을 없앤다 — '옛날 영상의 재급상승'을 살리려면 나이로 자르면 안 된다.
   대신 델타 속도가 낮으면 자연스럽게 아래로 밀린다(코스팅 중인 옛 히트작은 알아서 탈락). */

Deno.serve(async (req) => {
  const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" } });
  if (!KEY) return json({ ok: false, error: "YOUTUBE_API_KEY 미설정" }, 500);

  /* 🌍 한 번 호출 = 한 언어. 크론이 열린 언어 수만큼 부른다(?locale=en).
     ⚠️ 수집 흐름(풀·카테고리·업서트)이 복잡해 한 요청에서 여러 지역을 돌리면 섞인다.
     ⚠️ 설정을 못 읽어도 KR로 돈다 — 한국 수집이 멈추는 게 제일 나쁘다. */
  try {
    const want = new URL(req.url).searchParams.get("locale") || "";
    const { data: tg } = await supa.rpc("collect_targets");
    if (Array.isArray(tg) && tg.length) {
      const hit = tg.find((t: any) => t.locale === want) || tg[0];
      LOCALE = String(hit.locale || "ko");
      REGION = String(hit.youtube_region || "KR");
    }
  } catch { /* 기본값 유지 */ }

  const now = new Date().toISOString();
  const pool = new Map<string, any>();          // 전체 풀(키워드 매칭용)
  const byCat = new Map<string, any[]>();       // 카테고리별 원본

  // 1) 전체 인기차트 (페이지네이션 — 50→최대 200)
  const allItems = await fetchChart(null, 200);
  allItems.forEach((v) => pool.set(v.id, v));

  // 2) 카테고리 차트 (각 최대 100)
  const cats = [...new Set(FEEDS.flatMap((f) => f.cats))];
  for (const c of cats) {
    const items = await fetchChart(c, 100);
    byCat.set(c, items);
    items.forEach((v) => pool.set(v.id, v));
  }

  // 2.5) 🌟 상위 유튜버 채널의 최신 업로드 — 급상승 차트에 안 걸리는 유명 크리에이터
  //      (빠니보틀·곽튜브·침착맨·슈카월드 등)까지 폭넓게. 업로드 재생목록=1유닛으로 저렴.
  const creatorFeed = new Map<string, string>();   // videoId → feed
  let resolvedNow = 0, harvested = 0;
  try {
    const { data: chans } = await supa.from("youtube_channels")
      .select("name,feed,channel_id,uploads_playlist,ok");
    const chanList = chans || [];
    // (a) 미해석 채널 해석(런당 최대 12개 — 검색 100유닛이라 여러 런에 분산). 결과는 캐시.
    // ⚡ 핸들(@)은 channels.list=1유닛이라 사실상 공짜 → 런당 상한을 넉넉히.
    //    이름 검색은 search.list=100유닛이라 12개로 계속 분산(쿼터 보호).
    let handleNow = 0;
    for (const c of chanList) {
      if (c.uploads_playlist || c.ok === false) continue;
      const isHandle = String(c.name || "").startsWith("@");
      if (isHandle) { if (handleNow >= 40) continue; handleNow++; }
      else { if (resolvedNow >= 12) continue; resolvedNow++; }
      const cid = await resolveChannelId(c.name);
      if (cid) {
        c.uploads_playlist = "UU" + cid.slice(2);   // 업로드 재생목록 = UC…→UU…
        await supa.from("youtube_channels")
          .update({ channel_id: cid, uploads_playlist: c.uploads_playlist, resolved_at: now, ok: true })
          .eq("name", c.name);
      } else {
        await supa.from("youtube_channels").update({ ok: false, resolved_at: now }).eq("name", c.name);
      }
    }
    // (b) 해석된 채널의 최신 업로드 id 수확
    const idFeed = new Map<string, string>();
    const creatorIds: string[] = [];
    for (const c of chanList) {
      if (!c.uploads_playlist) continue;
      const ids = await playlistRecent(c.uploads_playlist, 6);
      for (const id of ids) { if (!idFeed.has(id)) { idFeed.set(id, c.feed); creatorIds.push(id); } }
    }
    // (c) 상세 수화 + 임베드 필터 → 풀·피드맵 반영
    const vids = await hydrate([...new Set(creatorIds)]);
    for (const v of vids) { pool.set(v.id, v); creatorFeed.set(v.id, idFeed.get(v.id) || ""); }
    harvested = vids.length;
  } catch (_) { /* 크리에이터 수확 실패해도 차트 수집은 계속 */ }

  // 3) 쇼츠 판별 (세로 썸네일 존재 여부)
  const shorts = await markShorts(pool);

  // 4) 피드 조립
  const rows: any[] = [];
  const counts: Record<string, number> = {};

  // 전체(all) = 급상승 + 크리에이터 최신, 조회수 순 상위 150
  const allMerged = new Map<string, any>();
  allItems.forEach((v) => allMerged.set(v.id, v));
  // 🔥 크리에이터 최신 업로드는 '신선한 것만' 급상승에 섞는다 — 나이 제한이 없어 14주 전 영상이 올라왔었다
  for (const id of creatorFeed.keys()) {
    const v = pool.get(id);
    if (v) allMerged.set(id, v);   // 나이로 자르지 않는다 — 재급상승한 옛 영상도 후보에 둔다(점수가 판정)
  }
  /* 📈 직전 수집치 로드 — 점수를 매기기 전에 반드시 채운다(델타 = 지금 오르는 속도).
     같은 video_id가 여러 피드에 있을 수 있으나 조회수는 동일하니 가장 최근 것 하나만 쓴다. */
  {
    // .in()으로 수백 개 id를 넘기면 URL 길이 한계에 걸려 조용히 빈 결과가 온다 → 통째로 읽는다(~2천 행).
    const { data, error: perr } = await supa.from("youtube_hot")
      .select("video_id,view_count,collected_at").limit(5000);
    if (perr) console.warn("prev_load_failed", perr.message);
    for (const r of (data || [])) {
      const at = Date.parse(r.collected_at || "");
      if (!Number.isFinite(at)) continue;
      const cur = PREV.get(r.video_id);
      if (!cur || at > cur.at) PREV.set(r.video_id, { views: Number(r.view_count || 0), at });
    }
    console.log("prev_loaded", PREV.size);
  }

  const allSorted = [...allMerged.values()].sort((a, b) => hotScore(b) - hotScore(a)).slice(0, 150);
  allSorted.forEach((v, i) => rows.push(toRow(v, "all", i + 1, now, shorts)));
  counts["all"] = allSorted.length;

  /* 🎯 단일 배정 — 영상 하나당 피드 하나(중복 배정·잡탕 도배 제거).
     우선순위: ①크리에이터 채널이 명시한 피드 ②카테고리 차트 출처 ③키워드/카테고리 라우터 */
  const catOf = new Map<string, string>();      // videoId → 뽑혀온 카테고리
  for (const [c, items] of byCat) for (const v of items) if (!catOf.has(v.id)) catOf.set(v.id, c);

  const buckets = new Map<string, any[]>();
  FEEDS.forEach((f) => buckets.set(f.feed, []));
  for (const v of pool.values()) {
    const explicit = creatorFeed.get(v.id);                 // 채널 시드가 지정한 피드
    const feed = (explicit && buckets.has(explicit)) ? explicit : routeFeed(v, catOf.get(v.id) || null);
    (buckets.get(feed) || buckets.get("life"))!.push(v);
  }
  for (const f of FEEDS) {
    // 카테고리 탭도 같은 기준 — 오래됐지만 조회수 많은 영상이 상단을 막던 것 해소(나이 필터는 안 검, 편수 확보 우선)
    const listv = (buckets.get(f.feed) || []).sort((a, b) => hotScore(b) - hotScore(a));
    listv.forEach((v, i) => rows.push(toRow(v, f.feed, i + 1, now, shorts)));
    counts[f.feed] = listv.length;
  }

  if (!rows.length) return json({ ok: false, error: "youtube_api_failed" }, 502);

  const { error } = await supa
    .from("youtube_hot")
    .upsert(rows.map((r: any) => ({ ...r, locale: LOCALE })), { onConflict: "locale,feed,video_id" });
  if (error) return json({ ok: false, error: "upsert_failed", detail: error.message }, 500);

  // 이번 수집에 없던(=차트에서 내려간) 영상 정리
  await supa.from("youtube_hot").delete().lt("collected_at", now);

  return json({
    ok: true,
    total: rows.length,
    uniqueVideos: pool.size,
    shorts: shorts.size,
    creators: { harvested, resolvedThisRun: resolvedNow },
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
