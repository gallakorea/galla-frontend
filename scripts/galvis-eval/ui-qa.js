/* 🤖 갈비스 화면 자동 QA — 로그인된 앱 화면(app.html)에서 실제로 누르며 주기 전체를 검사한다.
   사용: 페이지에서 `await (await import('/scripts/galvis-eval/ui-qa.js')).run()` → 단계별 합격/불합격 목록.
   (26.9.22 사장님: 「이런 거 하나하나 내가 찾아서 검수해야 해? 네가 자동으로 QA 하라고」)
   ⚠️ 실제 서버(galla-friend)를 부른다 — 레드팀 풀 계정 세션으로만 돌린다. */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 30000) { const t = Date.now(); while (Date.now() - t < ms) { try { const v = fn(); if (v) return v; } catch (_) {} await wait(300); } return null; }
const surf = () => (document.body.className.match(/fr-sf-(\w+)/) || [])[1] || "";
const msgs = () => [...document.querySelectorAll("#frSheet .fr-msg")];
const lastBot = () => { const a = msgs().filter((m) => m.classList.contains("fr-a")); return a[a.length - 1]; };
const cardsIn = (root) => [...(root || document).querySelectorAll(".fr-card, .fr-tc")];

async function send(text) {
  const before = msgs().length;
  const ta = document.querySelector("#frSheet .fr-input textarea");
  ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector("#frSheet .fr-send").click();
  // 답이 붙고 입력 중 표시가 사라질 때까지
  await until(() => msgs().length >= before + 2 && !document.querySelector("#frSheet .fr-typing"), 45000);
  await wait(1800);   // 카드·문장 연출
}

export async function run() {
  const R = [];
  window.__qaLive = R;
  const ok = (step, pass, info) => { R.push({ step, pass: !!pass, info: info || "" }); };
  try {
    // 1) 대화창 열기
    if (surf() !== "sheet") { (window.GALLA_openFriend || (() => document.getElementById("frOrb").click()))(); }
    ok("1 대화창 열림", await until(() => surf() === "sheet", 8000), surf());
    await wait(2500);

    // 2) 수다 — 카드 없어야
    await send("오늘 좀 피곤하다");
    const b2 = lastBot();
    ok("2 수다 답이 온다", b2 && b2.textContent.trim().length > 1, b2 && b2.textContent.slice(0, 50));
    ok("2 수다엔 카드 없음", !cardsIn(b2).length, `카드 ${cardsIn(b2).length}장`);

    // 3) 콘텐츠 요청 — 카드·사진
    await send("웃긴 영상 보여줘");
    const b3 = await until(() => { const b = lastBot(); return cardsIn(b).length ? b : null; }, 15000) || lastBot();
    const c3 = cardsIn(b3);
    ok("3 요청에 카드가 붙는다", c3.length >= 1, `카드 ${c3.length}장 · ${b3 && b3.textContent.slice(0, 40)}`);
    const img3 = c3.filter((c) => c.querySelector("img") || /background-image/.test(c.innerHTML)).length;
    ok("3 카드에 사진", img3 >= 1, `사진 있는 카드 ${img3}/${c3.length}`);
    const title3 = c3.map((c) => c.textContent.trim().slice(0, 20));
    ok("3 빈 제목(이거) 카드 없음", !title3.some((t) => /^이거/.test(t)), title3.join(" | "));

    // 4) 카드 누르기 → 페이지 + 아일랜드(하던 대화)
    const startUrl = location.href;
    if (c3[0]) c3[0].click();
    const isl = await until(() => surf() === "island" && document.querySelector("#frAssist.on"), 8000);
    ok("4 카드 누르면 아일랜드로", !!isl, `상태 ${surf()}`);
    await wait(2500);
    const asEl = document.getElementById("frAssist");
    const quick = asEl ? asEl.querySelectorAll(".fra-q").length : -1;
    ok("4 아일랜드에 「세 줄 요약」 같은 버튼 없음(대화에서 왔으니)", quick === 0, `버튼 ${quick}개`);
    const asTxt = asEl ? (asEl.querySelector(".fra-msg") || {}).textContent || "" : "";
    ok("4 아일랜드가 하던 대화를 보여준다", asTxt.trim().length > 0, asTxt.slice(0, 60));
    ok("4 콘텐츠 화면으로 이동", location.href !== startUrl || !!document.querySelector(".hottube-player, iframe, video, .hp-player"), location.href.replace(location.origin, ""));

    // 5) 떠나기(뒤로) → 캡슐 유지
    history.back();
    const away = await until(() => document.querySelector("#frAssist.on.fri-away"), 9000);
    ok("5 떠나도 아일랜드가 캡슐로 남는다", !!away, `상태 ${surf()} · ${(document.querySelector("#frAssist .fri-tick") || {}).textContent || ""}`);
    ok("5 오브만 덩그러니 남지 않음", surf() !== "orb", surf());

    // 6) 캡슐 누르기 → 풀 대화, 카드·사진 그대로
    const cap = document.querySelector("#frAssist .fri-cap"); if (cap) cap.click();
    ok("6 캡슐 누르면 풀 대화로", await until(() => surf() === "sheet", 6000), surf());
    await wait(1500);
    const allCards = cardsIn(document.getElementById("frSheet"));
    const imgs = allCards.filter((c) => c.querySelector("img[src^='http']")).length;
    ok("6 돌아와도 카드가 남아 있다", allCards.length >= 1, `카드 ${allCards.length}장`);
    ok("6 돌아와도 사진이 남아 있다", imgs >= 1, `사진 ${imgs}장`);

    // 7) 맛집 — 갈라 맛집 카드(네이버 링크 아님)
    await send("강남역 근처 맛집 추천해줘");
    const b7 = await until(() => { const b = lastBot(); return cardsIn(b).length ? b : null; }, 15000) || lastBot();
    const c7 = cardsIn(b7);
    const naver = c7.filter((c) => /naver\.com|네이버/.test(c.outerHTML)).length;
    ok("7 맛집 요청에 카드", c7.length >= 1, `카드 ${c7.length}장 · ${b7 && b7.textContent.slice(0, 40)}`);
    ok("7 갈라 맛집(네이버 링크 아님)", c7.length >= 1 && naver === 0, `네이버 링크 ${naver}장`);
  } catch (e) { ok("실행 오류", false, String(e && e.message || e)); }
  const pass = R.filter((r) => r.pass).length;
  return { pass, total: R.length, results: R };
}
