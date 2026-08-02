/* 🖼 generate-thumbnail — 갈비스 창작 대행: 콘텐츠 썸네일/커버 AI 생성.
   흐름: JWT → 프롬프트 검열(moderation+IP가드) → 플랫폼 일일캡 → 유저 일일한도 → gpt-image-1 → R2 → my_thumbnails.
   지금은 무료(완성형 우선) — 남용가드는 플랫폼 캡(ai_daily_caps.generate-thumbnail) + 유저 24h 한도.
   과금(GP)은 나중에 붙인다. 생성 권한은 이 함수에만(클라에 이미지생성/INSERT 권한 없음). */
import { createClient } from "npm:@supabase/supabase-js@2";
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY")!;
const R2_PUBLIC_URL = Deno.env.get("R2_PUBLIC_URL")!;
const r2 = new AwsClient({
  accessKeyId: Deno.env.get("R2_ACCESS_KEY_ID")!,
  secretAccessKey: Deno.env.get("R2_SECRET_ACCESS_KEY")!,
  service: "s3", region: "auto",
});
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;
const CF_ACCOUNT = Deno.env.get("CF_ACCOUNT_ID")!;
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const USER_DAILY_LIMIT = 12;   // 유저별 24시간 썸네일 생성 한도(남용 방지)

const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

function callerUid(req: Request): string | null {
  try {
    const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const p = JSON.parse(atob(tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p.sub || null;
  } catch { return null; }
}

// 남의 IP·실존인물 차단(스티커와 동일 정책)
const BLOCKED = [
  "피카츄", "pikachu", "포켓몬", "pokemon", "마리오", "mario", "디즈니", "disney", "미키", "mickey",
  "짱구", "도라에몽", "doraemon", "카카오프렌즈", "라이언", "어피치", "라인프렌즈", "브라운", "코니",
  "산리오", "sanrio", "헬로키티", "hello kitty", "마블", "marvel", "스파이더맨", "spider-man", "배트맨",
  "batman", "슈퍼맨", "superman", "원피스", "루피", "나루토", "naruto", "귀멸", "케데헌",
  "대통령", "president", "김정은", "트럼프", "trump", "머스크", "musk",
  "bts", "방탄소년단", "블랙핑크", "blackpink", "뉴진스", "아이유", "손흥민",
];
function ipGuard(p: string): string | null {
  const s = p.toLowerCase();
  const hit = BLOCKED.find((w) => s.includes(w.toLowerCase()));
  return hit || null;
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
  } catch { return false; }
}

// 썸네일 톤 — 스티커(투명 다이컷)와 달리 '표지/포스터' 느낌. 글자 없음, 실존인물·로고 없음.
const STYLE = "editorial poster-style illustration, bold eye-catching composition, vivid dramatic lighting, "
  + "clean modern graphic design, high contrast, no text, no letters, no watermark, no real logos, no real people faces";

const SIZES: Record<string, string> = { portrait: "1024x1536", landscape: "1536x1024", square: "1024x1024" };

async function uploadR2(bytes: Uint8Array, key: string) {
  const url = `https://${CF_ACCOUNT}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
  const res = await r2.fetch(url, {
    method: "PUT",
    headers: { "content-type": "image/png", "cache-control": "public, max-age=31536000, immutable" },
    body: bytes,
  });
  if (!res.ok) throw new Error(`r2_${res.status}`);
  return `${R2_PUBLIC_URL}/${key}`;
}
async function aiBudgetOk(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/rpc/ai_budget_take`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SVC_KEY, Authorization: `Bearer ${SVC_KEY}` },
      body: JSON.stringify({ p_fn: "generate-thumbnail", p_n: 1 }),
    });
    if (!r.ok) return true;
    const d = await r.json();
    return !(d && d.ok === false);
  } catch { return true; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const me = callerUid(req);
  if (!me) return j({ error: "auth" }, 401);

  let body: { prompt?: string; ratio?: string };
  try { body = await req.json(); } catch { return j({ error: "bad_json" }, 400); }
  const prompt = String(body.prompt || "").trim().slice(0, 300);
  const size = SIZES[String(body.ratio || "portrait")] || SIZES.portrait;
  if (prompt.length < 2) return j({ error: "prompt_short" }, 400);

  const ip = ipGuard(prompt);
  if (ip) return j({ error: "blocked_ip", word: ip }, 400);
  if (await moderate(prompt)) return j({ error: "blocked_moderation" }, 400);

  // 유저 24h 한도
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await sb.from("my_thumbnails").select("id", { count: "exact", head: true })
    .eq("user_id", me).gte("created_at", since);
  if ((count || 0) >= USER_DAILY_LIMIT) return j({ error: "user_daily_limit", limit: USER_DAILY_LIMIT }, 429);
  // 플랫폼 일일 캡
  if (!(await aiBudgetOk())) return j({ error: "ai_daily_cap" }, 429);

  // 🧠 크리에이터 브레인 — 검증된 썸네일 구도 공식 주입(어그로 클릭률↑). 없으면 기본 STYLE만.
  let patternText = "";
  try {
    const { data: pats } = await sb.from("creator_patterns").select("formula")
      .eq("kind", "thumbnail").eq("active", true).order("weight", { ascending: false }).limit(2);
    if (pats && pats.length) patternText = " Composition rules: " + pats.map((p: any) => p.formula).join("; ") + ".";
  } catch { /* */ }

  try {
    const r = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${prompt}.${patternText} ${STYLE}`,
        n: 1, size, quality: "medium", output_format: "png", moderation: "auto",
      }),
    });
    const d = await r.json();
    if (!r.ok || !d?.data?.length) {
      console.error("[thumb] openai", r.status, JSON.stringify(d?.error || d).slice(0, 300));
      return j({ error: "generate_failed", detail: d?.error?.message || `http_${r.status}` }, 502);
    }
    const b64 = d.data[0].b64_json as string;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const key = `thumbnails/${me}/${crypto.randomUUID()}.png`;
    const url = await uploadR2(bytes, key);
    try { await sb.from("my_thumbnails").insert({ user_id: me, url, prompt, kind: "thumbnail" }); } catch (_) {}
    return j({ ok: true, url });
  } catch (e) {
    console.error("[thumb]", e);
    return j({ error: "server", detail: String(e).slice(0, 200) }, 500);
  }
});
