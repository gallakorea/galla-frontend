// 🎬 유튜브 프록시 재생 페이지 (엣지 함수)
// 왜 엣지 함수인가: 네이티브 앱은 출처가 capacitor://localhost 라, 유튜브 임베드를 앱 안에서
//   직접 심으면 거의 모든 영상이 '오류 153(플레이어 구성 오류)'로 거부된다(정상 크리에이터 포함).
//   해법은 임베드를 '정식 https 오리진' 페이지 안에서 로드하는 것. galla.im은 전역 보안헤더
//   (X-Frame-Options:SAMEORIGIN / CSP frame-ancestors 'self')가 앱 iframe 프레이밍을 막고,
//   Cloudflare Pages _headers 로는 그 전역 헤더를 '교체'할 수 없어 CSP가 중복→교집합으로 여전히 차단됐다.
//   → 헤더를 100% 통제할 수 있는 이 엣지 함수에서 서빙한다(XFO 없음, frame-ancestors 개방).
// 앱은 이 URL을 iframe src 로 물린다: .../functions/v1/yt?v=<video_id>

const HTML = (id: string) => `<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<title>재생 · GALLA</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden}
  #p,#p iframe{width:100%;height:100%;border:0;display:block}
  #err{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;
       gap:12px;padding:20px;text-align:center;color:#aeb6c6;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}
  #err.on{display:flex}
  #err svg{width:40px;height:40px;color:#5fd8ff;opacity:.9}
  #err p{margin:0;color:#cfd6e6}
  #err a{margin-top:4px;padding:9px 16px;border-radius:999px;background:#1e2532;color:#fff;font-weight:700;text-decoration:none}
</style></head><body>
<div id="p"></div>
<div id="err">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
  <p>이 영상은 저작권자 설정으로<br>앱 안에서 재생할 수 없어요.</p>
  <a id="errGo" href="#" target="_blank" rel="noopener">유튜브에서 보기 ↗</a>
</div>
<script>
(function(){
  var id = ${JSON.stringify(id)};
  var watch = "https://www.youtube.com/watch?v=" + encodeURIComponent(id);
  document.getElementById("errGo").href = watch;
  function showErr(){ document.getElementById("err").classList.add("on"); var pp=document.getElementById("p"); if(pp) pp.style.display="none"; }
  if(!id){ showErr(); return; }
  window.onYouTubeIframeAPIReady = function(){
    try{
      new YT.Player("p", {
        videoId: id, width: "100%", height: "100%",
        playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, fs: 1, origin: location.origin, enablejsapi: 1 },
        events: {
          onReady: function(e){ try{ e.target.playVideo(); }catch(_){} },
          onError: function(){ showErr(); }
        }
      });
    }catch(_){ showErr(); }
  };
  var s = document.createElement("script");
  s.src = "https://www.youtube.com/iframe_api";
  s.onerror = showErr;
  document.head.appendChild(s);
})();
</script>
</body></html>`;

Deno.serve((req) => {
  const url = new URL(req.url);
  const id = (url.searchParams.get("v") || "").trim();
  return new Response(HTML(id), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // 앱(capacitor://localhost 등)에서 이 페이지를 iframe 으로 프레이밍 허용.
      "content-security-policy": "frame-ancestors *",
      "cache-control": "public, max-age=300",
    },
  });
});
