/* =========================================================
   🕵️ 제보하기 — 사진·영상·링크 첨부 + GP 보상
   업로드는 GALLA_UPLOAD_MEDIA(R2), 제출은 submit_tip RPC
   ========================================================= */
(function () {
  const sb = () => window.supabaseClient;
  const $ = (id) => document.getElementById(id);
  const A = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let category = "사회";
  const files = [];   // {file, kind, url(local preview)}
  const links = [];

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
    if (!sess?.session) { if (confirm("로그인이 필요해요. 로그인할까요?")) location.href = "login.html"; return; }

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
    document.querySelector(".rp-main").innerHTML = `
      <div class="rp-done">
        <div class="rp-done-ic">✅</div>
        <h2>제보가 접수됐어요!</h2>
        <p>${d.reward > 0
          ? `<b class="rp-gp">+${d.reward.toLocaleString()} GP</b> 지급 완료 🎉`
          : "오늘 보상 한도(3회)를 채웠지만 제보는 정상 접수됐어요."}</p>
        <p class="rp-done-sub">운영팀 검토 후 <b>채택되면 +2,000 GP</b>가 추가 지급됩니다.<br>좋은 제보 감사합니다!</p>
        <div class="rp-done-btns">
          <button onclick="location.reload()">또 제보하기</button>
          <button class="ghost" onclick="location.href='index.html'">홈으로</button>
        </div>
      </div>`;
  }
})();
