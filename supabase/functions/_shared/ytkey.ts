// 유튜브 API 키 **여러 개를 돌려쓴다**.
//
// 왜: 유튜브 무료 할당량은 프로젝트당 하루 10,000유닛이고 돈으로 못 늘린다(심사 신청만 가능).
// 키가 하나면 소진되는 순간 수집이 통째로 멈춘다. 계정이 여럿이면 키도 여럿이니 돌려쓰면 된다.
//
// 📌 지금 등록된 키 (2026-09-04)
//   1) galla-youtube        · 갈라랩스 **메인** 계정(주식회사 갈라랩스) ← 평소엔 이것만 쓴다
//   2) galla-youtube-2      · blackid@gmail.com **스페어** 계정 ← 1)이 소진될 때만 넘어간다
//   순서가 곧 우선순위다. 스페어를 앞에 두지 말 것 — 메인이 놀고 스페어만 닳는다.
//   대량 수집(번역·영상 백필)이 끝나면 유튜브 호출은 크게 줄어든다. 그때는 1) 하나로 충분하고
//   2)는 예비로만 남는다. 굳이 지우지 않는다 — 나중에 또 백필할 때 다시 쓴다.
//
// 쓰는 법: 시크릿 YOUTUBE_API_KEY 에 **쉼표로 여러 개**를 넣는다.
//   YOUTUBE_API_KEY="AIza...첫번째,AIza...두번째,AIza...세번째"
// 키 하나가 quotaExceeded 를 내면 다음 키로 넘어가고, 전부 소진돼야 실패를 올린다.
//
// ⚠️ 403 은 할당량을 **소비하지 않는다**. 그래서 매 콜드스타트마다 첫 키부터 다시 시도해도
//    손해가 없다 — 상태를 DB 에 저장하는 복잡함을 안 들여도 된다.
// ⚠️ 403 이라고 다 할당량은 아니다(키 제한·API 미설정도 403). 본문에서 quotaExceeded /
//    dailyLimitExceeded 를 확인했을 때만 다음 키로 넘어간다. 아니면 그대로 올린다.

const KEYS = (Deno.env.get("YOUTUBE_API_KEY") || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

let idx = 0;

export const ytKeyCount = () => KEYS.length;
export const ytKeyIndex = () => idx;
export const ytKey = () => KEYS[idx] || "";

/** 유튜브 API 호출 — 할당량이 끝나면 다음 키로 자동 전환한다. */
export async function ytFetch(u: URL | string): Promise<Response> {
  const url = typeof u === "string" ? new URL(u) : u;
  if (!KEYS.length) return new Response('{"error":"no_youtube_key"}', { status: 500 });

  for (;;) {
    url.searchParams.set("key", KEYS[idx]);
    const r = await fetch(url);
    if (r.status !== 403) return r;

    /* 본문을 봐야 '할당량'인지 '키 문제'인지 갈린다. clone 으로 읽어야 호출부가 다시 읽을 수 있다. */
    let body = "";
    try { body = await r.clone().text(); } catch (_) { /* 본문 못 읽으면 그냥 올린다 */ }
    const quota = /quotaExceeded|dailyLimitExceeded|rateLimitExceeded/.test(body);
    if (!quota || idx + 1 >= KEYS.length) return r;   // 키 문제거나 마지막 키면 그대로
    idx++;                                            // 다음 키로
  }
}
