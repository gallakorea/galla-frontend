/* 🖱 버튼 클릭 결과 감사 — "핸들러가 닿는가"를 넘어 **누르면 실제로 무슨 일이 나는가**를 본다.
 *   (닿는지 여부만 볼 거면 scripts/audit-buttons.js)
 *
 * 로그인한 상태로 2,000개를 그냥 누르면 삭제·탈퇴·출금까지 실행된다. 그래서 쓰기를 막고 누른다:
 *   · fetch/XHR 의 비 GET 요청은 전부 가로채 `{}` 를 돌려준다(네트워크로 안 나간다)
 *   · confirm 은 항상 false(파괴적 확인 차단), alert/prompt/open 은 기록만
 *   · iframe sandbox 에 allow-top-navigation 을 주지 않는다 —
 *     안 주면 iframe 안 버튼이 최상위 창을 이동시켜 감사가 통째로 날아간다(실측).
 *
 * 잡는 것: 클릭이 던진 예외 · unhandledrejection · console.error · DOM 무변화(무반응 후보).
 *
 * ⚠️ 쓰기를 막았기 때문에 **하네스가 만드는 오탐**이 있다.
 *    Supabase 의 .rpc() 는 POST 라서 조회도 막힌다 → 목록이 비거나 응답 모양이 달라져
 *    "상자를 여는 데 실패했어요" 같은 정상 에러 처리나 TypeError 가 뜬다.
 *    보고 전에 반드시 소스로 확인할 것. 실제로 이걸 진짜 버그로 오인할 뻔했다.
 *
 * ⚠️ 무반응(noEffect) 은 innerHTML 길이 비교라 거칠다 — 토스트가 80ms 안에 사라지거나
 *    같은 길이로 바뀌면 무반응으로 잡힌다. 후보일 뿐 결론이 아니다.
 *
 * 쓰는 법(브라우저 콘솔, 로그인 상태):
 *   await __clickPage("dm")        // 한 페이지, 네비로 끊기면 자동 재개
 *   for (const p of [...]) console.log(await __clickPage(p));
 */
/* 🔴 iframe 안의 alert 는 **렌더러 프로세스 전체**를 멈춘다 — 상위 창까지 같이 얼어서
   감사가 끝난 뒤에도 앱이 응답하지 않는다(실측: 네이티브 앱이 "Invalid issue access." 에서 정지,
   CDP evaluate 가 통째로 타임아웃). sandbox 에 allow-modals 를 주는 한 iframe 쪽 override 만으론
   부족할 때가 있으니(로드 직후 즉시 alert), **상위 창의 dialog 도 미리 죽여 둔다.**
   또 하네스가 만든 iframe 이 남아 있으면 계속 alert 를 던지므로 시작할 때 싹 걷어낸다. */
function muteTopDialogs() {
  if (window.__topDialogsMuted) return;
  window.__topDialogsMuted = [];
  const rec = k => (...a) => { window.__topDialogsMuted.push(k + ":" + String(a[0]).slice(0, 40)); return k === "confirm" ? false : (k === "prompt" ? null : undefined); };
  window.alert = rec("alert"); window.confirm = rec("confirm"); window.prompt = rec("prompt");
}
function sweepHarnessFrames() {
  document.querySelectorAll("iframe[data-galla-audit]").forEach(f => f.remove());
}

async function clickRun(page, start, max) {
  start = start || 0; max = max || 40;
  muteTopDialogs();
  sweepHarnessFrames();
  const f = document.createElement("iframe");
  f.setAttribute("data-galla-audit", "1");
  /* allow-modals 를 주지 않는다 — 주면 iframe 의 alert 가 렌더러를 멈춘다. */
  f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  f.style.cssText = "position:fixed;left:-9999px;width:420px;height:900px";
  document.body.appendChild(f);
  /* ⚠️ 이 WebView 에선 iframe 의 onload 가 **아예 안 뜬다**(실측 — 내용은 잘 들어와 있다).
     onload 만 믿으면 라운드마다 7초를 통째로 버리고, 그 부담으로 다음 페이지가
     빈 문서로 뜬다(plaza 214개 → 14개, index 0개). readyState 를 직접 본다. */
  f.src = "/" + (page.includes(".html") ? page : page + ".html");
  const loaded = (async () => {
    for (let i = 0; i < 90; i++) {
      await new Promise(r => setTimeout(r, 100));
      try { if (f.contentDocument && f.contentDocument.readyState === "complete" && f.contentDocument.body) return true; } catch (_) {}
    }
    return false;
  })();
  // 콘텐츠를 원격에서 받아 그리는 페이지(news·gallari·plaza)는 1.3초면 목록 전에 스냅된다
  // — 버튼이 2~4개만 잡혔다(실측). 넉넉히 기다린다.
  await loaded; await new Promise(r => setTimeout(r, 3200));
  const w = f.contentWindow, d = f.contentDocument;
  if (!w || !d) { f.remove(); return { page, error: "문서 접근 불가" }; }

  const log = { errors: [], cerrors: [], writes: [], dialogs: [] };
  const of = w.fetch;
  w.fetch = function (u, o) {
    const m = ((o && o.method) || "GET").toUpperCase();
    if (m !== "GET" && m !== "HEAD") { log.writes.push(m + " " + String(u && u.url ? u.url : u).split("/").slice(-2).join("/").slice(0, 44)); return Promise.resolve(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })); }
    return of.call(this, u, o);
  };
  const oO = w.XMLHttpRequest.prototype.open, oS = w.XMLHttpRequest.prototype.send;
  w.XMLHttpRequest.prototype.open = function (m) { if (String(m).toUpperCase() !== "GET") { log.writes.push("XHR " + m); this.__b = 1; } return oO.apply(this, arguments); };
  w.XMLHttpRequest.prototype.send = function () { if (this.__b) return; return oS.apply(this, arguments); };
  w.confirm = m => { log.dialogs.push("confirm:" + String(m).slice(0, 34)); return false; };
  w.alert = m => { log.dialogs.push("alert:" + String(m).slice(0, 34)); };
  w.prompt = () => null; w.open = () => null;
  w.addEventListener("error", e => log.errors.push(String(e.message).slice(0, 78)));
  w.addEventListener("unhandledrejection", e => log.errors.push("reject:" + String(e.reason).slice(0, 68)));
  const oce = w.console.error;
  w.console.error = function () { log.cerrors.push([...arguments].map(String).join(" ").slice(0, 78)); return oce.apply(this, arguments); };

  const loc = () => { try { return (f.contentDocument && f.contentDocument.location) ? f.contentDocument.location.href : null; } catch (e) { return null; } };
  const href0 = loc();
  /* ⚠️ 네비 스킵을 `closest('[data-page]')` 로 하면 안 된다 — body 에 data-page 가 있어서
     모든 버튼이 걸러진다(0개 검사됨). 요소 자신 또는 네비 컨테이너만 본다. */
  /* ⚠️ button/[role=button] 만 보면 **설정·마이페이지가 통째로 빠진다** — 거기 컨트롤은
     대부분 <a> 나 [onclick] 이다(실측: settings 가 3개로 잡혔다). 눌리는 것을 다 본다.
     외부로 나가는 링크(http로 시작·target=_blank·download)는 제외 — 감사가 딴 데로 샌다. */
  const CLICKABLE = 'button,[role="button"],a[href],[onclick],input[type="button"],input[type="submit"],summary,label[for]';
  /* 태그로만 고르면 여전히 샌다 — 설정의 행은 그냥 <div class="st-item"> 이다(13개가 통째로 빠졌다).
     그래서 **cursor:pointer 인 요소**도 후보에 넣는다: 눌리는 것에 포인터를 주는 게 이 코드베이스의 관례다.
     대신 부모가 이미 후보면 자식은 뺀다(같은 클릭을 두 번 세지 않게). */
  const tagged = [...d.querySelectorAll(CLICKABLE)];
  const pointer = [...d.querySelectorAll("body *")].filter(e => {
    if (tagged.includes(e)) return false;
    if (w.getComputedStyle(e).cursor !== "pointer") return false;
    return !e.parentElement || w.getComputedStyle(e.parentElement).cursor !== "pointer";
  });
  const all = [...tagged, ...pointer].filter(e => {
    if (e.tagName === "A") {
      const h = e.getAttribute("href") || "";
      if (/^(https?:)?\/\//i.test(h) || /^(mailto|tel|intent):/i.test(h)) return false;   // 외부
      if (e.target === "_blank" || e.hasAttribute("download")) return false;
    }
    if (e.matches(".nav-item,.logo")) return false;
    if (e.closest(".nav,.nav-inner,.tabbar,.bottom-nav,#nav")) return false;
    const r = e.getBoundingClientRect(), st = w.getComputedStyle(e);
    return r.width && r.height && st.display !== "none" && st.visibility !== "hidden" && st.pointerEvents !== "none";
  });
  const withErr = [], noEffect = []; let clicked = 0, navigated = false, detached = false;
  for (const el of all.slice(start, start + max)) {
    if (!el.isConnected) { clicked++; continue; }
    const lbl = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18) || "(빈)";
    const e0 = log.errors.length, c0 = log.cerrors.length;
    let h0 = 0; try { h0 = f.contentDocument.body.innerHTML.length; } catch (e) { detached = true; break; }
    try { el.click(); } catch (er) { log.errors.push("throw@" + lbl + ":" + String(er).slice(0, 44)); }
    await new Promise(r => setTimeout(r, 80));
    clicked++;
    const cur = loc(); if (cur === null) { detached = true; break; }
    if (cur !== href0) { navigated = true; break; }
    const ne = log.errors.length - e0, nc = log.cerrors.length - c0;
    let h1 = h0; try { h1 = f.contentDocument.body.innerHTML.length; } catch (e) { detached = true; break; }
    if (ne || nc) withErr.push(lbl + " ← " + (log.errors.slice(e0).concat(log.cerrors.slice(c0))[0] || "").slice(0, 54));
    else if (h1 === h0) noEffect.push(lbl);
  }
  f.remove();
  return { page, total: all.length, clicked, navigated, detached, errCount: withErr.length, withErr,
    noEffectCount: noEffect.length, noEffect, dialogs: [...new Set(log.dialogs)], writes: [...new Set(log.writes)].slice(0, 4) };
}

/* 네비게이션으로 끊기면 다음 인덱스부터 새 iframe 으로 재개한다.
   안 그러면 첫 네비 버튼에서 그 페이지 검사가 통째로 끝난다(dm 이 3/23 에서 멈췄다). */
async function __clickPage(page) {
  let start = 0, rounds = 0;
  const agg = { page, total: 0, clicked: 0, errCount: 0, withErr: [], noEffectCount: 0, noEffect: [], dialogs: [], writes: [], resumes: 0 };
  while (rounds++ < 14) {   // 네비 버튼이 많은 페이지는 5라운드로 절반도 못 본다(home 39개 중 21개에서 끊겼다)
    const r = await clickRun(page, start, 40);
    if (r.error) { agg.error = r.error; break; }
    agg.total = r.total; agg.clicked += r.clicked; agg.errCount += r.errCount; agg.withErr.push(...r.withErr);
    agg.noEffectCount += r.noEffectCount; agg.noEffect.push(...r.noEffect);
    agg.dialogs.push(...r.dialogs); agg.writes.push(...r.writes);
    start += Math.max(r.clicked, 1);
    if (start >= r.total) break;
    agg.resumes++;
  }
  agg.noEffect = [...new Set(agg.noEffect)].slice(0, 8);
  agg.dialogs = [...new Set(agg.dialogs)].slice(0, 5);
  agg.withErr = [...new Set(agg.withErr)].slice(0, 6);
  return agg;
}
