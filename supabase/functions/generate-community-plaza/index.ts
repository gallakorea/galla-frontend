// 🔥 커뮤니티 인기글 → AI 재작성 → 광장 자동 게시
// 원문 통째 복제 X. 제목을 바탕으로 '원본과 다른' 짧은 광장 글로 재창작 + 출처 아웃링크.
// 강력 안전필터: 혐오·불법·명예훼손·개인정보·정치극단·성인 → 스킵.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type" };
const OPENAI = Deno.env.get("OPENAI_API_KEY");
const BOT_NICK = "🔥 커뮤 HOT";

const SYS = `너는 한국 커뮤니티 인기글 제목을 받아, 그걸 소재로 '갈라 광장'에 올릴 짧고 가벼운 오리지널 글을 쓰는 에디터다.
규칙:
- 원문 본문을 모른다. 제목만 보고, 사람들이 얘기 나눌 만한 2~4문장짜리 '원본과 다른' 오리지널 도입글을 새로 쓴다(복제 금지).
- 중립적이고 위트있게. 특정인/집단 비하, 정치 진영 선동, 지역/성별 혐오 금지.
- 아래 중 하나라도 해당하면 게시하지 말고 skip:
  (1) 특정 실존 인물 비방·허위사실·명예훼손 소지 (2) 지역/성별/장애/인종 혐오
  (3) 정치 극단·선동 (4) 불법(마약·도박·성인·해킹·불법촬영 등) (5) 개인정보(실명 저격·신상·연락처)
  (6) 자살·자해 조장 (7) 광고·사기 소지
- 반드시 아래 JSON만 출력:
  {"ok": true, "title": "20자 내외 낚이는 제목", "body": "2~4문장 도입글", "category": "유머|이슈|잡담 중 하나"}
  또는 {"ok": false, "reason": "스킵 사유"}`;

async function rewrite(title: string) {
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${OPENAI}` },
    body: JSON.stringify({
      model: "gpt-4o-mini", temperature: 0.7, response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYS }, { role: "user", content: `인기글 제목: ${title}` }],
    }),
  });
  const j = await r.json();
  try { return JSON.parse(j.choices[0].message.content); } catch { return { ok: false, reason: "parse_fail" }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!OPENAI) return new Response(JSON.stringify({ ok: false, reason: "no_openai_key" }), { headers: { ...cors, "Content-Type": "application/json" } });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: rows } = await sb.from("community_hot").select("*").eq("status", "new").order("created_at", { ascending: false }).limit(10);
  let published = 0, skipped = 0;
  for (const it of (rows || [])) {
    const out = await rewrite(it.src_title || "");
    if (!out?.ok) {
      await sb.from("community_hot").update({ status: "skipped", skip_reason: String(out?.reason || "ai_skip").slice(0, 200), processed_at: new Date().toISOString() }).eq("id", it.id);
      skipped++; continue;
    }
    const cat = ["유머", "이슈", "잡담"].includes(out.category) ? out.category : "유머";
    const body = `${out.body}\n\n🔗 원문 보기: ${it.src_url}\n(출처: ${it.source})`;
    const { data: post, error } = await sb.from("plaza_posts").insert({
      user_id: null, nickname: BOT_NICK, title: String(out.title).slice(0, 80),
      body, content: [], category: cat, cover_image: it.thumb || null,
    }).select("id").single();
    if (error) {
      await sb.from("community_hot").update({ status: "failed", skip_reason: error.message.slice(0, 200) }).eq("id", it.id);
      continue;
    }
    await sb.from("community_hot").update({ status: "published", plaza_post_id: post.id, processed_at: new Date().toISOString() }).eq("id", it.id);
    published++;
  }
  return new Response(JSON.stringify({ ok: true, published, skipped }), { headers: { ...cors, "Content-Type": "application/json" } });
});
