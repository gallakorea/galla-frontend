// 🌐 콘텐츠 번역 — 인스타·X처럼 '읽는 사람이 눌러서' 번역한다.
//
//  왜 이 방식인가
//   · 미리 전량 번역하면 아무도 안 볼 글까지 번역해 비용이 폭발한다.
//   · 대신 요청 시 번역하고 **캐시**한다 — 같은 글을 100명이 봐도 번역은 1번.
//   · 원문은 절대 건드리지 않는다. 번역은 '보기 옵션'이지 콘텐츠 교체가 아니다.
//
//  ⚠️ 남용 방지: 유저별 일일 글자수 한도(translate_gate). 없으면 우리 API가 남의 번역기가 된다.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { logSpend } from "../_shared/spend.ts";

const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const API_KEY = Deno.env.get("DEEPSEEK_API_KEY") || Deno.env.get("OPENAI_API_KEY") || "";
const BASE_URL = Deno.env.get("AI_BASE_URL") || "https://api.deepseek.com/v1";
const MODEL = Deno.env.get("TRANSLATE_MODEL") || "deepseek-chat";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const NAME: Record<string, string> = {
  ko: "Korean", en: "English", ja: "Japanese",
  "zh-TW": "Traditional Chinese (Taiwan)", "zh-HK": "Traditional Chinese (Hong Kong)", "zh-CN": "Simplified Chinese",
};

async function sha(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].slice(0, 12).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind || "").slice(0, 20);
    const refId = String(body?.ref_id || "").slice(0, 64);
    const field = String(body?.field || "body").slice(0, 20);
    const text = String(body?.text || "");
    const dst = String(body?.to || "").slice(0, 8);
    const src = String(body?.from || "").slice(0, 8);

    if (!text.trim() || !dst || !NAME[dst]) return json({ ok: false, reason: "bad_request" }, 400);
    // 같은 언어면 번역할 게 없다(클라가 잘못 부른 것 — 조용히 원문을 돌려준다)
    if (src && src === dst) return json({ ok: true, text, cached: true, same: true });

    const cfg = await supa.from("app_settings").select("v").eq("k", "translate_limits").maybeSingle();
    const maxLen = Number(cfg.data?.v?.max_len ?? 4000);
    if (text.length > maxLen) return json({ ok: false, reason: "too_long", max: maxLen }, 413);

    const h = await sha(text);

    // ① 캐시 — 이게 이 기능의 핵심이다. 원문이 수정되면 해시가 달라져 자동으로 다시 번역된다.
    if (kind && refId) {
      const { data: hit } = await supa.from("translations")
        .select("text").eq("kind", kind).eq("ref_id", refId).eq("field", field)
        .eq("dst_locale", dst).eq("src_hash", h).maybeSingle();
      if (hit?.text) return json({ ok: true, text: hit.text, cached: true });
    }

    // ② 한도 — 로그인 유저만 번역할 수 있다(익명 남용 차단)
    const auth = req.headers.get("Authorization") || "";
    const jwt = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    let uid: string | null = null;
    try { const { data } = await supa.auth.getUser(jwt); uid = data?.user?.id ?? null; } catch { /* */ }
    if (!uid) return json({ ok: false, reason: "auth" }, 401);

    const { data: gate } = await supa.rpc("translate_gate", { p_uid: uid, p_chars: text.length });
    if (gate && gate.ok === false) return json({ ok: false, reason: gate.reason, ...gate }, 429);

    if (!API_KEY) return json({ ok: false, reason: "no_key" }, 500);

    // ③ 번역 — 말투·이모지·줄바꿈을 살린다. 커뮤니티 글은 격식체로 옮기면 완전히 다른 글이 된다.
    /* ⚠️ "이미 그 언어면 그대로 두라"는 규칙을 넣었더니 **일본어 요청에서 한국어 원문을 그대로 반환**했다
       (모델이 그 예외를 잘못 적용). 출발 언어를 명시하고 예외 규칙을 없앤다. */
    const from = src && NAME[src] ? NAME[src] : "the source language";
    const sys = `Translate the user's social-media post from ${from} into ${NAME[dst]}.
Rules:
- Output MUST be written in ${NAME[dst]}. Never return the original text untranslated.
- Keep the register casual if the original is casual. Do not make it formal or polished.
- Preserve emojis, line breaks, @mentions, #hashtags and URLs exactly.
- Do not explain, annotate, or add anything. Output ONLY the translation.
- Keep proper nouns (GALLA, product names, people) as-is unless they have a standard local form.`;

    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL, temperature: 0.2, max_tokens: Math.min(2000, Math.ceil(text.length * 1.6) + 200),
        messages: [{ role: "system", content: sys }, { role: "user", content: text }],
      }),
    });
    if (!r.ok) return json({ ok: false, reason: "llm", detail: (await r.text()).slice(0, 200) }, 502);
    const j = await r.json();
    logSpend("translate", MODEL, null, j?.usage);   // 💰 원가 장부 — 크론은 주인이 없어 uid=null
    let out = String(j?.choices?.[0]?.message?.content || "").trim();
    if (!out) return json({ ok: false, reason: "empty" }, 502);

    /* 🔤 '진짜 그 언어로 왔는가'를 문자로 검증한다.
       ⚠️ 문자열이 원문과 다른지만 보면 못 잡는다 — 실측: 일본어 요청에 한국어를 살짝 고쳐서 돌려줬다
          ("것 같아요"→"것 같네요"). 글자 종류를 봐야 확실하다. */
    const looksLike = (t: string, loc: string): boolean => {
      const hangul = (t.match(/[가-힣]/g) || []).length;
      const kana = (t.match(/[ぁ-んァ-ヶ]/g) || []).length;
      const han = (t.match(/[一-鿿]/g) || []).length;
      const latin = (t.match(/[A-Za-z]/g) || []).length;
      if (loc === "ja") return kana >= 2 && hangul <= kana;         // 일본어는 가나가 반드시 섞인다
      if (loc.startsWith("zh")) return han >= 2 && hangul === 0;    // 중국어에 한글이 있으면 실패한 것
      if (loc === "ko") return hangul >= 2;
      if (loc === "en") return latin >= 4 && hangul === 0 && kana === 0;
      return true;
    };
    const same = out.replace(/\s+/g, "") === text.replace(/\s+/g, "");
    if (same || !looksLike(out, dst)) {
      const r2 = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
        body: JSON.stringify({
          model: MODEL, temperature: 0.3, max_tokens: Math.min(2000, Math.ceil(text.length * 1.6) + 200),
          messages: [
            { role: "system", content: `You are a professional translator. The input is ${from}. Rewrite it entirely in ${NAME[dst]}.\nOutput must use ${NAME[dst]} script/characters. Do not output any ${from} text. Output ONLY the translation.` },
            { role: "user", content: text },
          ],
        }),
      });
      if (r2.ok) {
        const j2 = await r2.json();
        logSpend("translate", MODEL, null, j2?.usage);   // 💰 원가 장부 — 크론은 주인이 없어 uid=null
        const o2 = String(j2?.choices?.[0]?.message?.content || "").trim();
        if (o2 && looksLike(o2, dst)) out = o2;
      }
      /* 두 번 시도해도 그 언어가 아니면 **번역 실패를 솔직히 알린다.**
         원문을 번역인 척 돌려주면 유저는 버튼이 고장 난 줄 안다. */
      if (!looksLike(out, dst)) return json({ ok: false, reason: "not_translated", text }, 502);
    }

    // ④ 캐시에 저장 — 실패해도 번역 결과는 돌려준다(캐시는 최적화지 필수가 아니다)
    if (kind && refId) {
      try {
        await supa.from("translations").upsert({
          kind, ref_id: refId, field, src_locale: src || "auto", dst_locale: dst,
          src_hash: h, text: out, chars: text.length,
        }, { onConflict: "kind,ref_id,field,dst_locale,src_hash" });
      } catch { /* */ }
    }
    return json({ ok: true, text: out, cached: false });
  } catch (e) {
    return json({ ok: false, reason: "error", detail: String(e).slice(0, 200) }, 500);
  }
});
