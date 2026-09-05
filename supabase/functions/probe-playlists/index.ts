// 🔎 재생목록으로 나라를 알아낼 수 있는지 **재본다**.
//
// 착안(사장님): 여행 유튜버는 나라별로 재생목록을 만든다 — "베트남 여행", "🇯🇵 일본 편".
// 목록 제목에 나라가 있으면 그 목록에 든 영상 전부에 나라를 뿌릴 수 있다.
// 설명·번역을 뒤지는 것보다 훨씬 싸고 정확할 수 있다.
//
// 비용: playlists.list 1유닛(50개까지) · playlistItems.list 1유닛(50편까지). 사실상 공짜다.
// ⚠️ 먼저 **되는지 재고** 나서 만든다. 오늘 추측으로 만들었다가 버린 게 이미 하나 있다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ytFetch } from "../_shared/ytkey.ts";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

async function yt(path: string, params: Record<string, string>) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await ytFetch(u);
  if (!r.ok) throw new Error(`${path} ${r.status} ${(await r.text()).slice(0, 140)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("channel") || "";
  const { data: ch } = await supa.from("travel_channels")
    .select("slug,name,yt_channel_id").eq("slug", slug).maybeSingle();
  if (!ch?.yt_channel_id) return j({ ok: false, reason: "no_channel_id" });

  const d: any = await yt("playlists", {
    part: "snippet,contentDetails", channelId: ch.yt_channel_id, maxResults: "50",
  });
  const lists = (d.items || []).map((it: any) => ({
    id: it.id,
    title: String(it.snippet?.title || ""),
    n: Number(it.contentDetails?.itemCount || 0),
  }));
  return j({ ok: true, channel: ch.name, count: lists.length,
             total_videos: lists.reduce((a: number, x: any) => a + x.n, 0), lists });
});
