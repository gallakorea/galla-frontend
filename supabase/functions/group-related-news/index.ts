import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.112.4";

/* 관련뉴스 묶기 — 실제 작업은 SQL 함수 public.group_related_news 가 한다.
 *
 * 왜 옮겼나(2026-08-30):
 * ① 옛 지문은 '출처 + 제목 앞 50자'. 같은 출처가 똑같은 제목을 두 번 낼 때만 묶여서
 *    기사 100개당 그룹 90~99개 — 사실상 아무것도 안 묶었다(3일치 30,671건 중 4.6%).
 *    '관련 뉴스'가 원하는 건 다른 언론사의 같은 사건인데, sid 를 지문에 넣어 그걸 막고 있었다.
 *    새 규칙(24시간 내 제목 유사도 0.5 초과)은 28% 를 묶는다.
 * ② 옛 구현은 기사 1건당 왕복 3번 × 100건 = 300번을 여기서 돌았다. 60초 타임아웃에
 *    걸리기 쉬웠고, 실제로 12시간에 6번 500 으로 죽었다(그건 SELECT 가 Seq Scan 이던
 *    것도 겹쳤다 — 부분 인덱스 idx_news_raw_ungrouped 로 해결).
 *    지금은 왕복 1번. 200건에 14초.
 */
serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    let limit = 200;
    try {
      const body = await req.json();
      const n = Number(body?.limit);
      if (Number.isFinite(n) && n > 0) limit = Math.min(1000, Math.floor(n));
    } catch (_) { /* 본문 없음 — 기본값 */ }

    const { data, error } = await supabase.rpc("group_related_news", { p_limit: limit });
    if (error) throw error;

    return new Response(JSON.stringify(data ?? { ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("🔥 group-related-news fatal:", e);

    /* 🔴 String(e) 는 Error 가 아닌 값(Supabase 에러 객체 등)에서 "[object Object]" 가 된다.
       크론 응답 로그(net._http_response)에 그대로 남아 원인을 전혀 알 수 없었다. */
    const errText = (() => {
      if (e instanceof Error) return e.message;
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const parts = ["message", "code", "details", "hint"]
          .filter(k => o[k])
          .map(k => `${k}=${o[k]}`);
        if (parts.length) return parts.join(" · ");
        try { return JSON.stringify(o); } catch (_) { /* 순환참조 */ }
      }
      return String(e);
    })();

    return new Response(JSON.stringify({ ok: false, error: errText }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
