/* 🎬 조각 촬영 — "바로 1초"
   ============================================================================
   왜 만드는가(2026-09-01): 숏판(`posts`)이 0행이다. 만들 사람이 없어서가 아니라
   "영상 한 편"이 최소 단위라서다. 최소 단위를 1초로 부순다.

   설계 원칙
     1. 찍고 나서 **확인 단계가 없다.** 셔터 → 바로 다음 촬영 대기.
        미리보기·저장 확인을 넣는 순간 '편집'이 되고, 그러면 안 찍는다.
     2. 조각은 기기에만 남는다(clips-store.js). 서버는 모른다.
     3. 트윈 토글은 여기 있다 — 한 번 찍어 숏판·롱판 두 판에 낸다.
        (발행 시 `posts` 두 행. 왕도 둘, 지표도 둘)

   카메라는 이미 검증된 경로다 — dm-call.js 가 getUserMedia 를 쓴다(보이스톡).
   ========================================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const Store = window.GALLA_Clips;

  let stream = null;
  let recorder = null;
  let recording = false;
  let facing = "environment";
  let twin = false;
  let durMs = 1000;              // 기본 1초
  const PRESETS = [1000, 2000, 3000];

  /* ── 녹화 형식 고르기 ────────────────────────────────────────────────
     iOS 웹뷰는 mp4(h264), 안드로이드는 webm 을 준다. 나중에 재인코딩 없이
     이어붙이려면 **한 기기 안에서는 항상 같은 형식**이어야 하므로,
     지원되는 것 중 하나를 골라 고정한다. */
  function pickMime() {
    const want = [
      "video/mp4;codecs=h264,aac",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm",
    ];
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return "";
    for (const m of want) if (MediaRecorder.isTypeSupported(m)) return m;
    return "";
  }

  function toast(msg) {
    if (window.GALLA_toast) return window.GALLA_toast(msg);
    const el = $("clipToast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("on");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("on"), 1800);
  }

  /* ── 카메라 ──────────────────────────────────────────────────────────── */

  async function startCamera() {
    stopCamera();
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1080 }, height: { ideal: 1920 } },
        audio: true,
      });
    } catch (e) {
      // 권한 거부·기기 없음 — 왜 안 되는지 말해준다(그냥 검은 화면이면 버그로 오해한다)
      $("clipDenied").hidden = false;
      $("clipDeniedWhy").textContent =
        (e && e.name === "NotAllowedError")
          ? "카메라·마이크 권한이 꺼져 있어요."
          : "카메라를 열 수 없어요 — " + ((e && e.name) || "알 수 없는 오류");
      return false;
    }
    const v = $("clipCam");
    v.srcObject = stream;
    v.muted = true;                     // 하울링 방지
    v.setAttribute("playsinline", "");  // iOS 전체화면 강제 방지
    try { await v.play(); } catch (_) {}
    $("clipDenied").hidden = true;
    return true;
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
  }

  /* ── 썸네일 ──────────────────────────────────────────────────────────── */

  function grabThumb() {
    try {
      const v = $("clipCam");
      const w = 180;
      const h = Math.round(w * (v.videoHeight || 16) / (v.videoWidth || 9));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(v, 0, 0, w, h);
      return new Promise((res) => c.toBlob(res, "image/jpeg", 0.7));
    } catch (_) { return Promise.resolve(null); }
  }

  /* ── 촬영 ────────────────────────────────────────────────────────────── */

  async function shoot() {
    if (recording || !stream) return;
    recording = true;

    const mime = pickMime();
    const chunks = [];
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      recording = false;
      toast("이 기기에서는 녹화를 지원하지 않아요");
      return;
    }

    const thumbP = grabThumb();
    const v = $("clipCam");
    const w = v.videoWidth || 0, h = v.videoHeight || 0;

    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

    const done = new Promise((res) => { recorder.onstop = res; });
    recorder.start();

    // 진행 링 — 몇 초 찍히는지 눈에 보여야 손을 언제 떼도 되는지 안다
    const ring = $("clipRing");
    ring.style.transition = "none";
    ring.style.strokeDashoffset = "100";
    requestAnimationFrame(() => {
      ring.style.transition = `stroke-dashoffset ${durMs}ms linear`;
      ring.style.strokeDashoffset = "0";
    });
    $("clipShutter").classList.add("rec");

    await new Promise((r) => setTimeout(r, durMs));
    try { recorder.stop(); } catch (_) {}
    await done;

    $("clipShutter").classList.remove("rec");
    ring.style.transition = "none";
    ring.style.strokeDashoffset = "100";

    const blob = new Blob(chunks, { type: mime || "video/mp4" });
    if (blob.size > 0) {
      await Store.add({
        blob, thumb: await thumbP, dur_ms: durMs,
        w, h, portrait: h >= w, mime: blob.type, twin,
      });
      await renderStrip();
    } else {
      toast("녹화가 비어 있어요 — 다시 시도해 주세요");
    }
    recording = false;   // 확인 단계 없음. 바로 다음 촬영 대기.
  }

  /* ── 조각 스트립 ─────────────────────────────────────────────────────── */

  const urls = [];
  function revokeAll() { while (urls.length) URL.revokeObjectURL(urls.pop()); }

  async function renderStrip() {
    const rows = await Store.all();
    const strip = $("clipStrip");
    revokeAll();
    if (!rows.length) {
      strip.innerHTML = '<span class="cs-empty">찍은 조각이 여기 쌓여요</span>';
    } else {
      strip.innerHTML = rows.slice(0, 30).map((r) => {
        let src = "";
        if (r.thumb) { src = URL.createObjectURL(r.thumb); urls.push(src); }
        return `<button class="cs-item" data-id="${r.id}" aria-label="조각 ${(r.dur_ms / 1000).toFixed(0)}초">
            ${src ? `<img src="${src}" alt="">` : '<span class="cs-noimg"></span>'}
            <span class="cs-dur">${(r.dur_ms / 1000).toFixed(0)}s</span>
            ${r.twin ? '<span class="cs-twin">트윈</span>' : ""}
          </button>`;
      }).join("");
    }
    const st = await Store.stats();
    $("clipCount").textContent = st.count ? `${st.count}조각 · ${fmtBytes(st.bytes)}` : "";
    renderStale(st);
  }

  function fmtBytes(b) {
    if (b > 1024 * 1024 * 1024) return (b / 1024 / 1024 / 1024).toFixed(1) + "GB";
    if (b > 1024 * 1024) return Math.round(b / 1024 / 1024) + "MB";
    return Math.max(1, Math.round(b / 1024)) + "KB";
  }

  /* 30일 지난 조각 — 자동으로 지우지 않고 물어본다. 조각은 창작 재료라
     말없이 사라지면 신뢰를 잃는다(샤디는 15일 자동삭제 + 그 사실을 명시). */
  function renderStale(st) {
    const bar = $("clipStale");
    if (!st.stale) { bar.hidden = true; return; }
    bar.hidden = false;
    $("clipStaleText").textContent =
      `${st.stale}개가 ${st.retention_days}일이 지났어요`;
  }

  /* ── 붙이기 ──────────────────────────────────────────────────────────── */

  function bind() {
    $("clipShutter").addEventListener("click", shoot);

    $("clipFlip").addEventListener("click", async () => {
      facing = facing === "environment" ? "user" : "environment";
      await startCamera();
    });

    $("clipTwin").addEventListener("click", () => {
      twin = !twin;
      $("clipTwin").classList.toggle("on", twin);
      $("clipTwin").setAttribute("aria-pressed", String(twin));
      toast(twin ? "트윈 — 숏판·롱판 둘 다 올려요" : "트윈 꺼짐");
    });

    document.querySelectorAll(".cp-preset").forEach((b) => {
      b.addEventListener("click", () => {
        durMs = Number(b.dataset.ms) || 1000;
        document.querySelectorAll(".cp-preset").forEach((x) =>
          x.classList.toggle("on", x === b));
        PRESETS.indexOf(durMs);
      });
    });

    // 조각 탭 → 지우기 확인
    $("clipStrip").addEventListener("click", async (e) => {
      const it = e.target.closest(".cs-item");
      if (!it) return;
      if (!confirm("이 조각을 지울까요?")) return;
      await Store.remove(it.dataset.id);
      await renderStrip();
    });

    $("clipStaleBtn").addEventListener("click", async () => {
      const ids = await Store.staleIds();
      if (!ids.length) return;
      if (!confirm(`${ids.length}개를 지울까요? 되돌릴 수 없어요.`)) return;
      await Store.remove(ids);
      await renderStrip();
      toast(`${ids.length}개를 정리했어요`);
    });

    $("clipRetry").addEventListener("click", startCamera);
  }

  async function init() {
    if (!Store) return;
    bind();

    const p = await Store.ensurePersisted();
    // 영구 보관이 거절되면 조각이 조용히 사라질 수 있다 — 미리 말한다
    $("clipWarn").hidden = !(p.supported && !p.persisted);

    await renderStrip();
    await startCamera();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.addEventListener("pagehide", () => { stopCamera(); revokeAll(); });
})();
