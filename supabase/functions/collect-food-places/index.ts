// 맛집 수집 — 등록된 방송·유튜브 채널의 새 영상에서 상호·주소를 뽑아 지도에 꽂는다.
//
// 🚫 남의 사이트를 긁지 않는다. 원본(YouTube Data API)에서 직접 읽는다.
//    맛집 지도 서비스들도 결국 이 영상들을 보고 손으로 옮겨 적은 것이다 — 그 과정을 자동화한다.
//
// 💰 유튜브 쿼터가 이 함수의 진짜 제약이다 (일 10,000유닛).
//    · search.list        = 100유닛 → 채널 ID 확정에 **딱 한 번**만 쓰고 DB에 캐시한다.
//    · playlistItems.list =   1유닛 → 이후 새 영상은 업로드 플레이리스트로 훑는다(50편/1유닛).
//    채널 10개를 매일 돌려도 첫날 1,000유닛, 이후 하루 20유닛 남짓이다.
//
// 🔑 필요한 시크릿
//    YOUTUBE_API_KEY   (필수)
//    DEEPSEEK_API_KEY  (필수 — 제목·설명에서 상호/주소를 뽑는다)
//    NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
//                      (권장 — NCP Geocoding 월 300만건 무료. 지도(Dynamic Map)와 같은 계정이라
//                       키 하나로 지도+지오코딩이 동시에 해결된다)
//    KAKAO_REST_KEY    (대안. 없으면 Nominatim 으로 떨어지는데 초당 1회 정책이라 느리고
//                       한국 지번주소 적중률이 낮다 — 실측 66건 중 30건 실패)
//    CRON_SECRET       (크론 인증)
//
// ⚠️ 크론에 Authorization 헤더를 빼면 401 인데 pg_cron 이력엔 'succeeded' 로 남는다.
//    조용히 아무것도 안 하는 상태가 된다 — 갈비스 크론 4개가 실제로 이 상태였다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const YT = Deno.env.get("YOUTUBE_API_KEY") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
const KAKAO = Deno.env.get("KAKAO_REST_KEY") || "";
/* 네이버 클라우드 Geocoding — 월 300만건 무료(2026-08 요금표 확인).
   지도(Dynamic Map 월 600만건 무료)와 **같은 NCP 계정**이라 키 하나로 둘 다 해결된다. */
const NCP_ID = Deno.env.get("NAVER_CLIENT_ID") || "";
const NCP_SECRET = Deno.env.get("NAVER_CLIENT_SECRET") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";
/* 🔴 예비 공급자 — DeepSeek 잔액이 마르면(402) 추출이 통째로 0건이 되는데, 로그를 안 보면
   '수집할 게 없었다'와 구분이 안 된다(실측 2026-08-31). 키가 이미 있는 Gemini 로 넘어간다. */
const GEM = Deno.env.get("GEMINI_API_KEY") || "";

let lastAiNote = "";   // 마지막 AI 호출 상태 — 조용한 실패를 리포트에 드러낸다
let dsDead = false;
const AIERR = (m: string) => { lastAiNote = m; console.error(m); };
/* 모델 이름을 박아두면 구글이 단종시키는 날 조용히 404 로 죽는다
   (실측 2026-08-31: gemini-2.5-flash → "no longer available to new users").
   목록에서 generateContent 를 지원하는 flash 계열을 골라 캐시한다. */
let gemPick: string | null = null;
async function gemModel(): Promise<string | null> {
  if (gemPick) return gemPick;
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEM}&pageSize=200`);
    if (!r.ok) { AIERR(`gemini_models ${r.status}:${(await r.text()).slice(0, 100)}`); return null; }
    const ms = ((await r.json())?.models || []) as any[];
    const ok = ms.filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
                 .map((m) => String(m.name || "").replace(/^models\//, ""))
                 .filter((n) => !/embedding|aqa|image|tts|vision|live|native-audio/i.test(n));
    /* 싸고 빠른 flash 우선, 없으면 아무거나 */
    gemPick = ok.find((n) => /flash/.test(n) && !/lite/.test(n)) || ok.find((n) => /flash/.test(n)) || ok[0] || null;
    if (!gemPick) AIERR("gemini_no_model");
    return gemPick;
  } catch (e) { AIERR("gemini_models " + String(e).slice(0, 100)); return null; }
}



async function chatJson(sys: string, user: string): Promise<string | null> {
  if (DS && !dsDead) {
    const r = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
    const body = (await r.text()).slice(0, 200);
    if (r.status === 402 || r.status === 401) dsDead = true;
    lastAiNote = `deepseek_${r.status}: ${body}`;
    console.error("deepseek", r.status, body);
  }
  if (!GEM) return null;
  const model = await gemModel();
  if (!model) return null;
  const g = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEM}`,
    { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sys }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }) });
  if (!g.ok) {
    const body = (await g.text()).slice(0, 200);
    lastAiNote = `gemini_${g.status}: ${body}`;
    console.error("gemini", g.status, body);
    return null;
  }
  const d = await g.json();
  return d?.candidates?.[0]?.content?.parts?.map((x: any) => x.text).join("") || null;
}

type Chan = {
  slug: string; name: string; kind: string;
  yt_channel_id: string | null; yt_query: string | null;
  yt_title_re: string | null;      // 제작사 채널에서 해당 프로그램만 걸러낸다
  thumb: string | null;            // 채널 아바타 — 지도 마커에 띄운다
  last_video_at: string | null;
};
type MenuItem = { name: string; price?: string };
type Hit = {
  name: string; address: string; region_hint?: string; category?: string;
  menus?: MenuItem[];   // 영상 본문에 가격이 적혀 있을 때만 (먹방 채널은 자주 적는다)
  channel: string; video_id: string; video_title: string; aired_at: string;
  lat?: number; lon?: number; phone?: string;
};

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function ytGet(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  u.searchParams.set("key", YT);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`yt ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

/* 채널 ID 확정 — 100유닛짜리라 한 번만 부르고 DB에 박는다.
   ⚠️ 손으로 UC... 를 적어 넣지 않는다. 틀린 채널을 긁어도 아무도 눈치채지 못한다.

   그런데 '한 번만'이 지켜지지 않았다. 미해소 채널을 매 실행 처음부터 다시 시도해서
   쿼터가 마르면 **앞쪽 몇 개에서만 낭비하고 뒤쪽은 순서가 영영 안 왔다**
   (실측 2026-08-31: 42개 중 21개가 null 인 채로 정체). 그래서
   ① 실행당 예산(resolveBudget)을 두고 ② 오래 안 해본 것부터 돌리고
   ③ 쿼터 에러가 나면 그 실행의 해소는 즉시 접는다.

   그리고 top1 을 그대로 믿지 않는다 — '수요미식회' 같은 종영 프로그램은 공식 채널이
   없어서 엉뚱한 채널이 1등으로 올라온다. 제목이 우리 이름과 겹칠 때만 박는다. */
let quotaDead = false;

function titleMatches(want: string, got: string) {
  const n = (x: string) => x.replace(/[\s·・,'"“”‘’\-–—]/g, "").toLowerCase();
  const a = n(want), b = n(got);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  /* 2글자 이상 토큰이 하나라도 겹치면 인정 — '백종원의 3대 천왕' vs '백종원' */
  const toks = want.split(/\s+/).map(n).filter((t) => t.length >= 2);
  return toks.some((t) => b.includes(t));
}

async function resolveChannel(c: Chan, budget: { left: number }): Promise<string | null> {
  if (c.yt_channel_id) return c.yt_channel_id;
  if (!c.yt_query || quotaDead || budget.left <= 0) return null;
  budget.left--;
  await supa.from("food_channels").update({ resolve_tried_at: new Date().toISOString() }).eq("slug", c.slug);
  let d: any;
  try {
    d = await ytGet("search", {
      part: "snippet", type: "channel", q: c.yt_query, maxResults: "5", regionCode: "KR",
    });
  } catch (e) {
    if (/\b403\b|quota/i.test(String(e))) quotaDead = true;
    throw e;
  }
  const hit = (d?.items || []).find((it: any) =>
    titleMatches(c.name, it?.snippet?.channelTitle || it?.snippet?.title || ""));
  const id = hit?.snippet?.channelId || hit?.id?.channelId || null;
  if (id) await supa.from("food_channels").update({ yt_channel_id: id }).eq("slug", c.slug);
  return id;
}

/* ⚠️ 제작사 채널(스튜디오 수제 등)은 여러 프로그램과 쇼츠를 같이 올린다.
   '최신 N편'만 보면 무관한 쇼츠만 걸려 추출이 0건이 된다(실측: 또간집 8편 전부 쇼츠).
   → yt_title_re 가 있으면 제목으로 그 프로그램만 남긴다.
   playlistItems 는 50편에 1유닛이라 넓게 훑어도 쿼터 부담이 없다. */
/* 채널 아바타 — 지도 마커에 방송 로고를 띄우려면 필요하다.
   ⚠️ 이미지를 우리 서버에 재호스팅하지 않는다. 방송사·유튜버 로고를 복제 저장하면
      상표·저작권 문제가 생긴다. YouTube 가 주는 CDN URL 을 그대로 참조한다(표준 귀속 방식).
      CSP 는 img-src 에 https: 를 허용하고 있어 그대로 뜬다.
   channels.list 는 1유닛이라 비용이 사실상 없다. 이미 있으면 건너뛴다. */
async function fetchThumb(c: Chan): Promise<string | null> {
  if (c.thumb || !c.yt_channel_id) return c.thumb;
  try {
    const d = await ytGet("channels", { part: "snippet", id: c.yt_channel_id });
    const t = d?.items?.[0]?.snippet?.thumbnails;
    const url = t?.medium?.url || t?.default?.url || t?.high?.url || null;
    if (url) await supa.from("food_channels").update({ thumb: url }).eq("slug", c.slug);
    return url;
  } catch (e) { console.error("thumb", c.slug, String(e)); return null; }
}

async function recentVideos(chanId: string, since: string | null, cap = 50, titleRe: string | null = null) {
  let re: RegExp | null = null;
  if (titleRe) { try { re = new RegExp(titleRe, "i"); } catch { re = null; } }
  // 업로드 플레이리스트 ID = 채널 ID의 두 번째 글자를 U 로 (UC... → UU...)
  const uploads = "UU" + chanId.slice(2);
  const d = await ytGet("playlistItems", {
    part: "snippet", playlistId: uploads, maxResults: String(Math.min(cap, 50)),
  });
  const out: { id: string; title: string; desc: string; at: string }[] = [];
  for (const it of d?.items || []) {
    const s = it.snippet || {};
    const at = s.publishedAt as string;
    if (since && at && at <= since) continue;          // 이미 읽은 구간
    if (re && !re.test(s.title || "")) continue;       // 이 프로그램 편이 아니다
    out.push({
      id: s.resourceId?.videoId, title: s.title || "",
      /* ⚠️ 900자로 자르고 있었다. 먹방 채널은 설명 뒷부분에 가게 목록을 다는 일이 많아
         잘린 뒤쪽을 통째로 못 보고 있었다. 토큰이 좀 더 들어도 앞을 다 본다. */
      desc: (s.description || "").slice(0, 4000),
      at,
    });
  }
  return out.filter((v) => v.id);
}

/* 인기 댓글 — 공식 commentThreads.list(1유닛). 자막은 소유자 인증이 필요해 못 받지만,
   댓글은 공식 창구다. 한국 먹방 채널은 상호·주소를 고정 댓글에 다는 일이 흔하다.
   ⚠️ 댓글이 꺼진 영상은 403 이 온다 — 정상이므로 조용히 넘어간다. */
async function topComments(videoId: string): Promise<string> {
  try {
    const d = await ytGet("commentThreads", {
      part: "snippet", videoId, order: "relevance", maxResults: "5", textFormat: "plainText",
    });
    const t = (d?.items || [])
      .map((it: any) => it?.snippet?.topLevelComment?.snippet?.textDisplay || "")
      .filter(Boolean).join("\n").slice(0, 1500);
    return t;
  } catch (_) { return ""; }
}

/* 제목·설명 → 상호/주소. 한 영상에 여러 집이 나오는 경우가 많다(먹방 투어).
   ⚠️ 모델이 지어내는 게 제일 무섭다 — "설명에 없으면 비워라"를 계속 못박는다.
      주소가 없으면 지오코딩이 어차피 실패하므로 버린다. */
async function extract(vids: { id: string; title: string; desc: string; at: string; cmt?: string }[], ch: string): Promise<Hit[]> {
  lastAiNote = "";
  if (!vids.length) { lastAiNote = "no_videos"; return []; }
  if (!DS) { lastAiNote = "no_ai_key"; return []; }
  const payload = vids.map((v, i) =>
    `[${i}] 제목: ${v.title}\n설명: ${v.desc}` + (v.cmt ? `\n댓글: ${v.cmt}` : "")
  ).join("\n---\n");
  /* ⚠️ 예전 규칙은 "주소 없으면 버려라" 였다 — 실측 결과 또간집 6편에서 0건이 나왔다.
     유튜브 설명에는 상호명만 있고 주소가 거의 없다. 버리면 쿼터만 태우고 남는 게 없다.
     → 주소가 있으면 좌표까지 확정하고, 없으면 상호 + 지역힌트만 받아 대기열에 쌓는다. */
  const sys =
    "너는 한국 음식 방송 영상의 제목과 설명에서 '식당 정보'만 뽑는 추출기다.\n" +
    "규칙:\n" +
    "1. 반드시 주어진 텍스트에 실제로 적힌 것만 뽑는다. 없는 상호·주소를 절대 지어내지 마라.\n" +
    "2. 상호(name)는 필수다. 없으면 그 항목은 버린다.\n" +
    "3. address 는 전체 주소가 적혀 있을 때만 채운다. 없으면 빈 문자열로 둔다(추측 금지).\n" +
    "4. region_hint 는 텍스트에 드러난 지역만 적는다(예: '서울 중구', '부산', '제주'). 없으면 빈 문자열.\n" +
    "5. 상호는 간판 이름만. '맛집', '편', 'EP.', 회차 번호 같은 수식은 제거한다.\n" +
    "6. 식당이 아닌 것(채널명, 협찬사, 유튜버 이름)은 넣지 마라.\n" +
    "7. category 는 한식/중식/일식/양식/분식/카페/술집/기타 중 하나. 모르면 빈 문자열.\n" +
    "8. menus: 본문에 **메뉴명과 가격이 실제로 적혀 있을 때만** 뽑는다(예: '길거리 토스트 2천원').\n" +
    "   가격이 없으면 menus 는 빈 배열로 둔다. 가격을 절대 추측하지 마라 — 틀린 가격은 없는 것만 못하다.\n" +
    "   price 는 숫자만(2천원→2000, 1,700원→1700).\n" +
    '9. 출력은 JSON 만: {"items":[{"i":0,"name":"","address":"","region_hint":"","category":"","menus":[{"name":"","price":""}]}]}\n' +
    "10. 뽑을 게 없으면 {\"items\":[]} 를 출력한다. 억지로 채우지 마라.";
  const txt = (await chatJson(sys, payload)) || "{}";
  let parsed: any = {};
  try { parsed = JSON.parse(txt); }
  catch { lastAiNote = "ai_bad_json: " + txt.slice(0, 160); return []; }
  lastAiNote = `ai_ok items=${(parsed.items || []).length}`;
  const out: Hit[] = [];
  for (const it of parsed.items || []) {
    const v = vids[Number(it.i)];
    const nm = String(it.name || "").trim();
    if (!v || nm.length < 2) continue;
    const addr = String(it.address || "").trim();
    out.push({
      name: nm,
      // 6자 미만은 주소가 아니다("서울" 같은 것) → 지역힌트로 강등
      address: addr.length >= 6 ? addr : "",
      region_hint: String(it.region_hint || "").trim() || (addr.length < 6 ? addr : ""),
      category: it.category || undefined,
      menus: Array.isArray(it.menus)
        ? it.menus.filter((m: any) => m && m.name && String(m.price || "").match(/\d/))
                  .slice(0, 20)
                  .map((m: any) => ({ name: String(m.name).trim(), price: String(m.price) }))
        : undefined,
      channel: ch, video_id: v.id, video_title: v.title, aired_at: v.at,
    });
  }
  return out;
}

/* 지오코딩 — 좌표가 없으면 지도에 점이 안 찍힌다.
   우선순위: 네이버(NCP) → 카카오 → Nominatim.
   ⚠️ Nominatim 은 한국 **지번주소**에 약하다 — 실측 66건 중 30건이 좌표를 못 얻었다.
      네이버·카카오는 지번/도로명 둘 다 잘 잡는다. 둘 다 없을 때만 Nominatim 으로 떨어진다. */
async function geocode(h: Hit): Promise<Hit> {
  try {
    if (NCP_ID && NCP_SECRET) {
      const u = new URL("https://maps.apigw.ntruss.com/map-geocode/v2/geocode");
      u.searchParams.set("query", h.address);
      const r = await fetch(u, {
        headers: {
          "x-ncp-apigw-api-key-id": NCP_ID,
          "x-ncp-apigw-api-key": NCP_SECRET,
          "Accept": "application/json",
        },
      });
      if (r.ok) {
        const d = await r.json();
        const a = d?.addresses?.[0];
        if (a) {
          h.lat = Number(a.y); h.lon = Number(a.x);
          if (a.roadAddress || a.jibunAddress) h.address = a.roadAddress || a.jibunAddress;
          return h;
        }
        return h;   // 키는 살아있는데 못 찾은 것 — 아래로 안 내려간다(중복 호출 방지)
      }
      console.error("ncp geocode", r.status, (await r.text()).slice(0, 160));
    }
    if (KAKAO) {
      const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
      u.searchParams.set("query", `${h.name} ${h.address}`);
      u.searchParams.set("size", "1");
      const r = await fetch(u, { headers: { Authorization: `KakaoAK ${KAKAO}` } });
      if (r.ok) {
        const d = await r.json();
        const p = d?.documents?.[0];
        if (p) {
          h.lat = Number(p.y); h.lon = Number(p.x);
          h.phone = p.phone || undefined;
          // 카카오가 준 정식 주소로 교체 — 지역 매칭(food_region_of)이 훨씬 정확해진다
          if (p.road_address_name || p.address_name) h.address = p.road_address_name || p.address_name;
        }
        return h;
      }
    }
    const u = new URL("https://nominatim.openstreetmap.org/search");
    u.searchParams.set("q", h.address); u.searchParams.set("format", "json");
    u.searchParams.set("limit", "1"); u.searchParams.set("countrycodes", "kr");
    const r = await fetch(u, { headers: { "User-Agent": "galla.im/1.0 (food map)" } });
    if (r.ok) {
      const d = await r.json();
      if (d?.[0]) { h.lat = Number(d[0].lat); h.lon = Number(d[0].lon); }
    }
    await new Promise((s) => setTimeout(s, 1100));       // ⚠️ Nominatim 정책: 초당 1회
  } catch (e) { console.error("geocode", h.name, String(e)); }
  return h;
}

Deno.serve(async (req) => {
  /* 🔑 이 코드베이스의 크론 규약은 `x-cron-secret` 헤더다(vault.decrypted_secrets 의 'cron_secret').
     Authorization 만 보면 집안 규약대로 건 크론이 전부 401 인데, pg_cron 이력엔 'succeeded' 로
     남아 **조용히 아무것도 안 하는 상태**가 된다 — 갈비스 크론 4개가 실제로 그랬다. 둘 다 받는다. */
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!YT) return j({ ok: false, reason: "no_youtube_key" }, 500);
  if (!DS) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const only = url.searchParams.get("channel");         // 한 채널만 돌려보는 수동 실행용
  const perCh = Number(url.searchParams.get("cap") || "50");
  const useComments = url.searchParams.get("comments") === "1";   // 50편 = 1유닛. 넓게 훑고 제목으로 거른다.

  /* 해소 예산 — search.list 100유닛 × N. 기본 3개(300유닛)면 하루 쿼터를 해치지 않는다. */
  const budget = { left: Number(url.searchParams.get("resolve") || "3") };

  /* 🔴 엣지 함수는 유휴 150초에서 끊긴다(실측 2026-08-31: 57채널 한 바퀴 → IDLE_TIMEOUT 504).
     끊기면 그 실행이 통째로 날아가는데 pg_cron 이력엔 아무 표시가 안 남는다 —
     하루 두 번 도는 수집 크론이 계속 반쯤 잘리고 있었다.
     → 한 실행에 도는 채널 수를 묶고, 가장 오래 안 훑은 것부터 회전시킨다. */
  const rotN = Number(url.searchParams.get("n") || "8");
  const { data: chans } = await supa.from("food_channels")
    .select("slug,name,kind,yt_channel_id,yt_query,yt_title_re,thumb,last_video_at")
    .eq("active", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(only ? 200 : rotN);
  /* 미해소 채널은 '오래 안 해본 것' 순으로 돌린다 — sort 순으로 두면 앞쪽만 계속 시도한다. */
  const { data: pend } = await supa.from("food_channels")
    .select("slug").eq("active", true).is("yt_channel_id", null)
    .order("resolve_tried_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(budget.left, 1));
  const resolveSet = new Set((pend || []).map((r: any) => r.slug));

  const report: any[] = [];
  let newTotal = 0, dupTotal = 0, stagedTotal = 0;

  for (const c of (chans || []) as Chan[]) {
    if (only && c.slug !== only) continue;
    /* ⚠️ 슬롯을 쓴 채널은 결과와 무관하게 도장을 찍는다.
       예전엔 영상을 찾았을 때만 last_synced_at 을 갱신해서, 실패하는 채널이
       **큐 맨 앞에 영원히 남아** 매 실행 슬롯을 다 먹었다(디스커버리에서 겪은 것과 같은 함정). */
    await supa.from("food_channels")
      .update({ last_synced_at: new Date().toISOString() }).eq("slug", c.slug);
    try {
      if (!c.yt_channel_id && !only && !resolveSet.has(c.slug)) {
        report.push({ ch: c.slug, err: "resolve_queued" }); continue;   // 다음 실행 차례
      }
      const id = await resolveChannel(c, budget);
      if (!id) { report.push({ ch: c.slug, err: quotaDead ? "yt_quota" : "no_channel_id" }); continue; }
      c.yt_channel_id = id;
      await fetchThumb(c);          // 마커용 채널 로고 (없을 때만 1유닛)

      const vids = await recentVideos(id, c.last_video_at, perCh, c.yt_title_re);
      if (!vids.length) { report.push({ ch: c.slug, videos: 0 }); continue; }

      let hits = await extract(vids, c.slug);
      /* 🧪 실측 결과(2026-08-31): 댓글을 붙여도 0건이었다.
         쯔양 50편·츄더 50편·또리네 50편·홍유 50편·맛있는녀석들 40편 → 전부 0.
         이 채널들은 제목·설명·댓글 어디에도 상호를 쓰지 않는다. 정보가 영상 안에만 있다.
         효과가 없는데 실행당 180유닛을 먹으므로 기본은 끈다(?comments=1 로 재시험 가능).
         ⚠️ 자막은 공식 경로가 없다 — captions.download 는 **영상 소유자 인증**을 요구한다.
            비공식 timedtext·yt-dlp 는 YouTube 약관이 금지하는 접근이라 쓰지 않는다. */
      if (useComments && !hits.length && vids.length) {
        const sub = vids.slice(0, 12);
        for (const v of sub) (v as any).cmt = await topComments(v.id);
        if (sub.some((v: any) => v.cmt)) hits = await extract(sub, c.slug);
      }
      /* 주소가 있는 건만 좌표를 확정해 바로 지도에 올린다.
         주소가 없는 건(대다수)은 버리지 않고 food_pending 에 쌓아둔다 —
         장소검색 키가 생기면 일괄 승격한다. 키를 기다리는 동안에도 자산이 쌓인다. */
      const withAddr = hits.filter((h) => h.address);
      const noAddr = hits.filter((h) => !h.address);

      const geo: Hit[] = [];
      for (const h of withAddr) geo.push(await geocode(h));

      let res: any = { new: 0, dup: 0 };
      if (geo.length) {
        const { data } = await supa.rpc("food_ingest", { p_items: geo });
        res = data || res;
      }
      /* 가격이 적혀 있던 건만 메뉴를 붙인다. food_ingest 는 id 를 돌려주지 않으므로
         이름으로 되찾는다(같은 배치에서 방금 넣은 것이라 안전하다). */
      let menuAdded = 0;
      for (const h of geo) {
        if (!h.menus || !h.menus.length) continue;
        const { data: rows } = await supa.from("food_places").select("id")
          .eq("name", h.name).limit(1);
        const pid = rows && rows[0] && rows[0].id;
        if (!pid) continue;
        const { data: mr } = await supa.rpc("food_menu_ingest", { p_id: pid, p_items: h.menus });
        menuAdded += (mr && mr.added) || 0;
      }
      let staged = 0;
      if (noAddr.length) {
        const { data } = await supa.rpc("food_stage", { p_items: noAddr });
        staged = (data && data.staged) || 0;
      }
      stagedTotal += staged;
      newTotal += res.new || 0; dupTotal += res.dup || 0;

      // 여기까지 읽었다 — 다음 실행은 이 지점부터
      // ⚠️ 필터를 통과한 영상 기준으로만 워터마크를 민다. 필터에 걸린 영상 시각으로 밀면
      //    아직 안 읽은 그 프로그램 편들을 영영 건너뛴다.
      const newest = vids.map((v) => v.at).sort().pop();
      await supa.from("food_channels")
        .update({ last_video_at: newest || c.last_video_at, last_synced_at: new Date().toISOString() })
        .eq("slug", c.slug);

      report.push({ ch: c.slug, videos: vids.length, found: hits.length,
                    geo: geo.filter(g => g.lat).length, staged, menus: menuAdded, ai: lastAiNote,
                    sample: vids.slice(0, 3).map((v) => v.title.slice(0, 60)), ...res });
    } catch (e) {
      report.push({ ch: c.slug, err: String(e).slice(0, 180) });
    }
  }

  return j({ ok: true, new: newTotal, dup: dupTotal, staged: stagedTotal,
             geocoder: (NCP_ID && NCP_SECRET) ? "naver" : KAKAO ? "kakao" : "nominatim", report });
});
