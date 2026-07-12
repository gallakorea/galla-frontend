// ⚖️ 일기토 AI 심판 — 관중 무투표/동표(judging)인 대결의 대화록을 읽고 승자 판정
// 남용/비용 방지: status='judging' 인 대결만 처리(1회 판정 후 finished 로 잠김)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
};
const OPENAI = Deno.env.get("OPENAI_API_KEY")!;
const MODEL = "gpt-4o-mini";
const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { duel_id } = await req.json().catch(() => ({}));
    if (!duel_id) return json({ ok: false, reason: "no_duel" }, 400);

    // 판정 대상 검증(judging 상태만) — 비용 남용 차단
    const { data: d } = await supa.from("duels")
      .select("id,status,topic,challenger,opponent").eq("id", duel_id).maybeSingle();
    if (!d) return json({ ok: false, reason: "not_found" }, 404);
    if (d.status === "finished") return json({ ok: true, status: "finished" });
    if (d.status !== "judging") return json({ ok: false, reason: "not_judging" }, 409);

    // 파이터 닉네임 + 대화록
    const { data: us } = await supa.from("users").select("id,nickname").in("id", [d.challenger, d.opponent]);
    const nick = (uid: string) => us?.find((u) => u.id === uid)?.nickname || "익명";
    const cName = nick(d.challenger), oName = nick(d.opponent);

    const { data: msgs } = await supa.from("duel_messages")
      .select("side,body,created_at").eq("duel_id", duel_id).order("created_at");

    // 대화가 없으면 무승부
    if (!msgs || msgs.length === 0) {
      await supa.rpc("duel_apply_ai_verdict", { p_duel: duel_id, p_winner: "draw", p_reason: "변론 기록이 없어 무승부로 판정했어요." });
      return json({ ok: true, winner: "draw" });
    }

    const transcript = msgs.map((m) =>
      `[${m.side === "challenger" ? cName + "(도전자)" : oName + "(응전자)"}] ${m.body}`).join("\n");

    const sys = "너는 온라인 논쟁 대결 '일기토'의 공정한 심판이다. 두 사람의 실시간 설전 대화록을 읽고, " +
      "논리·근거·설득력·주제 적합성을 종합해 승자를 판정한다. 말투가 거칠어도 내용의 설득력만 본다. " +
      "명백히 우열을 가리기 어렵거나 양측 모두 부실하면 draw. " +
      'JSON만 출력: {"winner":"challenger|opponent|draw","reason":"한국어 한 문장 판정평(존댓말, 40자 이내)"}';
    const user = `주제: ${d.topic}\n도전자=${cName}(challenger), 응전자=${oName}(opponent)\n\n대화록:\n${transcript}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${OPENAI}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL, temperature: 0.2, max_tokens: 200,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    const j = await r.json();
    let out: any = {};
    try { out = JSON.parse(j?.choices?.[0]?.message?.content || "{}"); } catch { out = {}; }
    let winner = out.winner;
    if (!["challenger", "opponent", "draw"].includes(winner)) winner = "draw";
    const reason = (typeof out.reason === "string" ? out.reason : "AI 심판이 종합 판정했어요.").slice(0, 120);

    const { data: applied } = await supa.rpc("duel_apply_ai_verdict",
      { p_duel: duel_id, p_winner: winner, p_reason: reason });

    return json({ ok: true, winner, reason, applied });
  } catch (e) {
    return json({ ok: false, reason: "error", detail: String(e) }, 500);
  }
});
