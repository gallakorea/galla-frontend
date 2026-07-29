/* =========================================================
   🕵️ 제보하기 — 사진·영상·링크 첨부 + GP 보상
   업로드는 GALLA_UPLOAD_MEDIA(R2), 제출은 submit_tip RPC

   이중 모드:
   - MPA(report.html 단독): 로드 즉시 자동 초기화.
   - SPA(app.html): 뷰 어댑터(js/spa/views/report.js)가 host를 붙인 뒤
     window.GALLA_PAGE_REPORT.mount(root)를 호출. 뒤로가기=스택 pop.
   ========================================================= */
(function () {
  const IS_SPA = () => !!(document.body && document.body.dataset.page === "spa");

  function initReport(root) {
    const scope = root || document;
    const sb = () => window.supabaseClient;
    const $ = (id) => scope.querySelector("#" + id);
    const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    if (!$("rp-cats")) return;   // 마크업 없으면 무동작(안전)

    let category = "사회";
    const files = [];   // {file, kind, url(local preview)}
    const links = [];

    // 뒤로가기 — SPA면 스택 pop(문서 유지), MPA는 back.js의 [data-back]가 담당
    if (IS_SPA()) {
      const back = scope.querySelector(".rp-back[data-back]");
      if (back) back.addEventListener("click", (e) => { e.preventDefault(); try { window.GALLA_SPA && window.GALLA_SPA.pop(); } catch (_) {} });
    }

    // 공용 임시저장 — 제보 제목·본문(미디어·링크는 세션 한정이라 제외)
    const __rpDraft = window.GALLA_draft && window.GALLA_draft('report', ['rp-title', 'rp-body']);
    if (__rpDraft) __rpDraft.restore();

    // 카테고리
    $("rp-cats").addEventListener("click", (e) => {
      const b = e.target.closest(".rp-cat"); if (!b) return;
      $("rp-cats").querySelectorAll(".rp-cat").forEach(x => x.classList.remove("on"));
      b.classList.add("on"); category = b.dataset.c;
    });

    // 미디어 선택
    $("rp-file").addEventListener("change", (e) => {
      [...e.target.files].forEach(f => {
        if (files.length >= 8) return;
        const kind = f.type.startsWith("video") ? "video" : "image";
        files.push({ file: f, kind, url: URL.createObjectURL(f) });
      });
      e.target.value = "";
      renderMedia();
    });
    function renderMedia() {
      $("rp-media").innerHTML = files.map((m, i) => `
        <div class="rp-thumb">
          ${m.kind === "video"
            ? `<video src="${m.url}" muted playsinline></video><span class="rp-thumb-ic">▶</span>`
            : `<img src="${m.url}">`}
          <button class="rp-thumb-x" data-i="${i}" type="button">✕</button>
        </div>`).join("");
      $("rp-media").querySelectorAll(".rp-thumb-x").forEach(b =>
        b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderMedia(); }));
    }

    // 링크
    function addLink() {
      const u = $("rp-link-url").value.trim();
      if (!/^https?:\/\//i.test(u)) return alert("http(s):// 로 시작하는 링크를 입력하세요.");
      links.push(u); $("rp-link-url").value = ""; renderLinks();
    }
    $("rp-link-go").addEventListener("click", addLink);
    $("rp-link-url").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } });
    function renderLinks() {
      $("rp-links").innerHTML = links.map((l, i) => `
        <div class="rp-link-row"><span class="rp-link-t">🔗 ${A(l)}</span>
          <button class="rp-link-rm" data-i="${i}" type="button">✕</button></div>`).join("");
      $("rp-links").querySelectorAll(".rp-link-rm").forEach(b =>
        b.addEventListener("click", () => { links.splice(+b.dataset.i, 1); renderLinks(); }));
    }

    // 제출
    $("rp-submit").addEventListener("click", async () => {
      const title = $("rp-title").value.trim();
      if (!title) { $("rp-title").focus(); return; }
      const { data: sess } = await sb().auth.getSession();
      if (!sess?.session) {
        if (confirm("로그인이 필요해요. 로그인할까요?")) {
          if (IS_SPA() && window.GALLA_SPA) window.GALLA_SPA.push("login"); else location.href = "login.html";
        }
        return;
      }

      const btn = $("rp-submit"); btn.disabled = true;
      try {
        // 미디어 업로드
        const media = [];
        for (let i = 0; i < files.length; i++) {
          btn.textContent = `업로드 중… (${i + 1}/${files.length})`;
          const url = await window.GALLA_UPLOAD_MEDIA(files[i].file, files[i].kind);
          if (url) media.push({ url, kind: files[i].kind });
        }
        btn.textContent = "제보 접수 중…";
        const { data, error } = await sb().rpc("submit_tip", {
          p_title: title, p_body: $("rp-body").value.trim(), p_category: category,
          p_media: media, p_links: links
        });
        if (error || !data?.ok) {
          alert(data?.reason === "no_title" ? "제목을 입력하세요." : "제보 접수에 실패했어요.");
          btn.disabled = false; btn.textContent = "🕵️ 제보하고 100 GP 받기"; return;
        }
        done(data);
      } catch (e) {
        console.error(e); alert("업로드 중 오류가 났어요. 다시 시도해 주세요.");
        btn.disabled = false; btn.textContent = "🕵️ 제보하고 100 GP 받기";
      }
    });

    function done(d) {
      if (__rpDraft) __rpDraft.clear();   // 접수 성공 → 임시저장 삭제
      const main = scope.querySelector(".rp-main");
      if (!main) return;
      main.innerHTML = `
        <div class="rp-done">
          <div class="rp-done-ic">✅</div>
          <h2>제보가 접수됐어요!</h2>
          <p>${d.reward > 0
            ? `<b class="rp-gp">+${d.reward.toLocaleString()} GP</b> 지급 완료 🎉`
            : "오늘 보상 한도(3회)를 채웠지만 제보는 정상 접수됐어요."}</p>
          <p class="rp-done-sub">운영팀 검토 후 <b>채택되면 +2,000 GP</b>가 추가 지급됩니다.<br>좋은 제보 감사합니다!</p>
          <div class="rp-done-btns">
            <button class="rp-again">또 제보하기</button>
            <button class="ghost rp-home">홈으로</button>
          </div>
        </div>`;
      main.querySelector(".rp-again")?.addEventListener("click", () => {
        if (IS_SPA() && window.GALLA_SPA) { window.GALLA_SPA.pop(); setTimeout(() => window.GALLA_SPA.push("report"), 120); }
        else location.reload();
      });
      main.querySelector(".rp-home")?.addEventListener("click", () => {
        if (IS_SPA() && window.GALLA_SPA) { window.GALLA_SPA.pop(); window.GALLA_SPA.go("index"); }
        else location.href = "index.html";
      });
    }
  }

  // SPA 뷰 훅 — 어댑터가 host를 붙인 뒤 호출
  window.GALLA_PAGE_REPORT = { mount(root) { initReport(root || document); } };

  // MPA(단독 문서) — 로드 즉시 초기화(스크립트가 body 끝이라 DOM 준비됨)
  if (!IS_SPA()) initReport(document);
})();
