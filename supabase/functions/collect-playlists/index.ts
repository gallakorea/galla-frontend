// 재생목록에서 영상을 받아온다.
//
// 왜 채널이 아니라 목록인가 (실측 2026-09-05, 사장님이 주소를 눈으로 확인해 잡아냈다):
//   방송 프로는 방송사 채널에 다른 프로와 섞여 있다. 채널 전체를 긁으면 무관한 영상이 쏟아지고,
//   프로 이름으로 채널을 자동 검색하면 **팬 채널**이 잡힌다 — 실제로 10개가 가짜였고
//   그것들이 만든 '누가 다녀갔나' 2,263건이 전부 거짓이었다.
//   목록은 그 프로만 정확히 담고, 압도적으로 많다:
//     백반기행   가짜 채널 31편  → TV조선 공식 목록 3,168편
//     전현무계획 가짜 채널 177편 → 채널S 시즌별 목록 894+650+201편
//
// 비용: playlistItems 50편당 1유닛. 채널 업로드를 훑는 것과 같다.
// ⚠️ 시간 상자를 둔다 — 엣지는 150초에서 조용히 끊긴다(오늘 그걸로 여러 번 당했다).

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
  const only = url.searchParams.get("list");
  const n = Math.min(Number(url.searchParams.get("n") || "2"), 6);
  const maxPages = Math.min(Number(url.searchParams.get("pages") || "40"), 100);
  const t0 = Date.now();

  /* 맛집·여행 둘 다 같은 구조를 쓴다 — kind 로 가른다 */
  const kind = url.searchParams.get("kind") === "travel" ? "travel" : "food";
  const T = { pl: `${kind}_playlists`, vid: `${kind}_videos`,
              due: `${kind}_playlists_due`, done: `${kind}_playlist_done` };

  let lists: any[];
  if (only) {
    const { data } = await supa.from(T.pl)
      .select("playlist_id,channel,title").eq("playlist_id", only).maybeSingle();
    if (!data) return j({ ok: false, reason: "unknown_playlist" });
    lists = [data];
  } else {
    const { data } = await supa.rpc(T.due, { p_limit: n });
    lists = (data || []) as any[];
  }
  if (!lists.length) return j({ ok: true, note: "대상 없음" });

  const report: any[] = [];
  for (const L of lists) {
    if (Date.now() - t0 > 110_000) break;          // 시간 상자
    let token = "", got = 0, pages = 0;
    const rows: any[] = [];
    try {
      for (; pages < maxPages; pages++) {
        if (Date.now() - t0 > 110_000) break;
        const d: any = await yt("playlistItems", {
          part: "snippet", playlistId: L.playlist_id, maxResults: "50",
          ...(token ? { pageToken: token } : {}),
        });
        for (const it of d.items || []) {
          const s = it.snippet || {};
          const vid = s.resourceId?.videoId;
          if (!vid || !s.title) continue;
          /* 비공개·삭제된 영상은 제목이 'Private video' 로 온다 — 담지 않는다 */
          if (/^(Private|Deleted) video$/i.test(s.title)) continue;
          rows.push({ channel: L.channel, video_id: vid, title: s.title,
                      description: String(s.description || "").slice(0, 4000),
                      published_at: s.publishedAt });
        }
        got += (d.items || []).length;
        token = d.nextPageToken || "";
        if (!token) break;
      }
      for (let i = 0; i < rows.length; i += 500) {
        await supa.from(T.vid)
          .upsert(rows.slice(i, i + 500), { onConflict: "channel,video_id" });
      }
      await supa.rpc(T.done, { p_id: L.playlist_id, p_n: got });
      report.push({ list: L.title, fetched: got, saved: rows.length, pages });
    } catch (e) {
      report.push({ list: L.title, err: String(e).slice(0, 120) });
    }
  }
  return j({ ok: true, report });
});
