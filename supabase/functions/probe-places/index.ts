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
  /* 🔴🔴 전면 중지 (2026-09-04). 구글 클라우드에서 실제 카드 결제가 나갔다 —
     ₩200,000. 무료 크레딧으로 덮인다고 보고 월 상한을 1,000 → 20,000 으로 올린 게 원인이다.
     크레딧이 남았는지 **확인하지 않았고**, 구글 쪽에 결제 상한(budget/quota)도 안 걸어뒀다.
     크론만 끄면 누가 다시 켤 수 있으므로 코드에서 막는다.
     다시 열 때는 반드시 ① GCP 콘솔에서 결제 한도·API 쿼터를 먼저 걸고
     ② 남은 크레딧을 눈으로 확인한 뒤 ③ 이 가드를 지운다. */
  return new Response(JSON.stringify({ ok: false, reason: "GOOGLE_KILL_2026_09_04" }),
    { status: 503, headers: { "content-type": "application/json" } });
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
