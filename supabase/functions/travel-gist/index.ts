// 이미 수확한 영상의 '한 줄 요약'을 채운다 (2026-09-02)
//
// 사장님: "기존 15,000편도 요약 채워."
// 유튜브 제목은 낚시성이라 뭘 하는 영상인지 안 보인다. 수확이 지나간 16,306편은
// 요약 기능을 붙이기 전이라 비어 있다.
//
// 💰 **10편씩 묶어 한 번에 물어본다.** 영상마다 부르면 16,000번인데 묶으면 1,600번이다.
//    설명은 500자만 넘긴다 — 요약 한 줄에 그 이상은 필요 없고 토큰만 먹는다.
// ⚠️ **수확 함수(harvest-travel-places)를 건드리지 않는다.** 오늘 거기에 모드를 하나
//    끼웠다가 런타임 500 을 내서 수확이 통째로 멈췄다. 요약은 있으면 좋은 것이지
//    수확을 세울 만한 일이 아니다 — 그래서 함수를 따로 둔다.
// ⚠️ 못 만든 영상도 빈 문자열로 표시한다. null 로 두면 매 회차 같은 영상을 또 물어본다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const DS = Deno.env.get("DEEPSEEK_API_KEY") || "";
/* 🔴 구글로 **조용히** 넘어가지 않는다. DeepSeek 이 한 번 실패했을 뿐인데
   말없이 Gemini(구글 과금)로 붙는 구조였다 — 실측 2026-09-04 낮에 `deepseek 400` 이
   났고 그때마다 구글로 갔다. 같은 날 구글 클라우드에서 카드 결제 ₩200,000 이 나갔다.
   폴백은 이제 **명시적으로 켜야** 쓴다(GEMINI_FALLBACK=1). 기본은 꺼짐. */
const GEM = (Deno.env.get("GEMINI_FALLBACK") === "1")
  ? (Deno.env.get("GEMINI_API_KEY") || "") : "";
const CHAT_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });

const SYS = [
  "너는 여행 유튜브 영상의 제목·설명을 읽고 **그 영상이 무슨 내용인지** 한국어 한 문장으로 적는다.",
  "규칙:",
  "1) 60자 안쪽. 담백하게 서술한다.",
  "2) **제목을 옮겨 적지 마라.** 유튜브 제목은 낚시성이라 내용이 안 들어 있다.",
  "   좋은 예: '카이로 시내 시장을 걸으며 현지 길거리 음식을 사 먹는다'",
  "   나쁜 예: '이집트 여행 브이로그'(뭘 하는지가 없다) / '여행 난이도 최악 근황'(제목 복사)",
  "3) 어디서 무엇을 하는지가 보이게 쓴다 — 나라·도시·행동.",
  "4) 근거가 부족하면 빈 문자열. **지어내지 않는다.**",
  "5) 받은 영상 전부에 대해 같은 순서로 답한다. id 는 받은 값을 그대로 돌려준다.",
  'JSON 만: {"results":[{"id":"<video_id>","gist":"한 문장"}]}',
].join("\n");

let dsDead = false;
const errs: string[] = [];

async function chatJson(user: string): Promise<string | null> {
  if (DS && !dsDead) {
    try {
      const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYS }, { role: "user", content: user }],
        }),
      });
      if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
      /* 402(잔액)·401(키)은 이번 실행 내내 계속 실패한다 — 한 번만 적고 예비로 넘어간다. */
      if (r.status === 402 || r.status === 401) dsDead = true;
      if (errs.length < 4) errs.push(`deepseek ${r.status}:${(await r.text()).slice(0, 90)}`);
    } catch (e) { if (errs.length < 4) errs.push(`deepseek ${String(e).slice(0, 70)}`); }
  }
  if (!GEM) return null;
  try {
    const u = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEM}`;
    const g = await fetch(u, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYS }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    });
    if (!g.ok) { if (errs.length < 4) errs.push(`gemini ${g.status}`); return null; }
    return (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch (e) { if (errs.length < 4) errs.push(`gemini ${String(e).slice(0, 70)}`); return null; }
}

/* 여러 곳이 나오는 영상: 곳마다 다른 한 줄을 받는다.
   ⚠️ 같은 문장을 복사하지 말라고 못 박는다 — 안 그러면 세 장소에 같은 말이 붙어
      영상 요약 하나 쓰는 것과 다를 게 없어진다. */
const SYS_NOTE = [
  "너는 여행 유튜브 영상 하나와 **그 영상에 나오는 장소 목록**을 받는다.",
  "장소마다 '이 영상에서 그 장소에서 무엇을 했는지' 한국어 한 문장(50자 안쪽)을 쓴다.",
  "규칙:",
  "1) **장소마다 다른 얘기를 써라.** 같은 문장을 여러 장소에 복사하면 안 된다.",
  "   좋은 예: 우치사르 성 → '성 위에 올라 괴레메 마을 전경을 내려다본다'",
  "             트래블러스 케이브 펜션 → '동굴을 개조한 숙소에 묵는다'",
  "2) 설명에 그 장소 얘기가 없으면 **빈 문자열**. 지어내지 않는다.",
  "3) place_id 는 받은 값을 그대로 돌려준다.",
  'JSON 만: {"results":[{"place_id":"<uuid>","note":"한 문장"}]}',
].join("\n");

async function chatJson2(user: string): Promise<string | null> {
  if (DS && !dsDead) {
    try {
      const r = await fetch(CHAT_URL, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [{ role: "system", content: SYS_NOTE }, { role: "user", content: user }],
        }),
      });
      if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
      if (r.status === 402 || r.status === 401) dsDead = true;
      if (errs.length < 4) errs.push(`deepseek ${r.status}`);
    } catch (e) { if (errs.length < 4) errs.push(`deepseek ${String(e).slice(0, 60)}`); }
  }
  return null;
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!DS && !GEM) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);

  /* ── ?notes=1 : 여러 곳 나오는 영상의 장소별 한 줄 ─────────────
     사장님: "영상에 장소가 다양하더라도 장소마다 다 뜨게 해야 함."
     💰 한 곳짜리 영상(74%)은 AI 를 안 부른다 — 영상 요약을 그대로 복사하면 된다
        (travel_note_from_gist). 비용은 여러 곳 나오는 26% 에만 붙는다. */
  if (url.searchParams.get("notes") === "1") {
    const dl = Date.now() + 110_000;
    let vids = 0, saved = 0;
    try {
      /* 먼저 공짜부터: 한 곳짜리는 요약을 복사한다 */
      const { data: cp } = await supa.rpc("travel_note_from_gist", { p_limit: 3000 });
      const copied = Number(cp?.copied || 0);

      while (Date.now() < dl) {
        const { data: todo } = await supa.rpc("travel_sources_to_note", { p_limit: 4 });
        const list = (todo || []) as any[];
        if (!list.length) break;
        for (const v of list) {
          if (Date.now() > dl) break;
          const places = (v.places || []) as any[];
          if (!places.length) continue;
          vids++;
          const user = `제목: ${v.title}\n설명: ${String(v.description || "").slice(0, 900)}\n\n` +
            "장소들:\n" + places.map((p: any) => `- place_id=${p.place_id} / ${p.name}`).join("\n");
          const raw = await chatJson2(user);
          let items: any[] = [];
          if (raw) { try { items = JSON.parse(raw)?.results || []; } catch { items = []; } }
          const ok = new Set(places.map((p: any) => String(p.place_id)));
          const out = items.filter((x) => x && ok.has(String(x.place_id)))
            .map((x) => ({ video_id: v.video_id, channel: v.channel,
                           place_id: String(x.place_id), note: String(x.note || "").trim() }));
          /* 빠진 장소도 빈 값으로 박는다 — 안 그러면 이 영상이 큐에 영원히 남는다 */
          for (const p of places) {
            if (!out.some((o) => o.place_id === String(p.place_id))) {
              out.push({ video_id: v.video_id, channel: v.channel,
                         place_id: String(p.place_id), note: "" });
            }
          }
          const { data: r } = await supa.rpc("travel_source_note_save", { p_items: out });
          saved += Number(r?.saved || 0);
          if (!raw) break;
        }
      }
      return j({ ok: true, mode: "notes", copiedFromGist: copied, videos: vids, saved,
                 errors: errs.slice(0, 3) });
    } catch (e) {
      return j({ ok: false, mode: "notes", error: String(e).slice(0, 300), videos: vids, saved }, 500);
    }
  }

  const want = Math.min(Number(url.searchParams.get("n") || "200"), 600);
  const BATCH = 10;
  /* 엣지는 150초 놀면 흔적 없이 사라진다 — 시계를 안전장치로 둔다. */
  const DEADLINE = Date.now() + 110_000;

  let picked = 0, saved = 0, rounds = 0;
  const sample: string[] = [];

  try {
    while (picked < want && Date.now() < DEADLINE) {
      const { data: todo } = await supa.rpc("travel_videos_to_gist",
        { p_limit: Math.min(BATCH, want - picked) });
      const list = (todo || []) as any[];
      if (!list.length) break;
      picked += list.length;
      rounds++;

      const user = list.map((v) =>
        `id=${v.video_id}\n제목: ${v.title}\n설명: ${String(v.description || "").slice(0, 500)}`
      ).join("\n---\n");

      const raw = await chatJson(user);
      let items: any[] = [];
      if (raw) { try { items = JSON.parse(raw)?.results || []; } catch { items = []; } }

      const byId = new Map(list.map((v) => [String(v.video_id), v]));
      const out = items
        .filter((x) => x && byId.has(String(x.id)))
        .map((x) => ({ video_id: String(x.id), channel: byId.get(String(x.id))!.channel,
                       gist: String(x.gist || "").trim() }));
      /* 모델이 빠뜨린 것도 빈 값으로 남긴다 — 안 그러면 다음 회차에 또 물어보고 영원히 안 끝난다. */
      for (const v of list) {
        if (!out.some((o) => o.video_id === String(v.video_id))) {
          out.push({ video_id: String(v.video_id), channel: v.channel, gist: "" });
        }
      }
      out.forEach((o) => { if (o.gist && sample.length < 3) sample.push(o.gist); });

      const { data: res } = await supa.rpc("travel_gist_mark", { p_items: out });
      saved += Number(res?.marked || 0);
      if (!raw) break;                    // 공급자가 죽었으면 더 물어봐야 소용없다
    }
  } catch (e) {
    return j({ ok: false, error: String(e).slice(0, 300), picked, saved }, 500);
  }

  const { data: left } = await supa.rpc("travel_videos_to_gist", { p_limit: 1 });
  return j({ ok: true, picked, saved, rounds,
             remaining: (left || []).length ? "남음" : "없음",
             sample, errors: errs.slice(0, 3) });
});
