/* 🔬 런타임 버튼 전수 감사 — 브라우저 콘솔(또는 자동화)에 통째로 붙여넣고 실행.
 *
 * 왜 필요한가
 *   scripts/dead-buttons.py 는 HTML 에 적힌 정적 버튼 562개만 본다.
 *   그런데 이 앱의 버튼 대부분은 JS 가 만든다(템플릿 870곳). 카드·시트·리스트 안의 버튼은
 *   **소스만 봐서는 존재조차 알 수 없고 살아 있는 DOM 에서만 세어진다.**
 *   실측(2026-08-29 웹): 52개 페이지에서 렌더된 클릭요소가 2,025개 — 정적 검사의 4배다.
 *   갈라예측 한 페이지에만 839개가 뜬다.
 *
 * 판정 원리는 dead-buttons.py 와 같다. 이 코드베이스는 위임 핸들러를 많이 써서
 *   document.addEventListener('click', e => { if (e.target.closest('.xx')) ... })
 * "이 요소에 리스너가 붙었나"로는 판정할 수 없다. 대신
 * **손잡이(id·class·data-*)가 그 페이지가 실제로 로드한 스크립트에 언급되는가**를 본다.
 * 자기 손잡이가 없으면 조상 4단계까지 위임을 받는지 본다. 둘 다 없으면 '닿지 않는 버튼'.
 *
 * ⚠️ 코퍼스는 반드시 배열에 모아 join 한다.
 *    `corp += await fetch(...)` 로 쓰면 동시에 도는 클로저들이 같은 값을 읽어 서로 덮어쓴다.
 *    그러면 코퍼스가 일부만 모여 **멀쩡한 버튼 35개를 죽었다고 오판한다**(실제로 그랬다).
 *    코퍼스 크기(corpusKB)를 같이 반환하는 이유가 이것이다 — 갑자기 작아지면 결과를 믿지 마라.
 *
 * 쓰는 법
 *   const R = await auditPages(["index","search","dm"]);   // 확장자 없이
 *   R.offenders 만 사람이 확인하면 된다.
 *   ?id= 같은 파라미터가 필요한 페이지는 "issue.html?id=364" 처럼 통째로 넘긴다.
 *   로그인이 필요한 화면은 **로그인한 상태에서** 돌려야 의미가 있다(로그아웃이면 빈 화면이라 전부 통과한다).
 */
async function auditPages(list) {
  const RES = [];
  for (const raw of list) {
    const path = raw.includes(".html") ? raw : raw + ".html";
    const f = document.createElement("iframe");
    f.style.cssText = "position:fixed;left:-9999px;width:420px;height:900px";
    document.body.appendChild(f);
    const loaded = new Promise(r => { f.onload = () => r(true); setTimeout(() => r(false), 7000); });
    f.src = "/" + path;
    const ok = await loaded;
    await new Promise(r => setTimeout(r, 1800));   // 렌더 + 데이터 도착 여유
    try {
      const d = f.contentDocument, w = f.contentWindow;
      const parts = [];
      for (const s of d.querySelectorAll("script")) if (!s.src) parts.push(s.textContent || "");
      await Promise.all([...d.querySelectorAll("script[src]")].map(async s => {
        try { parts.push(await (await fetch(s.src, { cache: "force-cache" })).text()); } catch (_) {}
      }));
      const corp = parts.join("\n");                // ← join. += 금지(위 경고)

      const hit = n => {
        if (!n || n.length < 3) return false;
        const q = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return new RegExp('["\'`.\\[#]' + q + '["\'`\\]\\s\\),.:]').test(corp);
      };
      const vis = e => {
        const r = e.getBoundingClientRect(), st = w.getComputedStyle(e);
        return r.width && r.height && st.display !== "none" && st.visibility !== "hidden"
            && st.pointerEvents !== "none" && st.opacity !== "0";
      };
      const idt = e => (e.id ? "#" + e.id : "") ||
        (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : e.tagName);
      const lbl = e => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 24) || "(빈 라벨)";
      const handles = e => {
        const o = [];
        if (e.id) o.push(e.id);
        if (typeof e.className === "string") for (const c of e.className.split(/\s+/)) if (c.length > 2) o.push(c);
        for (const a of e.attributes) if (a.name.startsWith("data-")) { o.push(a.name); if (a.value && a.value.length > 2) o.push(a.value); }
        return o;
      };

      const dead = []; let shown = 0, hidden = 0;
      for (const e of d.querySelectorAll('button,a[href],[role="button"],[onclick],input[type="submit"],input[type="button"]')) {
        if (!vis(e)) { hidden++; continue; }
        shown++;
        if (e.getAttribute("onclick")) continue;                     // 인라인 — 살아 있다
        if (e.tagName === "A" && e.getAttribute("href")) continue;   // 링크
        const t = (e.getAttribute("type") || "").toLowerCase();
        if ((t === "submit" || t === "reset") && e.closest("form")) continue;
        if (handles(e).some(hit)) continue;
        let ok2 = false, n = e.parentElement, depth = 0;
        while (n && depth++ < 4) {                                   // 부모가 위임으로 받는가
          if (n.id && hit(n.id)) { ok2 = true; break; }
          if (typeof n.className === "string" && n.className.split(/\s+/).some(c => c.length > 2 && hit(c))) { ok2 = true; break; }
          n = n.parentElement;
        }
        if (!ok2) dead.push(idt(e) + ' "' + lbl(e) + '"');
      }
      // url 을 같이 남긴다 — 리다이렉트되면 그 페이지를 검사한 게 아니다(로그인 상태에 따라 흔하다)
      RES.push({ page: path, url: d.location.pathname + d.location.search, ok, corpusKB: Math.round(corp.length / 1024), shown, hidden, dead });
    } catch (e) {
      RES.push({ page: path, ok, error: String(e).slice(0, 80) });
    }
    f.remove();
  }
  return {
    pages: RES.length,
    totalShown: RES.reduce((a, r) => a + (r.shown || 0), 0),
    totalHidden: RES.reduce((a, r) => a + (r.hidden || 0), 0),
    totalDead: RES.reduce((a, r) => a + ((r.dead || []).length), 0),
    errors: RES.filter(r => r.error),
    redirected: RES.filter(r => r.url && !r.url.startsWith("/" + r.page.replace(".html", ""))),
    offenders: RES.filter(r => r.dead && r.dead.length),
    all: RES,
  };
}
