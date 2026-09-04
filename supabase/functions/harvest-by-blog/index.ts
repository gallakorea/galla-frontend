// 설명에 상호도 주소도 안 쓰는 채널을 **블로그로 역추적**한다.
//
// 왜 필요한가: 또간집·골목식당·맛있는 녀석들은 진짜 맛집 프로인데 업로드 설명이 비어 있다
// (또간집 700편 중 611편이 설명 40자 미만). 공식 API 로는 회차에 나온 가게를 알 길이 없다.
// 그런데 **블로거들이 대신 적는다** — "또간집 통영편에 나온 ○○다찌" 같은 글이 회차마다 쌓인다.
//
// 왜 구글이 아니라 네이버인가:
//   · 구글 검색 결과 크롤링은 ToS 위반이다. 안 한다.
//   · 공식 Google Custom Search JSON API 는 하루 100건 무료다 — 8,773건에 못 쓴다.
//   · 네이버 블로그 검색은 공식 API 이고 하루 25,000건이며, 무엇보다 한국 맛집 글이 거기 있다.
//     이미 지역검색에 쓰는 키를 그대로 쓴다.
//
// 🔴 '누가 갔나'가 거짓말이 되면 이 서비스는 끝이다. 블로그는 부정확하니 두 겹으로 막는다:
//   ① 블로그에서 뽑은 상호는 **지역검색으로 존재를 확인**해야 한다(지금 수확과 같은 관문).
//   ② 영상 제목에서 얻은 **지역이 주소와 맞아야** 한다.
// 그래도 못 미더우면 안 넣는다. 빈손이 거짓말보다 낫다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const AI_KEY = Deno.env.get("DEEPSEEK_API_KEY") || "";
const AI_URL = "https://api.deepseek.com/chat/completions";
const AI_MODEL = "deepseek-chat";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

async function naver(kind: string, query: string, display = 10) {
  const u = new URL(`https://openapi.naver.com/v1/search/${kind}.json`);
  u.searchParams.set("query", query);
  u.searchParams.set("display", String(display));
  const r = await fetch(u, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
  if (!r.ok) throw new Error(`naver_${kind}_${r.status}:${(await r.text()).slice(0, 140)}`);
  return (await r.json())?.items || [];
}

const SYS = `너는 웹 검색 결과에서 **그 방송 회차에 실제로 나온 음식점 상호**만 골라낸다.

주는 것: 방송 이름, 영상 제목, 지역 힌트, 그리고 웹문서 제목·요약 여러 개.
낼 것: {"shops":[{"name":"상호","region":"시/군/구"}]}

■ 상호가 아닌 것 — 실측으로 이런 게 잘못 올라왔다. 전부 버려라.
  · 메뉴 이름: '돈까스' '송어회' '왕족발' '낙지철판볶음' '얼큰수제비만두'
    → 음식 이름만 있고 고유명사가 아니면 상호가 아니다.
  · 일반명사 조합: '통영 맛집' '다찌집' '노포' '현지인 맛집' '숨은 맛집'
  · 방송·채널·출연자 이름, 지역명 단독, 시장·거리 이름('양동시장' '포방터')

■ 상호의 조건 — 아래를 **모두** 만족해야 낸다.
  1) 간판에 그대로 적힐 고유명사다. 그 지역 다른 가게와 구별된다.
  2) 웹문서 **두 곳 이상**이 같은 이름을 말한다. 한 곳에만 나오면 버린다.
  3) 그 방송에 나왔다고 문서가 말한다. 단순히 그 동네 맛집이라 나온 이름은 버린다.
     ⚠️ 검색은 방송과 무관한 지역 맛집 글도 섞어 준다. 그게 가장 흔한 함정이다.

■ region 은 **지역 힌트와 같은 동네**여야 한다.
  힌트가 '성남'인데 울산 가게가 보이면 그건 다른 회차 얘기다 — 버린다.
  시/군/구 단위로 쓴다('분당' 같은 통칭도 괜찮다). 모르면 그 집을 통째로 버린다.

■ 해외는 제외한다.
■ 확신이 없으면 빈 배열을 낸다. **틀린 답보다 빈손이 낫다** —
  누가 어디 갔는지 틀리면 이 서비스는 통째로 거짓말이 된다.
■ 설명·인사·코드펜스 없이 JSON 만.`;

async function chatJson(sys: string, user: string): Promise<string | null> {
  if (!AI_KEY) return null;
  const r = await fetch(AI_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${AI_KEY}` },
    body: JSON.stringify({
      model: AI_MODEL, temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
    }),
  });
  if (!r.ok) return null;
  return (await r.json())?.choices?.[0]?.message?.content || null;
}

function isFood(cat: string) {
  return /음식점|카페|디저트|베이커리|술집|주점|한식|중식|일식|양식|분식/.test(cat || "");
}
function regionOk(hint: string, addr: string) {
  const toks = (hint || "").split(/\s+/).filter((t) => t.length >= 2);
  if (!toks.length) return false;
  return toks.some((t) => addr.includes(t.replace(/(특별시|광역시|특별자치시|특별자치도|시|군|구)$/, "")));
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!S_ID || !S_SEC) return j({ ok: false, reason: "no_naver_key" }, 500);

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || "";
  const n = Math.min(Number(url.searchParams.get("n") || "10"), 40);
  const dry = url.searchParams.get("dry") === "1";
  const t0 = Date.now();

  /* 🔎 질의 모양 시험 — 블로그 검색은 **질의가 짧아야** 맞는다.
     실측: 제목을 통째로 넣으면 0건이거나 음악 플레이리스트가 온다. */
  const probe = url.searchParams.get("probe");
  if (probe) {
    const its = await naver(url.searchParams.get("kind") || "blog", probe, 8);
    return j({ ok: true, q: probe, n: its.length,
               titles: its.map((b: any) => strip(b.title)).slice(0, 8) });
  }

  /* 🔴 harvest 플래그를 타지 않는다 — 이 길은 애초에 **수확을 끈 채널을 위한 것**이다.
     또간집·맛있는 녀석들은 설명이 비어 수확 큐에서 뺐지만 블로그로는 건질 수 있다.
     ⚠️ 그리고 **지역이 적힌 회차만** 고른다. 아무 영상이나 물으면 블로그 질의가 성립하지 않는다
        (실측: '또간집 조롱잔치' → 성경 주석·코인 뉴스. 8편 전부 0건). */
  const { data: vs, error: qerr } = await supa.rpc("food_videos_blog_targets",
    { p_channel: channel || null, p_limit: n });
  const list = (vs || []) as any[];
  /* 오류를 삼키면 '대상 없음'과 구별이 안 된다 — 실제로 그걸로 한 번 헤맸다 */
  if (qerr) return j({ ok: false, reason: String(qerr.message).slice(0, 200) }, 500);
  if (!list.length) return j({ ok: true, note: "대상 없음", channel });

  const { data: chan } = await supa.from("food_channels").select("slug,name").eq("slug", channel || list[0].channel).maybeSingle();
  const chName = chan?.name || "";

  const items: any[] = [], done: string[] = [], samples: any[] = [];
  let asked = 0, found = 0, verified = 0, together = 0;

  for (const v of list) {
    if (Date.now() - t0 > 110_000) break;          // 엣지 150초 — 시간 상자
    const title = String(v.title || "").replace(/#\S+/g, "").trim().slice(0, 60);
    let blogs: any[] = [];
    const rgHint = String(v.region || "").trim();
    /* 🔴 blog 가 아니라 webkr(웹문서)다. 실측 2026-09-04:
         blog  "또간집 노원 맛집" → 그냥 노원 맛집 글이 온다. 방송 이름이 결속되지 않는다.
                따옴표도 +연산자도 무시한다. 저걸 믿으면 엉뚱한 집을 또간집이 갔다고 박는다.
         webkr "또간집 노원 맛집" → "풍자의 '또간집' 서울 노원 상계역 맛집, 까르보돈까스…"
                방송 이름이 걸리고 상호가 그대로 나온다.
       그리고 **질의는 짧아야 한다** — 제목을 통째로 넣으면 0건이거나 음악 플레이리스트가 온다. */
    const q = `${chName} ${rgHint} 맛집`.replace(/\s+/g, " ").trim();
    try { blogs = await naver("webkr", q, 10); asked++; }
    catch (_) { break; }
    /* ⚠️ '○○ 모아보기'·위키 같은 집계물은 뺀다. 검색 결과를 읽어 상호를 알아내는 것과
       남이 정리해둔 목록을 통째로 가져오는 것은 다르다. 후자는 하지 않는다. */
    const usable = blogs.filter((b: any) =>
      !/모아보기|모음집|나무위키|namu\.wiki/i.test(strip(b.title)));
    if (samples.length < 8) samples.push({ q, blogs: usable.length,
      head: usable.slice(0, 3).map((b: any) => strip(b.title)) });
    if (usable.length < 3) { done.push(v.video_id); continue; }   // 근거가 얇으면 접는다

    const corpus = usable.map((b: any) => `- ${strip(b.title)} :: ${strip(b.description)}`).join("\n");
    let shops: any[] = [];
    try {
      const raw = await chatJson(SYS, `방송: ${chName}\n영상 제목: ${v.title}\n지역 힌트: ${rgHint}\n\n블로그 결과:\n${corpus}`);
      shops = raw ? (JSON.parse(raw)?.shops || []) : [];
    } catch (_) { shops = []; }
    found += shops.length;
    if (samples.length) samples[samples.length - 1].shops = shops;

    /* 🔴 AI 말만 믿으면 안 된다. 실측 2026-09-04:
         '서촌' 편(EP.87)에 박힌 지역이 **남양주**였다(설명·태그에서 잘못 잡혔다).
         그래서 질의가 '또간집 남양주 맛집'이 되고, 돌아온 건 그냥 남양주 맛집 글이었다.
         그 집들은 실제로 존재하니 지역검색 관문도 통과해버린다 —
         **힌트가 틀리면 검증이 통째로 무력해진다.** 남양주 가게 3곳이 또간집에 다녀간 걸로 박혔다.
       → 기계적으로 한 번 더 막는다: 어떤 문서 하나가 **방송 이름과 그 상호를 같이** 말해야 한다.
         '그 동네 맛집이라 나온 이름'은 여기서 전부 죽는다. */
    const docs = usable.map((b: any) => (strip(b.title) + " " + strip(b.description)).replace(/\s/g, ""));
    const chKey = chName.replace(/\s/g, "");
    for (const s of shops.slice(0, 3)) {
      const nm = String(s?.name || "").trim(), rg = String(s?.region || "").trim();
      if (nm.length < 2 || rg.length < 2) continue;
      const nmKey = nm.replace(/\s/g, "");
      if (!docs.some((t) => t.includes(chKey) && t.includes(nmKey))) { together++; continue; }
      let hit: any = null; let loc: any[] = [];
      try {
        loc = await naver("local", `${rg} ${nm}`, 5);
        const norm = (x: string) => x.replace(/\s/g, "").toLowerCase();
        hit = loc.find((it: any) => {
          const t = norm(strip(it.title));
          if (t !== norm(nm) && !t.startsWith(norm(nm))) return false;
          if (!isFood(strip(it.category))) return false;
          const a = strip(it.roadAddress) || strip(it.address);
          return !!a && regionOk(rg, a);
        });
      } catch (_) { break; }
      if (!hit) {
        if (samples.length) {
          const sm = samples[samples.length - 1];
          (sm.miss = sm.miss || []).push({ nm, rg,
            got: loc.slice(0, 3).map((it: any) =>
              `${strip(it.title)}|${(strip(it.category).split(">").pop() || "").trim()}|${(strip(it.roadAddress) || strip(it.address)).slice(0, 30)}`) });
        }
        continue;
      }
      verified++;
      const mx = Number(hit.mapx), my = Number(hit.mapy);
      items.push({
        name: strip(hit.title) || nm,
        address: strip(hit.roadAddress) || strip(hit.address) || "",
        category: (strip(hit.category).split(">").pop() || "").trim() || null,
        phone: strip(hit.telephone) || null,
        lat: mx > 1000 ? String(my / 1e7) : null,
        lon: mx > 1000 ? String(mx / 1e7) : null,
        channel: v.channel, video_id: v.video_id,
        video_title: String(v.title || "").slice(0, 200), aired_at: v.published_at,
      });
    }
    done.push(v.video_id);
  }

  if (dry) return j({ ok: true, dry: true, picked: list.length, asked, found, 같이안나옴: together, verified, samples });

  let res: any = {};
  if (items.length) {
    const { data, error } = await supa.rpc("food_ingest", { p_items: items });
    if (error) return j({ ok: false, reason: String(error.message).slice(0, 200) }, 500);
    res = data || {};
  }
  for (let i = 0; i < done.length; i += 200) {
    await supa.rpc("food_videos_mark_harvested", { p_ids: done.slice(i, i + 200) });
  }
  return j({ ok: true, channel, picked: list.length, asked, found, 같이안나옴: together, verified, ...res });
});
