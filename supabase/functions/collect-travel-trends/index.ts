// 여행지 검색 트렌드 — 사장님: "지금 가장 인기 있고 검색량 많은 여행지를 보여주자"
//
// 🔍 구글 트렌드는 **공식 공개 API 가 없다**. 우리가 이미 쓰는 trends.google.com RSS 는
//    '오늘의 급상승 전체 키워드'라 여행지가 거의 안 잡힌다(연예·스포츠가 대부분).
//    → 네이버 데이터랩 검색어트렌드를 쓴다. 공식 API 이고 무료이며,
//      우리 기존 네이버 키로 바로 200 이 떨어진다(실측 — 신청 절차조차 없었다).
//      한국인의 여행 검색을 보는 데는 네이버가 더 정확하기도 하다.
//
// ⚠️ 데이터랩 값은 **절대 검색량이 아니라 그 요청 안에서의 상대값(0~100)** 이다.
//    요청이 다르면 값을 그대로 비교할 수 없다 — 배치마다 1위가 100이 되어
//    "전부 100인 표"가 나온다. 그래서 매 요청에 **앵커 키워드**를 끼우고 앵커 기준으로 정규화한다.
//    앵커는 사시사철 검색량이 큰 '일본여행'을 쓴다(계절을 타지만 가장 안정적이다).
// ⚠️ 그룹은 요청당 최대 5개. 앵커를 빼면 실제로는 회차당 4개 나라씩 돈다.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supa = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") || "";
const ID = Deno.env.get("NAVER_SEARCH_ID") || Deno.env.get("NAVER_CLIENT_ID") || "";
const SEC = Deno.env.get("NAVER_SEARCH_SECRET") || Deno.env.get("NAVER_CLIENT_SECRET") || "";

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const ANCHOR = { code: "JP", name: "일본", keywords: ["일본여행", "도쿄여행", "오사카여행"] };

/* 나라 이름 → 검색 키워드. '대한민국여행'은 아무도 안 친다 — 국내는 '국내여행'이 실제 표현이다. */
function keywordsFor(name: string) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (n === "대한민국") return { title: "국내여행", keywords: ["국내여행", "국내 여행지"] };
  const base = n.replace(/\s+/g, "");
  return { title: base + "여행", keywords: [base + "여행", base + " 여행"] };
}

async function datalab(groups: any[], from: string, to: string) {
  const r = await fetch("https://openapi.naver.com/v1/datalab/search", {
    method: "POST",
    headers: { "X-Naver-Client-Id": ID, "X-Naver-Client-Secret": SEC,
               "Content-Type": "application/json" },
    body: JSON.stringify({ startDate: from, endDate: to, timeUnit: "month",
                           keywordGroups: groups }),
  });
  if (!r.ok) throw new Error(`datalab_${r.status}:${(await r.text()).slice(0, 120)}`);
  return await r.json();
}

Deno.serve(async (req) => {
  const xcron = req.headers.get("x-cron-secret") || "";
  const auth = req.headers.get("authorization") || "";
  if (CRON_SECRET && xcron !== CRON_SECRET && !auth.includes(CRON_SECRET)) {
    return j({ ok: false, reason: "unauthorized" }, 401);
  }
  if (!ID || !SEC) return j({ ok: false, reason: "no_naver_key" }, 500);

  const url = new URL(req.url);
  const batches = Math.min(Number(url.searchParams.get("batches") || "6"), 12);

  /* 대상: 우리 DB 에 장소가 있는 나라. 없는 나라의 검색량은 우리 화면에서 쓸 데가 없다. */
  const { data: rows } = await supa
    .from("travel_places")
    .select("country_code,country")
    .eq("status", "live").not("country", "is", null)
    .limit(4000);
  const byCode = new Map<string, string>();
  for (const r of ((rows || []) as any[])) {
    if (r.country_code && !byCode.has(r.country_code)) byCode.set(r.country_code, r.country);
  }
  const targets = [...byCode.entries()].filter(([c]) => c !== ANCHOR.code);

  /* 최근 13개월 — 직전 달 대비 증감을 내려면 최소 두 달이 필요하고,
     계절성을 보려면 1년이 있어야 한다. */
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().slice(0, 10);
  const from = new Date(now.getFullYear() - 1, now.getMonth(), 1).toISOString().slice(0, 10);

  const items: any[] = [];
  const log: string[] = [];
  let done = 0;

  for (let b = 0; b < batches && done < targets.length; b++) {
    const chunk = targets.slice(done, done + 4);
    done += chunk.length;
    const groups: any[] = [{ groupName: ANCHOR.name, keywords: ANCHOR.keywords }];
    const meta: Record<string, string> = {};
    for (const [code, name] of chunk) {
      const k = keywordsFor(name);
      if (!k) continue;
      groups.push({ groupName: k.title, keywords: k.keywords });
      meta[k.title] = code;
    }
    if (groups.length < 2) continue;

    try {
      const d = await datalab(groups, from, to);
      const res = d?.results || [];
      const anchor = res.find((x: any) => x.title === ANCHOR.name);
      /* 앵커의 최신 달 값으로 나눠 배치 간 비교가 되게 만든다. */
      const aLast = anchor?.data?.length ? Number(anchor.data[anchor.data.length - 1].ratio) : 0;
      if (!aLast) { log.push("앵커 값 0 — 정규화 불가"); continue; }

      for (const g of res) {
        const code = meta[g.title];
        if (!code || !g.data?.length) continue;
        for (const p of g.data) {
          items.push({
            scope: "country", code, keyword: g.title, period: p.period,
            raw: p.ratio,
            /* 앵커(일본여행) 최신 달을 100 으로 놓은 눈금 */
            ratio: Math.round((Number(p.ratio) / aLast) * 1000) / 10,
          });
        }
      }
      /* 앵커 자신도 저장한다 — 일본이 표에서 빠지면 이상하다 */
      if (anchor?.data?.length) {
        for (const p of anchor.data) {
          items.push({ scope: "country", code: ANCHOR.code, keyword: "일본여행",
                       period: p.period, raw: p.ratio,
                       ratio: Math.round((Number(p.ratio) / aLast) * 1000) / 10 });
        }
      }
      log.push(`${chunk.map((c) => c[1]).join("·")} ok`);
    } catch (e) {
      log.push(`${chunk.map((c) => c[1]).join("·")} 실패 ${String(e).slice(0, 60)}`);
    }
    await sleep(300);          // 네이버 호출 간격
  }

  let saved = 0;
  for (let i = 0; i < items.length; i += 300) {
    const { data } = await supa.rpc("travel_trends_save", { p_items: items.slice(i, i + 300) });
    saved += Number(data || 0);
  }
  return j({ ok: true, targets: targets.length, batched: done, saved, log: log.slice(0, 12) });
});
