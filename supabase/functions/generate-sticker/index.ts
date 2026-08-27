/* 🎨 generate-sticker — 나만의 이모티콘(AI 생성), 유료
   흐름: JWT → 프롬프트 검열 → GP 선차감(RPC) → 이미지 생성 → R2 저장 → my_stickers
         어느 단계든 실패하면 차감한 GP를 되돌린다(돈만 빠지는 일 없게).

   안전장치(타협 금지):
   · OpenAI moderation(무료)로 성적·폭력·혐오 차단
   · 유명 IP·실존 인물 키워드 차단 — 나중에 이모티콘을 팔 계획이라면 특히 중요
   · 생성 권한은 이 함수에만(테이블 INSERT 권한을 클라에 주지 않음)
   · 하루 상한: 유저별=charge RPC, 플랫폼 전체=ai_budget_take(GP 차감 전 검사) */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

import { logSpendUnits } from "../_shared/spend.ts";

// 🎟 등급 게이트 — app_settings.ai_tiers 의 롤링 윈도우. 장애 시 통과(게이트가 서비스를 죽이면 안 된다).
async function aiGate(subject: string, fn: string, n = 1): Promise<any> {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` },
      body: JSON.stringify({ p_fn: fn, p_subject: subject, p_n: n }),
    });
    if (!r.ok) return { ok: true };
    return await r.json();
  } catch { return { ok: true }; }
}

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3",
  region: "auto",
});
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

/* 남의 IP를 그대로 뽑아주면 우리가 책임진다 — 유명 캐릭터·브랜드·실존 인물 차단 */
const BLOCKED = [
  "피카츄", "pikachu", "포켓몬", "pokemon", "마리오", "mario", "디즈니", "disney",
  "미키", "mickey", "짱구", "도라에몽", "doraemon", "카카오프렌즈", "라이언", "어피치",
  "라인프렌즈", "브라운", "코니", "산리오", "sanrio", "헬로키티", "hello kitty",
  "마블", "marvel", "스파이더맨", "spider-man", "배트맨", "batman", "슈퍼맨",
  "짱구는", "원피스", "루피", "나루토", "naruto", "귀멸", "케데헌",
  "대통령", "president", "김정은", "트럼프", "trump", "머스크", "musk",
  "bts", "방탄소년단", "블랙핑크", "blackpink", "뉴진스", "아이유",
];
function ipGuard(prompt: string): string | null {
  const p = prompt.toLowerCase();
  const hit = BLOCKED.find((w) => p.includes(w.toLowerCase()));
  return hit ? hit : null;
}

async function moderate(text: string): Promise<boolean> {
  try {
    const r = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: text }),
    });
    const d = await r.json();
    return !!d?.results?.[0]?.flagged;
  } catch { return false; }   // 검열 API 장애로 생성을 막지는 않는다(모델 자체 필터가 2차 방어)
}

/* 스티커답게 — 배경 투명, 두꺼운 외곽선, 단순한 형태. 카톡 이모티콘 톤 */
const STYLE = "cute kawaii sticker illustration, thick clean outline, flat vivid colors, "
  + "simple bold shapes, centered single character, expressive face, no text, no watermark, "
  + "die-cut sticker style, transparent background";

async function uploadR2(bytes: Uint8Array, key: string) {
  // upload-media와 같은 방식(r2.fetch 직접 PUT) — 이미 검증된 경로
  const url = `https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
  const res = await r2.fetch(url, {
    method: "PUT",
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`r2_${res.status}`);
  return `${R2_PUBLIC_URL}/${key}`;
}

/* AI 일일 상한 — 플랫폼 전체 하루 예산(app_settings.ai_daily_caps)에서 1건 당긴다.
   한도 초과면 false. DB가 죽었을 땐 통과시킨다(예산 조회 실패로 기능을 멈추지 않게). */
const AI_FN = "generate-sticker";
async function aiBudgetOk(n = 1): Promise<boolean> {
  try {
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
      body: JSON.stringify({ p_fn: AI_FN, p_n: n }),
    });
    if (!r.ok) return true;
    const j = await r.json();
    if (j && j.ok === false) { console.warn("[ai-budget] blocked", AI_FN, JSON.stringify(j)); return false; }
    return true;
  } catch { return true; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const me = callerUid(req);
  if (!me) return j({ error: "auth" }, 401);

  let body: { prompt?: string; count?: number };
  try { body = await req.json(); } catch { return j({ error: "bad json" }, 400); }
  const prompt = String(body.prompt || "").trim().slice(0, 200);
  const count = body.count === 4 ? 4 : 1;
  if (prompt.length < 2) return j({ error: "prompt_short" }, 400);

  const ip = ipGuard(prompt);
  if (ip) return j({ error: "blocked_ip", word: ip }, 400);
  if (await moderate(prompt)) return j({ error: "blocked_moderation" }, 400);

  // ── GP 선차감 (호출자 권한으로 실행해야 auth.uid()가 잡힌다) ──
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });
  // 플랫폼 전체 AI 상한 — GP 차감 '전에' 막는다(차감 후 실패는 환불 경로를 태워야 하므로)
  if (!(await aiBudgetOk(count))) return j({ error: "ai_daily_cap" }, 429);

  // 🎟 등급 게이트 — 무료/프렌드/프로별 생성 한도(app_settings.ai_tiers). GP 차감보다 먼저 본다.
  { const g = await aiGate("u:" + me, "generate-sticker");
    if (g && g.ok === false) return j({ error: "tier_limit", gate: g }, 429); }
  const { data: charge, error: cErr } = await asUser.rpc("ai_sticker_charge", { p_count: count });
  if (cErr || !charge?.ok) return j({ error: charge?.reason || "charge_failed", detail: charge }, 402);
  const paid = charge.charged as number;
  const quality = (charge.quality as string) || "medium";

  const refund = async () => { try { await sb.rpc("ai_sticker_refund", { p_user: me, p_amount: paid }); } catch (_) {} };

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${prompt}. ${STYLE}`,
        n: count,
        size: "1024x1024",
        quality,
        background: "transparent",
        output_format: "png",
        moderation: "auto",
      }),
    });
    const d = await r.json();
    /* 💰 토큰이 아니라 '장수'가 원가다. 단가는 gc_prices.sticker 의 실측 기준(₩55/장 ≈ $0.04)을
       그대로 쓴다 — 청구서가 오면 여기 한 곳만 고치면 된다. */
    if (r.ok && d?.data?.length) logSpendUnits("generate-sticker", "gpt-image-1", me ?? null, d.data.length, 0.04);
    if (!r.ok || !d?.data?.length) {
      console.error("[sticker] openai", r.status, JSON.stringify(d?.error || d).slice(0, 300));
      await refund();
      return j({ error: "generate_failed", detail: d?.error?.message || `http_${r.status}` }, 502);
    }

    const setId = count > 1 ? crypto.randomUUID() : null;
    const urls: string[] = [];
    for (const item of d.data) {
      const b64 = item.b64_json as string;
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const key = `stickers/${me}/${crypto.randomUUID()}.png`;
      urls.push(await uploadR2(bytes, key));
    }
    const { error: iErr } = await sb.from("my_stickers").insert(
      urls.map((u) => ({ user_id: me, url: u, prompt, set_id: setId })),
    );
    if (iErr) console.error("[sticker] insert", iErr);

    return j({ ok: true, urls, charged: paid, balance: charge.balance });
  } catch (e) {
    console.error("[sticker]", e);
    await refund();
    return j({ error: "server", detail: String(e).slice(0, 200) }, 500);
  }
});
