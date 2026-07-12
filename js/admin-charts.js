/* 관제센터 SVG 차트 (라인/바) — 의존성 없음 */
(function () {
  const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));

  // 라인 차트: data = [{label, users}], opts {height, color}
  function lineChart(data, opts = {}) {
    const W = 720, H = opts.height || 200, pad = { l: 34, r: 12, t: 14, b: 24 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const vals = data.map(d => d.users || 0);
    const max = Math.max(1, ...vals);
    const n = data.length;
    const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + ih - (v / max) * ih;
    const color = opts.color || "#5b8cff";
    let path = "", area = "";
    data.forEach((d, i) => {
      const px = x(i).toFixed(1), py = y(d.users || 0).toFixed(1);
      path += (i === 0 ? "M" : "L") + px + " " + py + " ";
      area += (i === 0 ? "M" + px + " " + (pad.t + ih) + " L" : "L") + px + " " + py + " ";
    });
    area += "L" + x(n - 1).toFixed(1) + " " + (pad.t + ih) + " Z";
    // y 가이드 3줄
    let grid = "";
    for (let g = 0; g <= 2; g++) {
      const gy = (pad.t + (ih / 2) * g).toFixed(1);
      const gv = Math.round(max * (1 - g / 2));
      grid += `<line x1="${pad.l}" y1="${gy}" x2="${W - pad.r}" y2="${gy}" stroke="rgba(255,255,255,.06)"/>
               <text x="4" y="${(+gy + 3).toFixed(1)}" fill="#6c7280" font-size="10">${gv}</text>`;
    }
    // x 라벨(양끝+중앙)
    const labelIdx = n <= 1 ? [0] : [0, Math.floor(n / 2), n - 1];
    let xlab = labelIdx.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 6}" fill="#6c7280" font-size="10" text-anchor="middle">${esc(data[i]?.label || "")}</text>`).join("");
    const dots = data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d.users || 0).toFixed(1)}" r="2.4" fill="${color}"/>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="ad-svg" preserveAspectRatio="none">
      <defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity=".35"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#lg)"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round"/>${dots}${xlab}
    </svg>`;
  }

  // 이중 라인(가입 vs DAU)
  function dualLine(data, opts = {}) {
    const W = 720, H = opts.height || 200, pad = { l: 30, r: 12, t: 14, b: 24 };
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b, n = data.length;
    const max = Math.max(1, ...data.map(d => Math.max(d.a || 0, d.b || 0)));
    const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
    const y = (v) => pad.t + ih - (v / max) * ih;
    const line = (key, color) => {
      let p = ""; data.forEach((d, i) => p += (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + y(d[key] || 0).toFixed(1) + " ");
      return `<path d="${p}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/>` +
        data.map((d, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(d[key] || 0).toFixed(1)}" r="2.2" fill="${color}"/>`).join("");
    };
    const labelIdx = n <= 1 ? [0] : [0, Math.floor(n / 2), n - 1];
    const xlab = labelIdx.map(i => `<text x="${x(i).toFixed(1)}" y="${H - 6}" fill="#6c7280" font-size="10" text-anchor="middle">${esc(data[i]?.label || "")}</text>`).join("");
    return `<svg viewBox="0 0 ${W} ${H}" class="ad-svg" preserveAspectRatio="none">
      ${line("b", "#33d17a")}${line("a", "#f5cf6b")}${xlab}</svg>`;
  }

  window.AdminCharts = { lineChart, dualLine };
})();
