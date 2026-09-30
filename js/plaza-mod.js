/* ⚙️ 광장 채널 운영자 관리 (2026-10-01, 레딧식 개방형 모더레이션)
   채널방에서 운영자(owner/mod)면 ⚙️ → 관리 패널: [조정 큐] [공지] [기록].
   전부 서버 RPC(권한 체크 + 조치 로그). 카페식 회원제/등업 없음.
   전역: GALLA_openModPanel({id,name}) / GALLA_channelIsMod(id)->Promise<bool> */
(function () {
  var sbRef = null;
  function sb() { return sbRef || (sbRef = window.supabaseClient) || null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]; }); }
  function toast(m) { try { (window.GALLA_toast || function () {})(m); } catch (_) {} }

  window.GALLA_channelIsMod = function (channelId) {
    var s = sb(); if (!s || !channelId) return Promise.resolve(false);
    return s.rpc("channel_is_mod", { p_channel: channelId }).then(function (r) { return !!(r && r.data); }).catch(function () { return false; });
  };

  var ov = null, cur = null, tab = "queue";

  function close() { if (ov) { ov.classList.remove("on"); setTimeout(function () { if (ov) { ov.remove(); ov = null; } }, 200); } }

  function shell(name) {
    ov = document.createElement("div");
    ov.className = "pmod-ov";
    ov.innerHTML =
      '<div class="pmod" role="dialog" aria-label="채널 관리">' +
        '<div class="pmod-hd"><span class="pmod-ttl">' + esc(name) + ' · 채널 관리</span>' +
          '<button class="pmod-x" aria-label="닫기">✕</button></div>' +
        '<div class="pmod-tabs">' +
          '<button data-t="queue" class="on">조정 큐</button>' +
          '<button data-t="notice">공지</button>' +
          '<button data-t="log">기록</button>' +
        '</div>' +
        '<div class="pmod-body"></div>' +
      '</div>';
    document.body.appendChild(ov);
    ov.addEventListener("click", function (e) { if (e.target === ov || e.target.closest(".pmod-x")) close(); });
    ov.querySelectorAll(".pmod-tabs button").forEach(function (b) {
      b.addEventListener("click", function () {
        ov.querySelectorAll(".pmod-tabs button").forEach(function (x) { x.classList.toggle("on", x === b); });
        tab = b.dataset.t; render();
      });
    });
    requestAnimationFrame(function () { ov.classList.add("on"); });
  }

  function body() { return ov ? ov.querySelector(".pmod-body") : null; }

  function render() {
    var el = body(); if (!el) return;
    if (tab === "queue") return renderQueue(el);
    if (tab === "notice") return renderNotice(el);
    if (tab === "log") return renderLog(el);
  }

  function renderQueue(el) {
    el.innerHTML = '<div class="pmod-loading">신고 글을 불러오는 중…</div>';
    sb().rpc("mod_queue", { p_channel: cur.id }).then(function (r) {
      var rows = (r && r.data) || [];
      if (!rows.length) { el.innerHTML = '<div class="pmod-empty">처리할 신고가 없어요. 깨끗하네요 👏</div>'; return; }
      el.innerHTML = rows.map(function (x) {
        return '<div class="pmod-item" data-post="' + esc(x.post_id) + '" data-author="' + esc(x.author || "") + '">' +
          '<div class="pmod-it-main"><div class="pmod-it-title">' + esc(x.title || "(제목 없음)") + '</div>' +
            '<div class="pmod-it-meta">신고 ' + (x.reports || 0) + '건 · ' + esc(x.last_reason || "") + '</div></div>' +
          '<div class="pmod-it-acts">' +
            '<button class="pmod-a pmod-remove">제거</button>' +
            '<button class="pmod-a pmod-dismiss">무시</button>' +
            '<button class="pmod-a pmod-ban">작성자 밴</button>' +
          '</div></div>';
      }).join("");
      el.querySelectorAll(".pmod-item").forEach(function (it) {
        var pid = it.dataset.post, author = it.dataset.author;
        it.querySelector(".pmod-remove").onclick = function () {
          if (!confirm("이 글을 채널에서 제거할까요? 되돌릴 수 없어요.")) return;
          sb().rpc("mod_remove_post", { p_post: pid, p_reason: "" }).then(function (r) {
            if (r && r.error) { toast("제거 실패"); return; }
            it.remove(); toast("글을 제거했어요"); if (!el.querySelector(".pmod-item")) renderQueue(el);
          });
        };
        it.querySelector(".pmod-dismiss").onclick = function () {
          sb().rpc("mod_dismiss_reports", { p_post: pid }).then(function (r) {
            if (r && r.error) { toast("실패"); return; }
            it.remove(); toast("신고를 무시했어요"); if (!el.querySelector(".pmod-item")) renderQueue(el);
          });
        };
        it.querySelector(".pmod-ban").onclick = function () {
          if (!author) { toast("작성자 정보가 없어요"); return; }
          var reason = prompt("밴 사유(선택)", "") || "";
          sb().rpc("mod_ban_user", { p_channel: cur.id, p_user: author, p_kind: "ban", p_reason: reason, p_days: null }).then(function (r) {
            if (r && r.error) { toast(r.error.message === "cannot_ban_owner" ? "채널 주인은 밴할 수 없어요" : "밴 실패"); return; }
            toast("작성자를 밴했어요");
          });
        };
      });
    }).catch(function () { el.innerHTML = '<div class="pmod-empty">권한이 없거나 불러오지 못했어요.</div>'; });
  }

  function renderNotice(el) {
    el.innerHTML = '<div class="pmod-loading">불러오는 중…</div>';
    sb().from("channels").select("notice").eq("id", cur.id).maybeSingle().then(function (r) {
      var notice = (r && r.data && r.data.notice) || "";
      el.innerHTML =
        '<div class="pmod-field"><label>채널 공지</label>' +
        '<textarea class="pmod-notice" maxlength="500" placeholder="채널 규칙·안내를 적어주세요. 상단에 고정됩니다.">' + esc(notice) + '</textarea>' +
        '<button class="pmod-save">공지 저장</button></div>';
      el.querySelector(".pmod-save").onclick = function () {
        var t = el.querySelector(".pmod-notice").value;
        sb().rpc("mod_set_notice", { p_channel: cur.id, p_text: t }).then(function (r) {
          if (r && r.error) { toast("저장 실패"); return; }
          toast("공지를 저장했어요");
          try { document.dispatchEvent(new CustomEvent("galla:channel-notice", { detail: { id: cur.id, notice: t } })); } catch (_) {}
        });
      };
    });
  }

  function renderLog(el) {
    el.innerHTML = '<div class="pmod-loading">기록을 불러오는 중…</div>';
    sb().from("channel_mod_log").select("action,target_type,target_id,reason,created_at,actor_id")
      .eq("channel_id", cur.id).order("created_at", { ascending: false }).limit(50).then(function (r) {
        var rows = (r && r.data) || [];
        if (!rows.length) { el.innerHTML = '<div class="pmod-empty">아직 조치 기록이 없어요.</div>'; return; }
        var LABEL = { remove_post: "글 제거", dismiss_reports: "신고 무시", ban: "밴", mute: "뮤트", unban: "밴 해제", notice: "공지 변경" };
        el.innerHTML = '<div class="pmod-loglist">' + rows.map(function (x) {
          var d = new Date(x.created_at); var t = (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
          return '<div class="pmod-logrow"><span class="pmod-lg-act">' + esc(LABEL[x.action] || x.action) + '</span>' +
            (x.reason ? '<span class="pmod-lg-rs">' + esc(x.reason) + '</span>' : '') +
            '<span class="pmod-lg-t">' + t + '</span></div>';
        }).join("") + '</div>';
      });
  }

  window.GALLA_openModPanel = function (channel) {
    if (!sb()) { toast("잠시 후 다시 시도해 주세요"); return; }
    cur = channel; tab = "queue";
    // 권한 재확인(서버) 후 오픈
    window.GALLA_channelIsMod(channel.id).then(function (ok) {
      if (!ok) { toast("이 채널의 운영자만 관리할 수 있어요"); return; }
      shell(channel.name);
      render();
    });
  };
})();
