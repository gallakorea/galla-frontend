// 구글 Places API 사용 가능 여부 진단(일회성).
// ⚠️ 키 값을 절대 응답에 담지 않는다 — 어떤 키가 어떤 이유로 막혔는지만 돌려준다.
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const KEYS: Record<string, string> = {
  YOUTUBE_API_KEY: Deno.env.get("YOUTUBE_API_KEY") || "",
  GOOGLE_PLACES_KEY: Deno.env.get("GOOGLE_PLACES_KEY") || "",
  GEMINI_API_KEY: Deno.env.get("GEMINI_API_KEY") || "",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET) return j({ ok: false, reason: "unauthorized" }, 401);
  const out: any[] = [];
  for (const [name, key] of Object.entries(KEYS)) {
    if (!key) { out.push({ name, present: false }); continue; }
    try {
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": "places.id,places.displayName,places.photos",
        },
        body: JSON.stringify({ textQuery: "명동교자 본점 서울", languageCode: "ko", maxResultCount: 1 }),
      });
      const t = await r.text();
      out.push({ name, present: true, status: r.status, body: t.slice(0, 300) });
    } catch (e) { out.push({ name, present: true, err: String(e).slice(0, 200) }); }
  }
  return j({ ok: true, probes: out });
});
