// 🎬 GIPHY 프록시 — 키(GIPHY_API_KEY)를 서버에 보관, 클라엔 노출 안 함
// body: { q?: string, limit?: number }  →  { results: [{ url, preview }] }
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

  const KEY = Deno.env.get("GIPHY_API_KEY");
  if (!KEY) return json({ results: [], error: "no_key" });

  let q = "", limit = 24, kind = "gifs";
  try {
    const b = await req.json();
    q = (b.q || "").toString().trim().slice(0, 60);
    limit = Math.min(+b.limit || 24, 40);
    if (b.kind === "stickers") kind = "stickers";   // 😀 무한 이모티콘 — 투명 스티커
  } catch (_) {}

  const base = `https://api.giphy.com/v1/${kind}`;
  const url = q
    ? `${base}/search?api_key=${KEY}&q=${encodeURIComponent(q)}&limit=${limit}&rating=pg-13&lang=ko&bundle=fixed_height`
    : `${base}/trending?api_key=${KEY}&limit=${limit}&rating=pg-13&bundle=fixed_height`;

  try {
    const r = await fetch(url);
    const d = await r.json();
    const results = (d.data || []).map((g: any) => ({
      url: g.images?.fixed_height?.url || g.images?.original?.url,
      preview: g.images?.fixed_height_small?.url || g.images?.preview_gif?.url || g.images?.fixed_height?.url,
    })).filter((x: any) => x.url);
    return json({ results });
  } catch (e) {
    return json({ results: [], error: String(e) });
  }
});
