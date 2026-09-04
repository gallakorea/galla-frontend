// 영상마다 '이 집을 어떻게 소개했나'를 한 줄로 만든다 — 상세의 재생 영상 카드에 붙는다.
//
// 🔑 DEEPSEEK_API_KEY (없으면 GEMINI_API_KEY 로 폴백)
//
// 왜: 상세를 열면 채널 로고와 영상 제목뿐이다. 제목은 "디저트 특집! 후식이 명란 밥!" 처럼
// **회차 제목**이라 이 집이 왜 나왔는지 눌러보기 전엔 모른다. 눌러야 아는 건 미리보기가 아니다.
//
// 가게 단위가 아니라 **영상 단위**로 붙인다 — 같은 집이 여러 영상에 나오면 영상마다 다른
// 얘기를 하기 때문이다. 한 영상에 여러 집이 나오면 한 번의 호출로 집마다 따로 뽑는다.
//
// ⚠️ 이건 기존 1,101편을 메우는 배치다. **새로 수확되는 영상은 harvest-creator-places 가
//    같은 LLM 호출에서 blurb 까지 받아오므로 여기 올 일이 없다(추가 비용 0).**

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

let dsDead = false;
const aiErrors: string[] = [];

async function chatJson(sys: string, user: string): Promise<string | null> {
  if (DS && !dsDead) {
    const r = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${DS}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0, response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      }),
    });
    if (r.ok) return (await r.json())?.choices?.[0]?.message?.content || null;
    if (r.status === 402 || r.status === 401) dsDead = true;
    if (aiErrors.length < 4) aiErrors.push(`deepseek ${r.status}`);
  }
  if (!GEM) return null;
  const u = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${GEM}`;
  const g = await fetch(u, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: sys }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0, responseMimeType: "application/json" },
    }),
  });
  if (!g.ok) { if (aiErrors.length < 6) aiErrors.push(`gemini ${g.status}`); return null; }
  return (await g.json())?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/* 문장 규칙이 곧 품질이다. 제목을 되풀이하거나 "맛있는 집" 같은 말을 쓰면 안 붙이느니만 못하다.
   설명에 근거가 없으면 **빈 문자열**을 주게 한다 — 지어낸 한 줄이 없는 것보다 나쁘다. */
const SYS = [
  "너는 한국 음식 유튜브 영상의 제목·설명을 읽고, 거기 나온 음식점 각각에 대해",
  "'이 영상이 이 집을 어떻게 소개했는지'를 한 문장으로 요약하는 요약기다.",
  "규칙:",
  "1) 한 문장, 45자 이내. 마침표 없이 명사형으로 끝낸다. 예: '숯불에 구워 내는 생삼겹 전문'",
  "2) 설명과 제목에 적힌 사실만 쓴다 — 대표 메뉴·조리 방식·특징·가격대. **지어내지 않는다.**",
  "3) 근거가 없으면 그 집은 blurb 를 빈 문자열로 준다. 억지로 채우지 않는다.",
  "4) '맛있다'·'존맛'·'대박' 같은 감상은 쓰지 않는다. 무엇을 파는 집인지가 먼저다.",
  /* 🔴 2026-09-03 실측: 한국 맛집 영상의 설명란은 대부분 링크·채널가입·이메일·주소뿐이라
     가게 얘기가 없다(표본 2편 모두 빈 문자열). 정보는 **제목**에 있다
     ("악명높은 수원의 수원칼국수", "미친 매운짬뽕집"). 그래서 제목을 근거로 허용하되,
     낚시 표현을 걷어내고 명사형으로 **다시 쓰게** 한다. 그대로 옮기는 것과는 다르다. */
  "5) 설명에 그 집 얘기가 없으면 **제목을 근거로 쓴다.** 단 그대로 옮기지 말고 다시 쓴다:",
  "   '미친·대박·역대급·오지게·존맛·충격·소름·레전드·드디어·진짜로' 같은 과장어와",
  "   '가봤습니다·다녀왔습니다' 같은 후기 말투를 걷어내고, 무엇을 파는 집인지 명사형으로 남긴다.",
  "   예: '먹다가 뒤집힌다는 미친 매운짬뽕집을 가봤습니다' → '매운 짬뽕으로 알려진 중식당'",
  "   예: '드디어 악명높은 수원의 수원칼국수를 다녀왔습니다' → '수원에서 이름난 칼국수집'",
  "   제목에도 그 집이 무엇을 파는지 단서가 없으면 그때는 빈 문자열이다.",
  "6) 채널명·구독·협찬·링크·이메일 문구는 넣지 않는다. 상호를 문장에 되풀이하지 않는다.",
  /* 🔴 이 규칙이 없으면 여러 집이 나온 영상에서 전부 같은 문장을 준다
     (실측 2026-09-03: 여러 가게 영상 32편 중 14편, 44% 가 가게마다 똑같았다). */
  "7) **가게마다 서로 다른 문장을 쓰려고 먼저 애쓴다.** 같은 영상에 여러 집이 나오면",
  "   설명에서 각 집의 **고유한** 메뉴·가격·특징을 먼저 찾는다.",
  /* 🔴 2026-09-03: 여기서 '여러 집이면 제목 금지' 로 막았더니 채움률이 반 토막 났다.
     이 문장이 보이는 곳은 **가게 상세의 영상 카드 한 장**이다 — 사용자는 한 번에 한 집만
     본다. 그러니 옆 집과 문장이 겹치는 건 화면에서 드러나지 않는다.
     반대로 빈칸은 그 한 장에서 곧바로 드러난다. 그래서 겹침보다 빈칸이 더 나쁘다. */
  "   못 찾으면 제목에 **구체적인 음식**이 있을 때에 한해 그것으로 채운다",
  "   (예: '매운짬뽕집' → '매운 짬뽕으로 알려진 중식당'). 옆 집과 문장이 비슷해도 괜찮다.",
  "   다만 제목이 음식이 아니라 **영상 기획**만 말하면(예: '초저가 식당 3곳 도장깨기',",
  "   '전국 맛집 투어') 그건 그 집 얘기가 아니므로 빈 문자열이다.",
  "8) 설명에 그 집의 메뉴·가격이 적혀 있으면 그걸 우선 쓴다 — 가장 잘 구별되는 정보다.",
  '   예: {"name":"성이네천원김밥","blurb":"김밥 1,000원 찐만두 10개 3,000원"}',
  /* 🔴 2026-09-03 실측: 설명란 보일러플레이트를 요약이라고 내놓는다.
     '팔선 본점' 이 '오전 11시 30분~저녁 8시 30분, 월요일 휴무' 를 받았다 —
     영업시간은 상세 화면에 이미 따로 있고, 그 집이 무엇을 파는지는 여전히 알 수 없다. */
  "9) **영업시간·휴무일·주차·카드·포장·예약·혼밥 가능 여부·전화번호·주소·좌석 수는 금지한다.**",
  "   그건 요약이 아니라 시설 정보이고, 화면에 이미 따로 붙는다. 무엇을 파는 집인지만 쓴다.",
  "   그런 것밖에 없으면 제목에서 음식 단서를 찾고, 그것도 없으면 빈 문자열이다.",
  "10) 쉼표로 항목을 나열하지 않는다. 한 문장으로 읽혀야 한다.",
  'JSON 만: {"blurbs":[{"name":"상호","blurb":"한 문장"}]}',
].join("\n");

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!DS && !GEM) return j({ ok: false, reason: "no_ai_key" }, 500);

  const url = new URL(req.url);
  const n = Math.min(Number(url.searchParams.get("n") || "20"), 200);
  const { data: vids } = await supa.rpc("food_videos_to_blurb", { p_limit: n });
  const list = (vids || []) as any[];
  if (!list.length) return j({ ok: true, picked: 0, note: "요약할 영상 없음" });

  const t0 = Date.now();
  const rows: any[] = [];
  let done = 0, empty = 0, halted = "";
  /* ?debug=1 이면 첫 영상의 LLM 원문을 그대로 돌려준다.
     빈 결과가 'AI 가 못 만들었다'인지 '상호 대조가 어긋났다'인지 눈으로 갈라야 한다. */
  const DEBUG = url.searchParams.get("debug") === "1";
  const dbg: any[] = [];

  /* ⚠️ 순차로 돌리면 한 편에 3초라 110초 상자 안에 35편밖에 못 넣는다.
     큐가 1.4만 편이라 그 속도로는 60시간이다. 4편씩 동시에 태워 상자를 채운다.
     동시성을 더 올리면 DeepSeek 쪽 429 를 부른다 — 4 가 실측 상한이다. */
  const CONC = 4;
  const norm = (x: string) => String(x || "").replace(/[^가-힣a-zA-Z0-9]/g, "").toLowerCase();

  async function one(v: any) {
    let out: any = null;
    let raw: string | null = null;
    try {
      raw = await chatJson(
        SYS,
        `제목: ${v.title}\n\n이 영상에 나온 가게(${(v.places || []).length}곳): ${(v.places || []).map((p: any) => p.name).join(" · ")}\n\n설명:\n${v.description || ""}`,
      );
      out = raw ? JSON.parse(raw) : null;
      if (DEBUG && dbg.length < 2) dbg.push({ title: v.title, raw: (raw || "").slice(0, 600) });
    } catch (e) { out = null; if (DEBUG && dbg.length < 3) dbg.push({ err: String(e) }); }
    done++;
    const got: any[] = out?.blurbs || [];
    for (const p of (v.places || [])) {
      const hit = got.find((b: any) => {
        const a = norm(b?.name), c = norm(p.name);
        return a && c && (a === c || a.includes(c) || c.includes(a));
      });
      const text = String(hit?.blurb || "").trim();
      /* ⚠️ 못 만든 것도 **빈 문자열로 표식을 남긴다.** 안 남기면 blurb 가 null 로 남아
         큐(blurb is null)가 10분 뒤 같은 영상을 또 집는다 — 실측으로 큐가 20회 헛돌았다. */
      if (!text) empty++;
      rows.push({ video_id: v.video_id, place_id: p.id, blurb: text });
    }
  }

  for (let i = 0; i < list.length; i += CONC) {
    if (Date.now() - t0 > 105_000) { halted = "시간 상자(105초) 도달"; break; }
    await Promise.all(list.slice(i, i + CONC).map(one));
  }

  let set = 0, marked = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { data } = await supa.rpc("food_blurb_set", { p_rows: rows.slice(i, i + 200) });
    set += Number(data?.set || 0);
    marked += Number(data?.marked || 0);
  }
  return j({ ok: true, picked: list.length, videos: done, set, marked, empty,
             halted: halted || undefined, ai: aiErrors, dbg: DEBUG ? dbg : undefined });
});
