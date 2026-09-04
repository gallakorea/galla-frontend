// 영상 설명의 **번역본**을 받아온다 — 원문에 없는 주소·메뉴가 거기 있다.
//
// 🔑 YOUTUBE_API_KEY
//
// 실측 2026-09-04: 설명에 한국어 주소가 없는 영상 50편씩 재봤더니
//   먹을텐데 번역 50/50 · 원문보다 긴 번역 87건.
//   인도네시아어 번역에 "Mie Dangke Olle, 4 Pyoseondangpo-ro, Pyoseon-myeon, Seogwipo-si, Jeju"
//   — 한국어 설명엔 없는 **완전한 주소**다.
//   입짧은햇님 영어 번역엔 'Apple Cinnamon Gelato Cup 5,000 won' 처럼 메뉴·가격까지 있다.
//
// ⚠️ 처음에 "번역에 주소 없음"이라고 본 건 내 실수다 — 한국어 주소 정규식으로만 쟀고
//    표본이 3편이었다. 로마자 주소(Seogwipo-si)를 통째로 못 잡았다.
//
// 비용: videos.list 는 id 50개까지 **1유닛**. 12,819편이면 257유닛(하루 무료 10,000의 3%).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  u.searchParams.set("key", YT);
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 140)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!YT) return j({ ok: false, reason: "no_yt_key" }, 500);

  const url = new URL(req.url);
  const channel = url.searchParams.get("channel") || null;
  const rounds = Math.min(Number(url.searchParams.get("rounds") || "20"), 60);

  const t0 = Date.now();
  let seen = 0, saved = 0, withAddr = 0, halted = "";

  for (let i = 0; i < rounds; i++) {
    if (Date.now() - t0 > 110_000) { halted = "시간 상자(110초) 도달"; break; }
    const { data: vs } = await supa.rpc("food_videos_need_i18n", { p_channel: channel, p_limit: 50 });
    const ids = ((vs || []) as any[]).map((v) => v.video_id);
    if (!ids.length) break;

    let d: any;
    try { d = await yt("videos", { part: "localizations", id: ids.join(",") }); }
    catch (e) { halted = String(e).slice(0, 120); break; }
    seen += ids.length;

    const got = new Map<string, string>();
    for (const it of (d.items || [])) {
      const locs: any = it.localizations || {};
      /* 언어별 설명을 전부 이어붙인다 — 어느 언어에 주소가 있을지 모른다.
         같은 내용이 여러 언어로 반복되면 길어지지만, LLM 한 번 더 부르는 것보다 싸다.
         너무 길면 잘라 낸다(설명 원문 2,500자 + 번역 3,500자면 충분하다). */
      const parts: string[] = [];
      for (const k of Object.keys(locs)) {
        const t = String(locs[k]?.description || "").trim();
        if (t) parts.push(t);
      }
      got.set(it.id, parts.join("\n---\n").slice(0, 3500));
    }

    /* ⚠️ 응답에 없는 id 도 **반드시 도장을 찍는다**(빈 문자열). 안 그러면 번역 없는 영상이
       영원히 큐 맨 앞에 남아 같은 50편만 무한 반복한다 — 착한가격에서 겪은 그 함정이다. */
    const rows = ids.map((id) => ({ video_id: id, text: got.get(id) || "" }));
    const { data: r } = await supa.rpc("food_video_i18n_set", { p_rows: rows });
    saved += Number(r?.saved || 0);
    withAddr += Number(r?.withAddr || 0);
  }

  return j({ ok: true, channel, seen, saved, withAddr, halted: halted || undefined });
});
