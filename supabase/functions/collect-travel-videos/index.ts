// 여행 크리에이터의 영상 원장을 채운다 — 장소 수확의 연료.
//
// 맛집이 뒤늦게 배운 것을 여행은 처음부터 한다: **영상이 먼저고 장소가 나중이다.**
// 여기서는 영상만 모은다. 장소를 뽑는 건 harvest-travel-places 의 몫이다.
//
// 💰 유튜브 쿼터가 이 함수의 진짜 제약이다(일 10,000유닛, 핫튜브·맛집이 이미 6~7천을 쓴다).
//    · playlistItems.list = 1유닛 / 50편  ← 평상시 경로. 40채널을 매일 돌려도 100유닛 남짓.
//    · channels.list?forHandle = 1유닛     ← 핸들을 아는 채널의 ID 해석
//    · search.list = 100유닛               ← 이름만 아는 채널. **회차당 1개**로 묶는다.
//      (묶지 않으면 이름만 있는 채널 10개가 그날 쿼터 1,000유닛을 한 번에 먹는다)
//
// ⚠️ 크론에 Authorization/x-cron-secret 을 빼면 401 인데 pg_cron 이력엔 'succeeded' 로 남는다.
//    조용히 아무것도 안 하는 상태가 된다 — 갈비스 크론 4개가 실제로 그랬다.
// ⚠️ 엣지 유휴 150초. 한 회차 채널 수를 묶고 자주 돈다. 죽으면 그 실행은 통째로 날아가고
//    pg_cron 이력엔 아무 표시가 없다(맛집 수집기가 57채널 한 바퀴를 돌려다 그렇게 죽었다).
// ⚠️ 도장(last_synced_at)은 성공 여부와 무관하게 찍는다. 실패한 채널이 큐 맨 앞에
//    영원히 남아 나머지를 굶기는 게 맛집에서 실제로 벌어진 일이다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ytFetch, ytKeyCount } from "../_shared/ytkey.ts";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const YT = Deno.env.get("YOUTUBE_API_KEY") || "";
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

/* 유튜브 제목·설명에 U+0000 이 섞여 들어오면 Postgres 가 upsert 를 통째로 깨뜨린다
   ("unsupported Unicode escape sequence"). 핫튜브 수집기가 같은 이유로 한 번 죽었다. */
/* Postgres 가 삼키지 못하는 문자를 걷어낸다.
   ⚠️ U+0000 만 지우던 게 부족했다 — Mark Wiens 1,633편이 통째로 안 들어왔다
      ("invalid input syntax for type json"). 이모지가 많은 채널에서 **짝 없는 서러게이트**
      (\uD800-\uDFFF 가 홀로 남은 것)가 섞이면 JSON 인코딩 자체가 깨진다.
   ⚠️ 제어문자도 같이 턴다. 보이지도 않는 문자 하나에 100편 묶음이 통째로 날아간다. */
const sane = (s: string) => String(s || "")
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
  .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, "")   // 뒤가 없는 상위 서러게이트
  .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "")  // 앞이 없는 하위 서러게이트
  .trim();

async function ytGet(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await ytFetch(u);
  if (!r.ok) throw new Error(`yt ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json();
}

const normName = (s: string) =>
  String(s || "").toLowerCase().replace(/[\s_\-·・.,'"()\[\]]/g, "");

/* 이름 대조는 **한글과 영문을 따로** 본다.
   ⚠️ 통짜로 비교하면 어순만 달라도 떨어진다 —
      우리 '고고몽GoGoMong' vs 실제 'GoGoMong 고고몽' 이 서로 포함이 아니게 된다(실측).
      한쪽 언어라도 확실히 겹치면 같은 채널로 본다. 남의 채널이 통과할 위험은
      '3글자 이상 겹침'으로 막는다. */
function sameChannelName(title: string, want: string) {
  const A = normName(title), B = normName(want);
  if (!A || !B) return false;
  if (A === B || A.includes(B) || B.includes(A)) return true;
  const han = (x: string) => (x.match(/[가-힣]+/g) || []).join("");
  const lat = (x: string) => (x.match(/[a-z0-9]+/g) || []).join("");
  const pair = (a: string, b: string) =>
    a.length >= 3 && b.length >= 3 && (a === b || a.includes(b) || b.includes(a));
  return pair(han(A), han(B)) || pair(lat(A), lat(B));
}

/* 채널 ID 해석 — 비용이 100배 차이 나는 두 길이 있다.
     channels.list?forHandle = 1유닛 / search.list = 100유닛
   💡 한국 크리에이터는 **한글 핸들이 채널명과 같은 경우가 많다**(@곽튜브, @서재로36).
      그래서 이름에서 핸들 후보를 만들어 1유닛짜리로 먼저 두드린다. 66채널을 전부
      search 로 뚫으면 6,600유닛 — 그날 핫튜브가 멈춘다.
   ⚠️ 핸들이 우연히 남의 채널일 수 있다. 받아온 채널명이 우리가 찾던 이름과
      서로 포함 관계가 아니면 버린다(1유닛 손해로 끝난다). */
function handleCandidates(name: string) {
  const out: string[] = [];
  const base = String(name || "").trim();
  if (!base) return out;
  const first = base.split(/[\s(\[]/)[0];
  const latin = (base.match(/[A-Za-z][A-Za-z0-9]+/g) || []).join("");
  const push = (h: string) => { if (h && h.length >= 3 && !out.includes(h)) out.push(h); };
  push("@" + base.replace(/\s+/g, ""));
  push("@" + first);
  if (latin) push("@" + latin.toLowerCase());
  return out.slice(0, 3);
}

async function resolveChannel(handle: string | null, name: string, allowSearch: boolean) {
  const tries = handle ? [handle, ...handleCandidates(name)] : handleCandidates(name);
  const notes: string[] = [];
  for (const h of tries) {
    /* 사장님이 **직접 등록한 핸들**(tries 의 첫 칸)은 이름 관문을 면제한다.
       핸들은 유튜브에서 유일하다 — @daenggu 를 치면 그 채널 하나뿐이다. 그런데 우리 표기가
       '떠돌이 댕구'이고 실제 채널명이 'daenggu' 라서, 한글 대 영문 비교가 떨어지며
       **멀쩡한 채널 3개가 통째로 막혀 있었다**(영상 0편). 추측으로 만든 후보(handleCandidates)
       는 남의 채널을 집을 수 있으니 관문을 그대로 둔다. 대신 실제 채널명을 기록해 눈으로 본다. */
    const trusted = !!handle && h === handle;
    try {
      const d: any = await ytGet("channels", { part: "id,snippet", forHandle: h });
      const it = d?.items?.[0];
      if (!it?.id) { notes.push(`${h}: 그런 핸들 없음`); continue; }
      const title = String(it?.snippet?.title || "");
      const got = normName(title);
      const want = normName(name);
      /* ⚠️ 등록된 핸들도 대조한다. 사장님이 준 목록에도 틀린 게 섞일 수 있다고 했고,
         핸들이 남의 채널을 가리키면 그 사람 여행지가 우리 데이터에 통째로 섞인다.
         느슨하게 보면 '@아일랜드'가 '아일랜드 트래블러'로 통과한다 — 앞 토큰만 같은 남의 채널이다.
         채널명이 우리 이름을 담고 있거나, 반대면 60% 이상 겹칠 때만 인정한다.
         떨어진 건 사유를 남겨 사람이 눈으로 확인한다(자동으로 붙이지 않는다). */
      if (!trusted && !sameChannelName(title, name)) {
        notes.push(`${h}: 실제 채널명 "${title.slice(0, 40)}" — 이름 불일치`); continue;
      }
      if (trusted && !sameChannelName(title, name)) {
        notes.push(`${h}: 등록 핸들 신뢰 — 실제 채널명 "${title.slice(0, 40)}"`);
      }
      return { id: it.id as string, thumb: it?.snippet?.thumbnails?.default?.url || null,
               cost: 1, via: "handle:" + h, title, note: notes.join(" / ") };
    } catch (_) { notes.push(`${h}: 조회 실패`); }
  }
  if (!allowSearch) { (resolveChannel as any).lastNotes = notes; return null; }
  /* 🚨 여기가 '트래블튜브' 사고가 난 자리다(2026-09-02, 사장님이 잡아냄).
     핸들 경로에는 sameChannelName() 관문이 있는데 **search 결과는 items[0] 을 그대로 받았다.**
     '트래블튜브'로 검색해 나온 첫 채널이 국뽕·스포츠 이슈 채널이었고, 영상 1,999편이
     통째로 들어와 거기서 뽑힌 '장소'(멕시코시티 국제공항·해운대역)까지 데이터를 오염시켰다.
     검색은 이름만 보고 찾는 길이라 **핸들보다 더 엄격해야** 하는데 반대였다.
     → 후보를 여럿 받아 이름이 맞는 것만 고른다. 하나도 안 맞으면 붙이지 않는다
       (100유닛 손해로 끝난다 — 엉뚱한 채널을 붙이는 값이 훨씬 비싸다). */
  const d: any = await ytGet("search",
    { part: "snippet", type: "channel", q: name, maxResults: "5" });
  for (const it of (d?.items || [])) {
    const id = it?.id?.channelId;
    const title = String(it?.snippet?.title || "");
    if (!id) continue;
    if (!sameChannelName(title, name)) {
      notes.push(`search "${title.slice(0, 30)}" — 이름 불일치`);
      continue;
    }
    return { id: id as string, thumb: it?.snippet?.thumbnails?.default?.url || null,
             cost: 100, via: "search", title };
  }
  (resolveChannel as any).lastNotes = notes;
  return null;
}

/* ISO8601 재생시간(PT1H2M3S) → 초. 쇼츠를 가려내는 데만 쓴다. */
function durSec(iso: string) {
  var m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return null;
  return (+(m[1] || 0)) * 86400 + (+(m[2] || 0)) * 3600 + (+(m[3] || 0)) * 60 + (+(m[4] || 0));
}

/* 영상 길이 채우기 — 50개당 1유닛이라 사실상 공짜다.
   ⚠️ 쇼츠엔 장소가 없다. 곽튜브 최근 300편의 상당수가 쇼츠였고, 그 20편을 LLM 에 태워
      4건이 나왔다(실측). 길이를 먼저 보고 버리면 LLM 비용과 지오코딩 몫이 안 샌다. */
async function hydrateDurations(ids: string[]) {
  const out = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 50) {
    const d: any = await ytGet("videos", { part: "contentDetails", id: ids.slice(i, i + 50).join(",") });
    for (const it of (d?.items || [])) {
      const s = durSec(it?.contentDetails?.duration);
      if (s != null) out.set(it.id, s);
    }
  }
  return out;
}

/* 업로드 플레이리스트를 훑는다. UC… → UU… 는 유튜브가 보장하는 규칙이다.
   already 에 있는 영상만 나오는 페이지를 만나면 멈춘다 — 매번 전체를 다시 읽을 이유가 없다. */
async function fetchUploads(chId: string, pages: number, known: Set<string>, deep = false) {
  const uploads = "UU" + chId.slice(2);
  const rows: any[] = [];
  let token = "", units = 0, stopped = false;
  for (let i = 0; i < pages && !stopped; i++) {
    const d: any = await ytGet("playlistItems", {
      part: "snippet", playlistId: uploads, maxResults: "50", ...(token ? { pageToken: token } : {}),
    });
    units++;
    const items = d?.items || [];
    if (!items.length) break;
    let fresh = 0;
    for (const it of items) {
      const vid = it?.snippet?.resourceId?.videoId;
      if (!vid) continue;
      if (!known.has(vid)) fresh++;
      rows.push({
        video_id: vid,
        title: sane(it?.snippet?.title || "").slice(0, 300),
        description: sane(it?.snippet?.description || "").slice(0, 3000),
        published_at: it?.snippet?.publishedAt || null,
      });
    }
    /* 평상시엔 '이미 아는 영상만 나온 페이지'에서 멈춘다(매번 전체를 다시 읽을 이유가 없다).
       ⚠️ 다만 **과거로 더 파고 싶을 때**는 이 규칙이 방해가 된다 — 최신 50편을 이미 알고 있으면
          첫 페이지에서 바로 멈춰 200편을 요청해도 0편이 들어온다(실측: 빠니보틀 seen 50 / new 0).
          경로를 채우려고 히스토리를 긁는 경우가 그렇다. deep=1 이면 끝까지 훑는다. */
    if (fresh === 0 && !deep) stopped = true;
    token = d?.nextPageToken || "";
    if (!token) break;
  }
  return { rows, units, stopped };
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!YT) return j({ ok: false, reason: "no_youtube_key" }, 500);

  const url = new URL(req.url);
  const nCh = Math.min(Number(url.searchParams.get("channels") || "6"), 12);
  /* 사장님: "각 크리에이터의 모든 여행 영상 자료를 다 긁어와서 부여."
     💰 playlistItems 는 50편당 1유닛이라 전체 히스토리도 싸다 —
        1,000편짜리 채널이 20유닛이고, 86채널 전부여도 500유닛 남짓이다.
     ⚠️ 다만 엣지 유휴 150초가 진짜 상한이다. 한 회차에 한 채널씩 끝까지 훑는 게 안전하다
        (full=1 은 채널을 하나만 지정해서 쓴다). */
  let full = url.searchParams.get("full") === "1";
  let pages = Math.min(Number(url.searchParams.get("pages") || (full ? "40" : "2")), full ? 90 : 6);
  let only = url.searchParams.get("channel") || "";
  /* 이름만 아는 채널의 해석은 회차당 1개가 기본값이다(100유닛). 0 이면 아예 안 한다. */
  let searchBudget = Math.min(Number(url.searchParams.get("resolve") || "1"), 3);

  /* tagprobe: 영상의 유튜브 **태그**에 지명이 들어 있는지 본다(진단용).
     왜: 설명란이 빈 채널이 있다(서재로36 은 159편 중 145편이 빈칸이고, 제목은
     'OECD에서 가장 가난한 나라'처럼 일부러 나라를 감춘다). 그런 영상은 지금 파이프라인이
     손댈 수가 없다. 크리에이터가 태그에 나라 이름을 넣어뒀다면 거기서 건질 수 있다.
     💰 videos.list?part=snippet 은 id 50개당 1유닛 — 이미 길이 받으려고 부르는 그 호출이다. */
  if (url.searchParams.get("tagprobe") === "1") {
    const ch = url.searchParams.get("ch") || "";
    const { data: vids } = await supa.from("travel_videos")
      .select("video_id,title").eq("channel", ch).limit(50);
    const ids = (vids || []).map((v: any) => v.video_id);
    if (!ids.length) return j({ ok: true, note: "영상 없음" });
    const d: any = await ytGet("videos", { part: "snippet", id: ids.join(",") });
    const out = (d?.items || []).map((it: any) => ({
      title: String(it?.snippet?.title || "").slice(0, 40),
      tags: (it?.snippet?.tags || []).slice(0, 12),
    }));
    const withTags = out.filter((x: any) => x.tags.length).length;
    return j({ ok: true, ch, n: out.length, withTags, sample: out.slice(0, 8) });
  }

  /* sethandle: 사장님이 준 유튜브 URL 로 채널을 확정한다.
     ⚠️ 핸들만 믿고 바로 쓰지 않는다 — dry=1 로 **실제 채널명을 먼저 받아** 눈으로 맞춘 뒤 넣는다.
        (실측 2026-09-04, 맛집: 이름 확인 없이 검색 결과를 믿었다가 엉뚱한 채널 1,999편을 폐기했다)
     💰 channels.list?forHandle 은 1유닛이다.
     쓰는 법: ?sethandle=1&pairs=<slug>:<handle>,<slug>:<handle>&dry=1 */
  if (url.searchParams.get("sethandle") === "1") {
    const dry = url.searchParams.get("dry") === "1";
    const pairs = (url.searchParams.get("pairs") || "").split(",")
      .map((x) => x.trim()).filter(Boolean)
      .map((x) => { const i = x.indexOf(":"); return { slug: x.slice(0, i), handle: x.slice(i + 1) }; })
      .filter((p) => p.slug && p.handle);
    if (!pairs.length) return j({ ok: false, reason: "no_pairs" }, 400);
    const res: any[] = [];
    for (const p of pairs) {
      const h = p.handle.replace(/^@/, "");
      try {
        const d: any = await ytGet("channels", {
          part: "snippet,statistics,contentDetails", forHandle: "@" + h,
        });
        const it = (d?.items || [])[0];
        if (!it) { res.push({ ...p, found: null, note: "그런 핸들 없음" }); continue; }
        const row = {
          ...p, found: it?.snippet?.title, id: it.id,
          videos: Number(it?.statistics?.videoCount) || null,
          subs: it?.statistics?.hiddenSubscriberCount ? null : (Number(it?.statistics?.subscriberCount) || null),
        };
        if (!dry) {
          const { error } = await supa.from("travel_channels").update({
            yt_handle: "@" + h, yt_channel_id: it.id, resolved: true, active: true,
            name: it?.snippet?.title || undefined,
            yt_video_count: row.videos, yt_count_at: new Date().toISOString(),
            thumb: it?.snippet?.thumbnails?.medium?.url || it?.snippet?.thumbnails?.default?.url || undefined,
            subs: row.subs ?? undefined, resolve_note: null, full_scanned_at: null,
          }).eq("slug", p.slug);
          if (error) return j({ ok: false, reason: "update_failed", slug: p.slug,
                                detail: String(error.message).slice(0, 160) }, 500);
        }
        res.push(row);
      } catch (e) { res.push({ ...p, found: null, note: String(e).slice(0, 90) }); }
    }
    return j({ ok: true, dry, res });
  }

  /* keys=1: 지금 몇 개의 유튜브 키를 들고 있는지만 알려준다(호출 0유닛).
     스페어가 실제로 붙었는지 확인할 자가 없으면, 소진되고 나서야 안다. */
  if (url.searchParams.get("keys") === "1") return j({ ok: true, keys: ytKeyCount() });

  /* 구독자 수 채우기 — 화면 정렬의 기준이다(사장님: 구독자 순으로 가야 하는 거 아닌가).
     💰 channels.list?part=statistics 도 **50개 id 당 1유닛**이라 86채널이 2유닛이다.
     ⚠️ 구독자를 숨긴 채널은 hiddenSubscriberCount=true 로 오고 값이 0이다 — null 로 둔다
        (0 으로 저장하면 정렬에서 '구독자 0명'인 채널로 취급돼 맨 뒤로 밀린다). */
  if (url.searchParams.get("subs") === "1") {
    const { data: rows } = await supa.from("travel_channels")
      .select("yt_channel_id").not("yt_channel_id", "is", null).limit(300);
    const ids = (rows || []).map((r: any) => r.yt_channel_id);
    if (!ids.length) return j({ ok: true, filled: 0 });
    let filled = 0, units = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const d: any = await ytGet("channels", { part: "statistics", id: ids.slice(i, i + 50).join(",") });
      units++;
      for (const it of (d?.items || [])) {
        const st = it?.statistics || {};
        if (st.hiddenSubscriberCount) continue;
        const n = Number(st.subscriberCount);
        if (!isFinite(n) || n <= 0) continue;
        await supa.from("travel_channels").update({ subs: n }).eq("yt_channel_id", it.id);
        filled++;
      }
    }
    return j({ ok: true, filled, units });
  }

  /* deficit=1: **가장 덜 긁힌 채널 하나를** 골라 끝까지 훑는다.
     왜: 기존 크론은 채널을 순서대로 6개씩 돌며 앞 50편만 봤다(pages=1). 그러면
     이미 다 가진 채널을 계속 다시 물어보고, 3,454편짜리 마카다TV 는 영영 안 찬다.
     실측(2026-09-04): 유튜브 공개 49,453편 중 우리가 가진 건 38,516편(77.9%),
     다 긁은 채널은 100개 중 17개뿐이었다.
     💰 playlistItems 는 50편당 1유닛이라 3,454편이 70유닛이다 — 하루 10,000 중 푼돈이다. */
  if (url.searchParams.get("deficit") === "1") {
    const { data: rows, error: dErr } = await supa.rpc("travel_channel_deficit", { p_limit: 1 });
    /* 🔴 '오류'와 '없음'을 가른다. 뭉개면 DB 가 한 번 딸꾹한 것을 '다 끝났다'로 읽고
       배수 루프가 그대로 멈춘다(실측 2026-09-04: 8,755편을 남겨두고 끝났다고 보고했다). */
    if (dErr) return j({ ok: false, reason: "deficit_rpc_failed",
                         detail: String(dErr.message || dErr).slice(0, 160) }, 500);
    const top = (rows || [])[0];
    if (!top) return j({ ok: true, note: "덜 긁힌 채널 없음" });
    /* 아래 본 흐름이 only/full/pages 를 그대로 쓰도록 값만 갈아끼운다 */
    only = top.slug; full = true; pages = 90;
  }

  /* 채널별 '유튜브가 말하는 영상 수'를 적어 둔다 — 우리가 다 긁었는지 대조하는 자다.
     💰 channels.list?part=statistics 는 50개 id 당 1유닛이라 100채널이 2유닛이다.
     ⚠️ videoCount 는 공개 업로드 수다. 비공개·삭제·멤버십 전용은 안 세므로
        우리 숫자가 이걸 조금 넘길 수도 있다 — 부족분만 의미가 있다. */
  if (url.searchParams.get("count") === "1") {
    const { data: rows } = await supa.from("travel_channels")
      .select("yt_channel_id").not("yt_channel_id", "is", null).limit(300);
    const ids = (rows || []).map((r: any) => r.yt_channel_id);
    if (!ids.length) return j({ ok: true, filled: 0 });
    let filled = 0, units = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const d: any = await ytGet("channels", { part: "statistics", id: ids.slice(i, i + 50).join(",") });
      units++;
      for (const it of (d?.items || [])) {
        const n = Number(it?.statistics?.videoCount);
        if (!isFinite(n)) continue;
        await supa.from("travel_channels")
          .update({ yt_video_count: n, yt_count_at: new Date().toISOString() })
          .eq("yt_channel_id", it.id);
        filled++;
      }
    }
    return j({ ok: true, filled, units });
  }

  /* 채널 프로필 사진 채우기 — 목록 헤더에 얼굴이 없으면 누구 섹션인지 안 보인다.
     💰 channels.list 는 **50개 id 당 1유닛**이라 86채널을 채워도 2유닛이다. */
  if (url.searchParams.get("thumbs") === "1") {
    const { data: rows } = await supa.from("travel_channels")
      .select("slug,yt_channel_id").is("thumb", null).not("yt_channel_id", "is", null).limit(200);
    const ids = (rows || []).map((r: any) => r.yt_channel_id);
    if (!ids.length) return j({ ok: true, filled: 0, note: "채울 썸네일 없음" });
    let filled = 0, units = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const d: any = await ytGet("channels", { part: "snippet", id: ids.slice(i, i + 50).join(",") });
      units++;
      for (const it of (d?.items || [])) {
        const t = it?.snippet?.thumbnails;
        const src = t?.medium?.url || t?.default?.url;
        if (!src) continue;
        await supa.from("travel_channels").update({ thumb: src }).eq("yt_channel_id", it.id);
        filled++;
      }
    }
    return j({ ok: true, filled, units });
  }

  /* 채널 주소(UC…)로 바로 등록하는 모드 — 사장님이 링크를 줄 때 쓴다.
     channels.list?id 는 1유닛이고 **채널명·썸네일을 유튜브가 준 그대로** 쓰므로
     이름 대조 문제 자체가 없다(핸들 추정과 달리 남의 채널이 붙을 여지가 없다). */
  const addId = url.searchParams.get("addid") || "";
  if (addId) {
    if (!/^UC[\w-]{20,}$/.test(addId)) return j({ ok: false, reason: "bad_channel_id" }, 400);
    const d: any = await ytGet("channels", { part: "id,snippet", id: addId });
    const it = d?.items?.[0];
    if (!it?.id) return j({ ok: false, reason: "not_found" }, 404);
    const slug = "yt_" + addId.slice(-12).toLowerCase();
    const title = String(it?.snippet?.title || addId);
    await supa.from("travel_channels").upsert({
      slug, name: title, kind: "yt", yt_channel_id: addId, resolved: true, active: true,
      lang: /[가-힣]/.test(title) ? "ko" : "en", sort: 70,
      thumb: it?.snippet?.thumbnails?.default?.url || null, resolve_note: null,
    }, { onConflict: "slug" });
    return j({ ok: true, added: { slug, name: title }, units: 1,
               note: "등록 완료 — 다음 수집 회차부터 영상이 들어옵니다" });
  }

  /* 핸들(@…)로 등록하는 모드 — 사장님이 주소를 줄 때 제일 흔한 형태다.
     channels.list?forHandle 은 1유닛이고, **채널명·썸네일을 유튜브가 준 그대로** 쓴다.
     addid 와 같은 이유로 안전하다: 이름을 우리가 추측하지 않으므로 남의 채널이 붙을 여지가 없다.
     ⚠️ 이름 대조 관문을 여기서 돌리면 안 된다 — 우리가 아는 이름이 아직 없다.
        (search 로 이름을 찾는 길만 관문이 필요하다. 그게 '트래블튜브' 사고의 자리였다.) */
  const addHandle = (url.searchParams.get("addhandle") || "").trim();
  if (addHandle) {
    const h = addHandle.startsWith("@") ? addHandle : "@" + addHandle;
    if (!/^@[\w.\-]{3,40}$/.test(h)) return j({ ok: false, reason: "bad_handle" }, 400);
    const d: any = await ytGet("channels", { part: "id,snippet", forHandle: h });
    const it = d?.items?.[0];
    if (!it?.id) return j({ ok: false, reason: "not_found", handle: h }, 404);
    const title = String(it?.snippet?.title || h);
    /* ⚠️ 이미 있는 채널이면 **행을 새로 만들지 않는다.** slug 를 채널ID 로 새로 지어
       upsert 하면 같은 채널이 두 행이 되고, 하나는 영상 0편인 유령으로 남는다
       (실측: @go6992 를 등록했더니 makadatv 옆에 빈 행이 하나 더 생겼다).
       기존 행이 있으면 핸들·썸네일만 채워 준다. */
    const { data: exist } = await supa.from("travel_channels")
      .select("slug").eq("yt_channel_id", it.id).limit(1).maybeSingle();
    if (exist?.slug) {
      await supa.from("travel_channels")
        .update({ yt_handle: h, resolved: true, active: true,
                  thumb: it?.snippet?.thumbnails?.default?.url || null })
        .eq("slug", exist.slug);
      return j({ ok: true, added: { slug: exist.slug, name: title, handle: h, id: it.id },
                 units: 1, note: "이미 등록된 채널 — 핸들만 붙였습니다" });
    }
    const slug = "yt_" + String(it.id).slice(-12).toLowerCase();
    await supa.from("travel_channels").upsert({
      slug, name: title, kind: "yt", yt_channel_id: it.id, yt_handle: h,
      resolved: true, active: true,
      lang: /[가-힣]/.test(title) ? "ko" : "en", sort: 70,
      thumb: it?.snippet?.thumbnails?.default?.url || null, resolve_note: null,
    }, { onConflict: "slug" });
    return j({ ok: true, added: { slug, name: title, handle: h, id: it.id }, units: 1,
               note: "등록 완료 — 다음 수집 회차부터 영상이 들어옵니다" });
  }

  /* 이미 쌓인 영상의 길이를 뒤늦게 채우는 모드.
     쇼츠 필터를 넣기 전에 들어온 행들이 수확 큐를 막고 있다(곽튜브 300편 중 상당수).
     ⚠️ 길이를 채우면 travel_videos_to_harvest 가 90초 미만을 알아서 건너뛴다 — 지우지 않는다.
        지워버리면 다음 수집에서 또 긁어온다. */
  if (url.searchParams.get("hydrate") === "1") {
    const ch = only || "";
    let qy = supa.from("travel_videos").select("video_id,channel").is("duration_s", null).limit(400);
    if (ch) qy = qy.eq("channel", ch);
    const { data: rows } = await qy;
    const ids = (rows || []).map((r: any) => r.video_id);
    if (!ids.length) return j({ ok: true, hydrated: 0, note: "길이 채울 영상 없음" });
    const durs = await hydrateDurations(ids);
    let n = 0, shorts = 0;
    for (const r of (rows || []) as any[]) {
      const d = durs.get(r.video_id);
      if (d == null) continue;
      await supa.from("travel_videos").update({ duration_s: d })
        .eq("channel", r.channel).eq("video_id", r.video_id);
      n++; if (d < 90) shorts++;
    }
    return j({ ok: true, hydrated: n, shorts, units: Math.ceil(ids.length / 50) });
  }

  let list: any[] = [];
  if (only) {
    const { data } = await supa.from("travel_channels")
      .select("slug,name,yt_channel_id,yt_handle").eq("slug", only).limit(1);
    list = data || [];
  } else if (url.searchParams.get("unresolved") === "1") {
    /* 해석 전용 큐 — 이름만 아는 채널을 하루 한두 개씩 search.list(100유닛)로 뚫는다.
       평상시 큐와 섞으면 이 채널들이 맨 앞을 차지한 채 도장 없이 건너뛰어져 나머지가 굶는다. */
    const { data } = await supa.rpc("travel_channels_unresolved", { p_n: nCh });
    list = (data || []) as any[];
  } else {
    const { data } = await supa.rpc("travel_channels_next", { p_n: nCh });
    list = (data || []) as any[];
  }
  if (!list.length) return j({ ok: true, picked: 0, note: "채널 없음" });

  const out: any[] = [];
  let units = 0;

  for (const c of list) {
    const now = new Date().toISOString();
    let chId: string | null = c.yt_channel_id || null;
    const row: any = { slug: c.slug };

    try {
      if (!chId) {
        const allow = searchBudget > 0;
        const r = await resolveChannel(c.yt_handle || null, c.name, allow);
        if (r) {
          chId = r.id; units += r.cost; row.via = (r as any).via;
          if (r.cost >= 100) searchBudget--;
          row.title = (r as any).title;
          await supa.from("travel_channels").update({
            yt_channel_id: chId, resolved: true, resolve_note: null,
            ...(r.thumb ? { thumb: r.thumb } : {}),
          }).eq("slug", c.slug);
        } else {
          units += c.yt_handle ? 1 : 0;
          const why = ((resolveChannel as any).lastNotes || []).join(" / ").slice(0, 300);
          row.note = why || (allow ? "해석 실패" : "해석 대기(쿼터 절약)");
          /* 도장을 찍을지가 이 함수에서 제일 조용한 사고 지점이다.
             ⚠️ 핸들이 틀린 채널(그런 핸들 없음/이름 불일치)은 다시 물어봐도 결과가 같다.
                도장을 안 찍으면 그것들이 큐 맨 앞에 눌러앉아 **나머지 채널을 굶긴다**
                (실측: 8채널이 앞을 막아 20채널이 한 번도 호출되지 않았다).
                반대로 '핸들도 없고 검색도 금지'라 아예 못 물어본 건은 찍지 않는다 —
                그건 실패가 아니라 대기다. */
          const asked = (why || "").length > 0;
          const patch: any = {};
          if (asked) { patch.resolve_note = why; patch.last_synced_at = now; }
          else if (allow) patch.last_synced_at = now;
          if (Object.keys(patch).length) {
            await supa.from("travel_channels").update(patch).eq("slug", c.slug);
          }
          out.push(row);
          continue;
        }
      }

      /* 🔴 .limit(2000) 은 거짓말이었다. PostgREST 는 서버 설정(기본 1,000)에서 잘라 준다.
         그래서 1,000편 넘는 채널은 '이미 가진 것'을 1,000개만 알았고, 나머지가 매 회차
         **신규로 잡혔다**. 실측 2026-09-04: jotube 1,140편 중 정확히 140편이 매번 new 로
         찍혔고(1,140-1,000), 실제로는 하나도 안 늘었다. 부족분 선택기는 그 채널을
         영원히 다시 골랐다. 페이지로 나눠 끝까지 받는다. */
      const known = new Set<string>();
      for (let off = 0; off < 20000; off += 1000) {
        const { data: page } = await supa.from("travel_videos")
          .select("video_id").eq("channel", c.slug).range(off, off + 999);
        const rows = page || [];
        for (const v of rows) known.add(v.video_id);
        if (rows.length < 1000) break;
      }

      const got = await fetchUploads(chId!, pages, known, full || url.searchParams.get("deep") === "1");
      units += got.units;

      /* 길이를 받아 쇼츠(90초 미만)를 버린다. 유닛은 50편당 1이라 부담이 없다. */
      let durs = new Map<string, number>();
      try { durs = await hydrateDurations(got.rows.map((r: any) => r.video_id)); units += Math.ceil(got.rows.length / 50); }
      catch (_) { /* 길이를 못 받으면 그냥 다 넣는다 — 수집이 멈추는 것보단 낫다 */ }
      const kept = got.rows.filter((r: any) => {
        const d = durs.get(r.video_id);
        return d == null || d >= 90;
      });
      row.shorts = got.rows.length - kept.length;

      let inserted = 0;
      if (kept.length) {
        const payload = kept.map((r: any) => ({ ...r, channel: c.slug, duration_s: durs.get(r.video_id) ?? null }));
        for (let i = 0; i < payload.length; i += 100) {
          const chunk = payload.slice(i, i + 100);
          const { error } = await supa.from("travel_videos")
            .upsert(chunk, { onConflict: "channel,video_id", ignoreDuplicates: true });
          if (!error) {
            inserted += chunk.filter((r: any) => !known.has(r.video_id)).length;
            continue;
          }
          /* ⚠️ 묶음 하나가 실패하면 **그 채널 전체가 0편**이 됐다(실측: Mark Wiens 1,633편).
             한 편의 이상한 문자 때문에 나머지 99편까지 버리는 건 손해가 너무 크다.
             → 실패한 묶음만 한 편씩 다시 넣고, 진짜 못 넣는 것만 버린다. */
          row.chunkErr = error.message.slice(0, 80);
          for (const one of chunk) {
            const { error: e1 } = await supa.from("travel_videos")
              .upsert([one], { onConflict: "channel,video_id", ignoreDuplicates: true });
            if (e1) { row.dropped = (row.dropped || 0) + 1; continue; }
            if (!known.has(one.video_id)) inserted++;
          }
        }
      }
      const newest = got.rows.map((r: any) => r.published_at).filter(Boolean).sort().pop() || null;
      await supa.from("travel_channels").update({
        last_synced_at: now, ...(newest ? { last_video_at: newest } : {}),
      }).eq("slug", c.slug);

      row.seen = got.rows.length; row.new = inserted;
      /* 끝까지 훑었는데 새 게 하나도 없으면 도장을 찍는다 — 부족분 선택기가 일주일 쉰다.
         ⚠️ 이게 없으면 유튜브 카운트(쇼츠·멤버십 포함)와 우리 수의 차이 때문에
         '영원히 부족한' 채널을 계속 다시 훑는다(실측: 23회 갇혀 460유닛 낭비). */
      if (full && inserted === 0) {
        await supa.rpc("travel_channel_full_scanned", { p_slug: c.slug });
        row.fullScanned = true;
      }
      out.push(row);
    } catch (e) {
      row.err = String(e).slice(0, 160);
      /* 업로드 플레이리스트가 404 라면 그 채널 ID 로는 영영 못 훑는다
         (숨긴 채널이거나, 핸들 추정이 남의 채널을 잡았거나). 매 회차 유닛만 태우므로 접는다.
         ⚠️ 방금 해석한 건이면 ID 를 지워 다시 해석할 여지를 남긴다. */
      if (row.err.includes("playlistItems 404")) {
        await supa.from("travel_channels")
          .update({ active: false, resolved: false, yt_channel_id: null, last_synced_at: now })
          .eq("slug", c.slug);
        row.note = "업로드 목록 없음 → 비활성";
        out.push(row);
        continue;
      }
      await supa.from("travel_channels").update({ last_synced_at: now }).eq("slug", c.slug);
      out.push(row);
      /* 쿼터 소진(403 quotaExceeded)이면 남은 채널을 계속 돌 이유가 없다 — 즉시 끊는다. */
      if (row.err.includes("403")) { row.halt = true; break; }
    }
  }

  return j({ ok: true, channels: out.length, units, resolveLeft: searchBudget, detail: out });
});
