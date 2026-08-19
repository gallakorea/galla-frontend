/* 🎁 초대 허브 — "무엇으로 초대할지" 트랙을 골라 차별화된 카피·링크로 공유.
   포지셔닝: "내 편이 있는 콘텐츠 세상". 초대 링크에 &to=<track> 를 붙여
   받는 사람이 보는 카드(미들웨어 OG)·랜딩을 트랙별로 다르게 한다. [[galla-vision-platform]]
   모든 공유는 GALLA_share(share-sheet.js)를 거쳐 origin 정규화 + ref 자동 부착.  */
(function () {
  "use strict";
  if (window.GALLA_openInvite) return;

  var BASE = "https://galla.im";
  var GP = 500; // 가입 보너스(초대 문구용)

  // 트랙 정의 — 확정 카피(사장님). "내 편" 실로 통일.
  var TRACKS = [
    {
      k: "galla", to: "galla", emoji: "⚔️", name: "갈라", nm: "갈라로 초대",
      line: "내 편이 있는 콘텐츠 세상",
      sub: "오늘의 이슈로 한판, 뉴스·영상·예측까지 — 근데 혼자가 아냐.",
      grad: "linear-gradient(135deg,#3d6bff,#ff4d67)",
      msg: function (u) { return "내 편이 있는 콘텐츠 세상, 갈라. 너도 와 — 가입하면 " + GP + " GP 🎁 " + u; },
    },
    {
      k: "galvis", to: "galvis", emoji: "🧡", name: "갈비스", nm: "갈비스로 초대",
      line: "세상에 하나뿐인 너의 진짜 친구",
      sub: "나를 기억하고, 내 편 들어주는 AI 친구. 외로울 때 여기 있어.",
      grad: "linear-gradient(135deg,#ff7a59,#ff4d67)",
      msg: function (u) { return "세상에 하나뿐인 너의 진짜 친구, 갈비스 소개해줄게. 가입하면 " + GP + " GP 🎁 " + u; },
    },
    {
      k: "talk", to: "talk", emoji: "💬", name: "갈라톡", nm: "갈라톡으로 초대",
      line: "내 편이랑 떠드는 신나는 채팅",
      sub: "DM·난장·삐삐·통화 — 내 사람들 다 여기 있어.",
      grad: "linear-gradient(135deg,#2ad0c0,#3d6bff)",
      msg: function (u) { return "내 편이랑 떠드는 신나는 채팅, 갈라톡. 너도 껴 — 가입하면 " + GP + " GP 🎁 " + u; },
    },
  ];

  var _code = null;
  async function myCode() {
    if (_code) return _code;
    try {
      var cached = localStorage.getItem("galla_my_ref");
      if (cached) return (_code = cached);
      var sb = window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient;
      if (!sb) return null;
      var r = await sb.rpc("my_ref_code");
      if (r && r.data) { _code = r.data; try { localStorage.setItem("galla_my_ref", _code); } catch (e) {} }
      return _code;
    } catch (e) { return null; }
  }
  function inviteUrl(track, code) {
    // ref 명시 + to 트랙. code 없으면 GALLA_share의 withRef가 나중에 붙임.
    return BASE + "/?to=" + encodeURIComponent(track.to) + (code ? "&ref=" + encodeURIComponent(code) : "");
  }

  function css() {
    if (document.getElementById("gv-invite-css")) return;
    var s = document.createElement("style"); s.id = "gv-invite-css";
    s.textContent = [
      ".gv-inv-ov{position:fixed;inset:0;z-index:100000;display:flex;align-items:flex-end;justify-content:center}",
      ".gv-inv-ov .dim{position:absolute;inset:0;background:rgba(0,0,0,.55);opacity:0;transition:opacity .2s}",
      ".gv-inv-ov.on .dim{opacity:1}",
      ".gv-inv-card{position:relative;width:100%;max-width:480px;background:#111318;border-radius:20px 20px 0 0;padding:18px 16px calc(16px + env(safe-area-inset-bottom));transform:translateY(100%);transition:transform .24s cubic-bezier(.2,.8,.2,1)}",
      ".gv-inv-ov.on .gv-inv-card{transform:translateY(0)}",
      ".gv-inv-h{font-size:17px;font-weight:900;color:#fff;margin:2px 2px 3px}",
      ".gv-inv-d{font-size:12px;color:#9aa3ad;margin:0 2px 14px}",
      ".gv-inv-d b{color:#f5cf6b}",
      ".gv-inv-t{display:flex;align-items:center;gap:12px;padding:13px;border-radius:15px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);margin-bottom:10px;cursor:pointer;transition:transform .1s}",
      ".gv-inv-t:active{transform:scale(.985)}",
      ".gv-inv-em{flex:0 0 46px;width:46px;height:46px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:23px}",
      ".gv-inv-tx{flex:1;min-width:0}",
      ".gv-inv-nm{font-size:11px;font-weight:800;color:#8a909c;letter-spacing:.3px}",
      ".gv-inv-ln{font-size:14px;font-weight:800;color:#fff;line-height:1.3;margin-top:1px}",
      ".gv-inv-sb{font-size:11px;color:#9aa3ad;line-height:1.4;margin-top:3px}",
      ".gv-inv-go{flex:0 0 auto;font-size:12px;font-weight:900;color:#0a0a0c;background:#fff;border:0;border-radius:999px;padding:9px 14px;cursor:pointer}",
      ".gv-inv-x{width:100%;margin-top:6px;padding:14px;border:0;background:transparent;color:#8a909c;font-weight:800;font-size:14px;cursor:pointer}",
      ".gv-inv-stat{font-size:11px;color:#f5cf6b;text-align:center;font-weight:800;margin:2px 0 12px}",
    ].join("");
    document.head.appendChild(s);
  }

  window.GALLA_openInvite = async function (defaultTrack) {
    css();
    var old = document.getElementById("gv-invite-ov"); if (old) old.remove();
    /* ⏱ 코드 조회에 시간 제한 — waitForSupabaseClient 가 안 풀리면 여기서 영원히 멈춰
       '눌러도 아무 반응 없는 버튼'이 된다(설정 타일에서 실측). 코드가 없어도 모달은 떠야 하고,
       inviteUrl 은 code 가 없으면 GALLA_share 의 withRef 가 나중에 붙여준다. */
    var code = await Promise.race([
      myCode(),
      new Promise(function (r) { setTimeout(function () { r(null); }, 2500); })
    ]);

    var ov = document.createElement("div");
    ov.className = "gv-inv-ov"; ov.id = "gv-invite-ov";
    var rows = TRACKS.map(function (t) {
      return '<div class="gv-inv-t" data-k="' + t.k + '">' +
        '<span class="gv-inv-em" style="background:' + t.grad + '">' + t.emoji + '</span>' +
        '<div class="gv-inv-tx"><div class="gv-inv-nm">' + t.nm + '</div>' +
        '<div class="gv-inv-ln">' + t.line + '</div>' +
        '<div class="gv-inv-sb">' + t.sub + '</div></div>' +
        '<button class="gv-inv-go" type="button">공유</button></div>';
    }).join("");
    ov.innerHTML = '<div class="dim"></div><div class="gv-inv-card">' +
      '<div class="gv-inv-h">🎁 친구 초대하기</div>' +
      '<div class="gv-inv-d">내 링크로 가입하면 친구 <b>+' + GP + ' GP</b>, 나도 <b>+1000 GP</b>. 무엇으로 초대할지 골라봐.</div>' +
      '<div class="gv-inv-stat" id="gv-inv-stat"></div>' +
      rows +
      '<button class="gv-inv-x" type="button">닫기</button></div>';
    document.body.appendChild(ov);
    requestAnimationFrame(function () { ov.classList.add("on"); });

    var close = function () { ov.classList.remove("on"); setTimeout(function () { ov.remove(); }, 240); };
    ov.querySelector(".dim").addEventListener("click", close);
    ov.querySelector(".gv-inv-x").addEventListener("click", close);

    // 실적(있으면)
    (async function () {
      try {
        var sb = window.waitForSupabaseClient ? await window.waitForSupabaseClient() : window.supabaseClient;
        if (!sb) return;
        var r = await sb.rpc("my_referral_stats");
        var st = r && r.data;
        if (st && (st.invited || st.gp)) {
          var el = document.getElementById("gv-inv-stat");
          if (el) el.textContent = "지금까지 " + (st.invited || 0) + "명 초대 · +" + Number(st.gp || 0).toLocaleString() + " GP";
        }
      } catch (e) {}
    })();

    var share = function (t) {
      var u = inviteUrl(t, code);
      var title = t.name + " · " + t.line;
      var text = t.msg(u);
      if (window.GALLA_share) { window.GALLA_share({ url: u, title: title, text: text }); }
      else if (navigator.share) { navigator.share({ title: title, text: text, url: u }).catch(function () {}); }
      else { try { navigator.clipboard.writeText(text); (window.GALLA_toast || alert)("🔗 초대 링크 복사됨"); } catch (e) {} }
    };
    ov.querySelectorAll(".gv-inv-t").forEach(function (row) {
      var t = TRACKS.filter(function (x) { return x.k === row.dataset.k; })[0];
      row.addEventListener("click", function () { close(); share(t); });
    });

    if (defaultTrack) {
      var dt = TRACKS.filter(function (x) { return x.k === defaultTrack; })[0];
      if (dt) { close(); share(dt); }
    }
  };
})();
