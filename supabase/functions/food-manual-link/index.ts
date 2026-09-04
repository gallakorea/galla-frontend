// 사람이 영상을 보고 직접 상호를 넣는 길.
//
// 왜 만드나: 자동 매칭의 한계선이 실측으로 확정됐다(2026-09-04).
//   이름 매칭 13,271건→135건 · 카탈로그 2.4배(14,506→34,485편)→+14건 · 웹문서 역추적→0건.
//   영상이 없어서가 아니라 **채널이 상호도 주소도 안 적어서**다(또간집 700편 중 611편이 설명 40자 미만).
//   밖에서 메우려 했더니 거짓말이 박혔다(서촌 편에 남양주 가게 3곳).
//   → 그러면 사람이 보고 넣는 게 맞다. 대신 **치는 건 상호뿐**이게 만든다.
//     주소·좌표·업종·전화는 네이버 지역검색이 채우고, 존재하지 않는 집은 애초에 못 고른다.
//
// 두 갈래:
//   search : 상호로 후보를 보여준다(고르기 전용, 아무것도 안 바꾼다)
//   attach : 고른 후보를 그 영상의 출처로 박는다
//   skip   : 이 영상엔 건질 게 없다 — 도장만 찍고 큐에서 뺀다

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const S_ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const S_SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "content-type": "application/json", "access-control-allow-origin": "*",
               "access-control-allow-headers": "authorization,content-type,apikey" },
  });
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, "").replace(/&[a-z]+;/g, " ").trim();

/* 좌표는 네이버가 1e7 배로 준다 */
function coord(mx: any, my: any) {
  const x = Number(mx), y = Number(my);
  if (!x || !y) return { lat: null as string | null, lon: null as string | null };
  return x > 1000 ? { lat: String(y / 1e7), lon: String(x / 1e7) } : { lat: null, lon: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return j({ ok: true });

  /* 🔴 관리자만. 서비스 키로 도는 함수라 아무나 부르면 '누가 갔나'를 마음대로 쓸 수 있다. */
  const auth = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!auth) return j({ ok: false, reason: "no_token" }, 401);
  const { data: u } = await supa.auth.getUser(auth);
  const uid = u?.user?.id;
  if (!uid) return j({ ok: false, reason: "bad_token" }, 401);
  const { data: isAdmin } = await supa.rpc("is_admin", { p_uid: uid });
  if (!isAdmin) return j({ ok: false, reason: "not_admin" }, 403);

  const url = new URL(req.url);
  const act = url.searchParams.get("act") || "search";

  if (act === "search") {
    if (!S_ID) return j({ ok: false, reason: "no_naver_key" }, 500);
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) return j({ ok: true, items: [] });
    const nu = new URL("https://openapi.naver.com/v1/search/local.json");
    nu.searchParams.set("query", q);
    nu.searchParams.set("display", "5");
    const r = await fetch(nu, { headers: { "X-Naver-Client-Id": S_ID, "X-Naver-Client-Secret": S_SEC } });
    if (!r.ok) return j({ ok: false, reason: `naver_${r.status}` }, 502);
    const items = ((await r.json())?.items || []).map((it: any) => {
      const c = coord(it.mapx, it.mapy);
      return {
        name: strip(it.title),
        address: strip(it.roadAddress) || strip(it.address) || "",
        category: (strip(it.category).split(">").pop() || "").trim() || null,
        phone: strip(it.telephone) || null,
        lat: c.lat, lon: c.lon,
      };
    });
    return j({ ok: true, items });
  }

  if (act === "attach") {
    const b = await req.json().catch(() => ({}));
    const { video_id, channel, video_title, published_at, place } = b || {};
    if (!video_id || !channel || !place?.name || !place?.address) {
      return j({ ok: false, reason: "bad_input" }, 400);
    }
    const { data, error } = await supa.rpc("food_ingest", {
      p_items: [{ ...place, channel, video_id,
                  video_title: String(video_title || "").slice(0, 200), aired_at: published_at || null }],
    });
    if (error) return j({ ok: false, reason: String(error.message).slice(0, 200) }, 500);
    return j({ ok: true, ...(data || {}) });
  }

  if (act === "skip" || act === "done") {
    const b = await req.json().catch(() => ({}));
    const ids = Array.isArray(b?.ids) ? b.ids : (b?.video_id ? [b.video_id] : []);
    if (!ids.length) return j({ ok: false, reason: "no_ids" }, 400);
    await supa.rpc("food_videos_mark_harvested", { p_ids: ids });
    return j({ ok: true, marked: ids.length });
  }

  return j({ ok: false, reason: "unknown_act" }, 400);
});
