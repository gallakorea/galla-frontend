import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const fetchResult = await supabase
      .from("news_articles_raw")
      .select("id, sid, title")
      .not("sid", "is", null)
      .is("related_group_id", null)
      .limit(100);

    if (!fetchResult || fetchResult.error) {
      throw fetchResult?.error ?? "fetchResult is undefined";
    }

    const raws = fetchResult.data ?? [];

    let grouped = 0;
    let groupsCreated = 0;

    for (const row of raws) {
      if (!row.sid || !row.title) continue;

      const fingerprint = `${row.sid}:${row.title.slice(0, 50)}`;

      const existingResult = await supabase
        .from("related_groups")
        .select("id")
        .eq("sid", row.sid)
        .eq("fingerprint", fingerprint)
        .maybeSingle();

      let groupId: string | null = null;

      if (existingResult && existingResult.data?.id) {
        groupId = existingResult.data.id;
      } else {
        const insertResult = await supabase
          .from("related_groups")
          .insert({ sid: row.sid, fingerprint })
          .select("id")
          .single();

        if (!insertResult || insertResult.error || !insertResult.data?.id) {
          continue; // ❗ 절대 throw 안 함
        }

        groupId = insertResult.data.id;
        groupsCreated++;
      }

      await supabase
        .from("news_articles_raw")
        .update({ related_group_id: groupId })
        .eq("id", row.id);

      grouped++;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        stats: {
          fetched: raws.length,
          grouped,
          groupsCreated,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("🔥 group-related-news fatal:", e);

    /* 🔴 String(e) 는 Error 가 아닌 값(Supabase 에러 객체 등)에서 "[object Object]" 가 된다.
       크론 응답 로그(net._http_response)에 그대로 남아 **원인을 전혀 알 수 없었다**
       (실측 2026-08-30: 24시간에 500 이 4번 났는데 전부 "[object Object]").
       message·code·details 를 꺼내고, 그래도 안 되면 JSON 으로 떨군다. */
    const errText = (() => {
      if (e instanceof Error) return e.message + (e.stack ? " | " + e.stack.split("\n")[1]?.trim() : "");
      if (e && typeof e === "object") {
        const o = e as Record<string, unknown>;
        const parts = ["message", "code", "details", "hint"]
          .map((k) => (o[k] ? k + "=" + String(o[k]) : null))
          .filter(Boolean);
        if (parts.length) return parts.join(" · ");
        try { return JSON.stringify(o).slice(0, 400); } catch { /* 순환 참조 */ }
      }
      return String(e);
    })();

    return new Response(
      JSON.stringify({
        ok: false,
        error: errText,
      }),
      { status: 500 }
    );
  }
});