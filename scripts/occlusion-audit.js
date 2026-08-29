/* 🚧 가림 감사 — "이 버튼을 손가락으로 누르면 진짜 이 버튼이 눌리는가".
 *
 * 왜 따로 필요한가: 앞의 두 감사기가 **구조적으로 못 잡는** 결함이 있다.
 *   · audit-buttons.js  → 핸들러가 닿는지만 본다. 덮여 있어도 통과.
 *   · click-buttons.js  → el.click() 은 히트테스트를 건너뛴다. **덮여 있어도 눌린다.**
 * 실제로 삐삐 안내가 DM 전체를 덮어 메시지를 못 보내던 결함이, 클릭 감사에서는
 * dm 18/18 통과로 나왔다. 가림은 elementFromPoint(좌표) 로만 보인다.
 *
 * 판정: 요소 중심의 elementFromPoint 가 자기 자신(또는 자손)이 아니면 가려진 것.
 *
 * ⚠️ 오탐 두 번을 거쳐 좁힌 기준이다 —
 *   v1: 하단 고정 네비까지 '가림'으로 셌다. 스크롤하면 빠져나오므로 오탐이다(wallet 충전 버튼).
 *   v2: 덮는 주체를 '가장 큰 조상'으로 찾다가 #app(페이지 컨테이너)까지 올라가 또 오탐.
 *   v3(현재): 덮는 주체를 **position:fixed/sticky 인 가장 가까운 조상**으로 한정하고,
 *             그 층이 화면의 50% 이상을 덮거나 페이지가 스크롤 불가일 때만 '가림'으로 본다.
 *             = 빠져나갈 수 없는 가림만 보고한다.
 *
 * 역검증됨: 전면 오버레이를 인위로 되살리면 그 페이지의 17개 요소를 전부 잡는다.
 *
 * 쓰는 법(브라우저 콘솔, **로그인 상태**):
 *   for (const p of ["dm","wallet","search"]) console.log(await occRun(p));
 */
async function occRun(page) {
  const f = document.createElement("iframe");
  f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-modals");
  f.style.cssText = "position:fixed;left:-9999px;width:420px;height:900px";
  document.body.appendChild(f);
  const loaded = new Promise(r => { f.onload = () => r(true); setTimeout(() => r(false), 7000); });
  f.src = "/" + (page.includes(".html") ? page : page + ".html");
  await loaded;
  await new Promise(r => setTimeout(r, 1900));           // 렌더 + 지연 오버레이(안내 등)까지 기다린다
  const w = f.contentWindow, d = f.contentDocument;
  if (!w || !d) { f.remove(); return { page, error: "접근 불가" }; }

  const VA = w.innerWidth * w.innerHeight;
  const scrollable = d.body.scrollHeight > w.innerHeight + 20;
  const desc = (h, el) => { for (let n = h; n; n = n.parentElement) if (n === el) return true; return false; };
  const idt = e => (e.id ? "#" + e.id : "") || (typeof e.className === "string" && e.className ? "." + e.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : e.tagName);
  const lbl = e => (e.getAttribute("aria-label") || e.textContent || "").replace(/\s+/g, " ").trim().slice(0, 18) || "(빈 라벨)";
  const fixedLayer = e => {
    for (let n = e; n && n !== d.body; n = n.parentElement) {
      const p = w.getComputedStyle(n).position;
      if (p === "fixed" || p === "sticky") return n;
    }
    return null;
  };

  const map = new Map();
  let checked = 0, benign = 0;
  for (const el of d.querySelectorAll('button,a[href],[role="button"],input,textarea,select')) {
    const r = el.getBoundingClientRect(), st = w.getComputedStyle(el);
    if (!(r.width && r.height) || st.display === "none" || st.visibility === "hidden" || st.opacity === "0" || st.pointerEvents === "none") continue;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > w.innerWidth || cy > w.innerHeight) continue;   // 화면 밖은 스크롤하면 된다
    checked++;
    const hit = d.elementFromPoint(cx, cy);
    if (!hit || hit === el || desc(hit, el) || el.contains(hit)) continue;
    const layer = fixedLayer(hit);
    if (!layer) { benign++; continue; }                    // 고정층이 아니면 스크롤로 해결된다
    const lr = layer.getBoundingClientRect();
    const ratio = (lr.width * lr.height) / VA;
    if (ratio < 0.5 && scrollable) { benign++; continue; } // 네비·헤더 같은 부분 고정층은 피할 수 있다
    const key = idt(layer) + " (" + Math.round(ratio * 100) + "% 고정)";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(idt(el) + ' "' + lbl(el) + '"');
  }
  f.remove();
  return { page, checked, benign, scrollable,
    blockers: [...map.entries()].map(([by, v]) => ({ by, count: v.length, sample: v.slice(0, 3) })) };
}
