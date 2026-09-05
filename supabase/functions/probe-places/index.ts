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
  /* 🔴 구글 유료 차단 스위치. 2026-09-04 카드 결제 ₩200,000 사고로 들어왔다.
     지금은 blackid 계정의 **무료 체험 크레딧**(₩414,984, 12/5 만료)으로 돈다 —
     체험 계정은 크레딧이 바닥나면 **스스로 멈추고 카드로 안 넘어간다.**
     ⚠️ 그 계정을 '정식 계정'으로 업그레이드하면 그 보호가 사라진다. 절대 하지 말 것.
     그리고 실제 지출은 places_spend 가 **원화로** 막는다(기본 예산 0). */
  if (Deno.env.get("GOOGLE_PAID_OK") !== "1") {
    return new Response(JSON.stringify({ ok: false, reason: "GOOGLE_PAID_BLOCKED" }),
      { status: 503, headers: { "content-type": "application/json" } });
  }
  return j({ ok: true, probes: out });
});
