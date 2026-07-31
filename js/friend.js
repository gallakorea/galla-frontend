/* 🫂 갈라 친구 — 상주 오브 → 대화 시트. SPA(앱) 전용. 엔드포인트 galla-friend.
   도구가 아니라 친구: 열면 기억을 꺼내 반겨주고(자동 인사), 희로애락 같이 타고, 편들어주고,
   재밌는 콘텐츠는 보여주거나(view) 공유하게(share) 링크를 건넨다. */
(function () {
  "use strict";
  if (window.__friendInit) return; window.__friendInit = true;

  var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  var history = [], busy = false, friendName = "갈라친구";

  var ICON = {
    face: '<svg class="fr-face" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#fff" fill-opacity=".15"/><circle cx="8.5" cy="10.5" r="1.5" fill="#fff"/><circle cx="15.5" cy="10.5" r="1.5" fill="#fff"/><path d="M8 15c1.2 1.3 6.8 1.3 8 0" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    go:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>',
    mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>'
  };
  var STT = "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/galla-stt";
  var rec = null, recChunks = [], recording = false, voiceMode = false;

  var orb, sheet, logEl, taEl, sendEl;
  function el(h){ var d=document.createElement("div"); d.innerHTML=h.trim(); return d.firstChild; }

  function build(){
    orb = el('<button id="frOrb" aria-label="갈라 친구">'+ICON.face+'<span class="fr-dot"></span></button>');
    document.body.appendChild(orb);
    orb.addEventListener("click", open);

    sheet = el('<div id="frSheet" role="dialog" aria-label="갈라 친구">'+
      '<div class="fr-scrim"></div>'+
      '<div class="fr-panel">'+
        '<div class="fr-head"><div class="fr-av"></div>'+
          '<div><div class="fr-name">'+friendName+'</div><div class="fr-sub">너의 갈라 친구</div></div>'+
          '<button class="fr-x" aria-label="닫기">×</button></div>'+
        '<div class="fr-log"></div>'+
        '<div class="fr-input">'+
          '<textarea rows="1" placeholder="친구한테 아무 말이나 해봐"></textarea>'+
          '<button class="fr-mic" aria-label="음성">'+ICON.mic+'</button>'+
          '<button class="fr-send">'+ICON.send+'</button>'+
        '</div>'+
      '</div></div>');
    document.body.appendChild(sheet);
    logEl=sheet.querySelector(".fr-log"); taEl=sheet.querySelector("textarea"); sendEl=sheet.querySelector(".fr-send");
    var micEl=sheet.querySelector(".fr-mic");
    sheet.querySelector(".fr-scrim").addEventListener("click", close);
    sheet.querySelector(".fr-x").addEventListener("click", close);
    sendEl.addEventListener("click", submit);
    if(micEl) micEl.addEventListener("click", toggleVoice);
    taEl.addEventListener("keydown", function(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } });
    taEl.addEventListener("input", function(){ taEl.style.height="auto"; taEl.style.height=Math.min(taEl.scrollHeight,120)+"px"; });
  }

  function scrollBottom(){ if(logEl) logEl.scrollTop=logEl.scrollHeight; }
  function open(){
    if(!sheet) build();
    bindKb();                                     // 키보드 트래킹(1회 등록)
    orb && orb.classList.remove("fr-ping");
    document.body.classList.add("fr-chatting");   // 하단 내비 숨김
    sheet.classList.add("fr-open");
    if(!logEl.children.length) greet();      // 열면 친구가 먼저 반겨줌(기억 기반)
    setTimeout(function(){ scrollBottom(); taEl && taEl.focus(); }, 340);  // 열면 마지막 대화로
    setTimeout(scrollBottom, 600);
  }
  function close(){
    if(sheet) sheet.classList.remove("fr-open");
    document.body.classList.remove("fr-chatting");   // 내비 복원
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(e){}  // 닫으면 음성 정지
  }

  /* ⌨️ 키보드에 입력창이 딱 붙어 움직이게(DM과 동일 원리). 네이티브 resize와 따로 놀던 것 수정.
     키보드 열림=패널 높이를 '보이는 높이'로(입력창이 키보드 위에 붙음), 닫힘=원래 시트 높이로. 같은 곡선 트랜지션. */
  function bindKb(){
    if(window.__frKbBound) return; window.__frKbBound=true;
    var root=document.documentElement;
    var safeB=0; try{ var p=document.createElement("div"); p.style.cssText="position:fixed;bottom:0;left:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden"; document.body.appendChild(p); safeB=p.getBoundingClientRect().height||0; p.remove(); }catch(e){}
    var fullH=window.innerHeight;
    function setVvh(px){ root.style.setProperty("--fr-vvh", Math.round(px)+"px"); scrollBottom(); }
    function anim(on){ document.body.classList.toggle("fr-kb-anim", on); }
    setVvh(fullH);  // 초기: 전체 높이
    var KB=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(KB){
      // willShow에서 이벤트의 keyboardHeight로 '즉시' 최종 높이 → 입력창이 키보드와 동시에 붙어 오름(지연 없음)
      KB.addListener("keyboardWillShow", function(ev){ anim(true); var kh=(ev&&ev.keyboardHeight)||0; setVvh(kh?(fullH-kh+safeB):window.innerHeight); });
      KB.addListener("keyboardDidShow", function(ev){ var kh=(ev&&ev.keyboardHeight)||0; var ih=window.innerHeight; setVvh(ih<fullH-10?ih:(kh?fullH-kh+safeB:ih)); setTimeout(function(){ anim(false); }, 80); });
      KB.addListener("keyboardWillHide", function(){ anim(true); setVvh(fullH); });
      KB.addListener("keyboardDidHide", function(){ fullH=window.innerHeight; setVvh(fullH); setTimeout(function(){ anim(false); }, 280); });
    } else if(window.visualViewport){
      var vv=window.visualViewport;
      vv.addEventListener("resize", function(){ setVvh(vv.height); });
    }
  }

  async function greet(){
    // 빈 메시지 → 서버가 첫만남/재방문 판단해 반겨줌(기억 리콜)
    typing(true);
    var r = await callFriend("", []);
    typing(false);
    if(r && r.friendName){ friendName=r.friendName; var nm=sheet.querySelector(".fr-name"); if(nm) nm.textContent=friendName; }
    var m = addMsg("a", (r&&r.reply) || "안녕! 나 여기 있는 갈라 친구야. 심심할 때 놀러 와.");
    if(r&&r.actions) addActions(m, r.actions);
    if(r&&r.reply) history.push({role:"assistant",content:r.reply});
    // 첫 만남이고 이름 없으면 이름 짓기 배너
    if(r&&r.firstMeet) askName();
  }

  function askName(){
    var banner = el('<div class="fr-name-ask">나를 뭐라고 부를래? (나중에 바꿔도 돼)<input placeholder="예: 갈비, 봉구, 이름 지어줘" maxlength="20"></div>');
    var inp = banner.querySelector("input");
    inp.addEventListener("keydown", async function(e){
      if(e.key==="Enter"){
        var nm=(inp.value||"").trim(); if(!nm) return;
        banner.remove();
        var jwt=await token(); if(!jwt) return;
        typing(true);
        var r=await callFriend("", history, nm);
        typing(false);
        if(r&&r.friendName){ friendName=r.friendName; var h=sheet.querySelector(".fr-name"); if(h) h.textContent=friendName; }
        addMsg("a", (r&&r.reply)||("좋아, 이제부터 나 "+nm+"야!"));
      }
    });
    logEl.appendChild(banner); logEl.scrollTop=logEl.scrollHeight;
  }

  function addMsg(role,text){
    var m;
    if(role==="u"){ m=el('<div class="fr-msg fr-u"></div>'); m.textContent=text; }
    else { m=el('<div class="fr-msg fr-a"><div class="fr-bubble"></div></div>'); m.querySelector(".fr-bubble").textContent=text; }
    logEl.appendChild(m); logEl.scrollTop=logEl.scrollHeight; return m;
  }
  function addActions(msgEl, actions){
    if(!actions||!actions.length) return;
    var wrap=el('<div class="fr-acts"></div>');
    actions.forEach(function(a){
      var chip=el('<button class="fr-chip"></button>');
      var share = a.kind==="share";
      chip.innerHTML=(share?ICON.share:ICON.go)+"<span></span>";
      chip.querySelector("span").textContent = a.label || (share ? "친구들한테 공유" : "이거 보러가기");
      chip.addEventListener("click", function(){ runAction(a); });
      wrap.appendChild(chip);
    });
    (msgEl.querySelector(".fr-bubble")||msgEl).appendChild(wrap);
    logEl.scrollTop=logEl.scrollHeight;
  }
  function nav(u){ (window.GALLA_nav||function(x){location.href=x;})(u); }
  function contentUrl(a){ return a.ctype==="news" ? ("news.html?gn="+a.id) : ("issue.html?id="+a.id); }
  function runAction(a){
    if(a.kind==="share"){
      var path = "/share/"+(a.ctype==="news"?"news":"issue")+"/"+a.id;
      var url = SB.replace("bidqauputnhkqepvdzrr.supabase.co","galla.im").replace("https://","https://").replace("galla.im","galla.im"); // no-op guard
      url = "https://galla.im"+path;
      if(window.GALLA_share){ try{ window.GALLA_share({url:url, title:"갈라"}); return; }catch(e){} }
      if(navigator.share){ navigator.share({url:url}).catch(function(){}); return; }
      try{ navigator.clipboard.writeText(url); }catch(e){}
      addMsg("a","링크 복사했어 — 친구들한테 붙여넣어 ㅋㅋ");
      return;
    }
    close(); nav(contentUrl(a));
  }

  async function token(){
    try{ var sb=window.supabaseClient; var r=await sb.auth.getSession(); if(r&&r.data&&r.data.session) return r.data.session.access_token; }catch(e){}
    return null;
  }
  function typing(on){
    var t=logEl.querySelector(".fr-typing");
    if(on&&!t){ logEl.appendChild(el('<div class="fr-typing"><i></i><i></i><i></i></div>')); logEl.scrollTop=logEl.scrollHeight; }
    if(!on&&t) t.remove();
  }
  async function callFriend(message, hist, setName){
    var jwt=await token(); if(!jwt) return null;
    try{
      var body={message:message, history:hist||[]}; if(setName) body.setFriendName=setName;
      var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"}, body:JSON.stringify(body) });
      return await res.json();
    }catch(e){ return null; }
  }

  async function sendText(text, speakReply){
    if(busy || !text) return;
    var jwt=await token(); if(!jwt){ addMsg("a","로그인하면 내가 제대로 곁에 있어줄 수 있어. 먼저 로그인해줘."); return; }
    busy=true; sendEl.disabled=true;
    addMsg("u",text); history.push({role:"user",content:text}); typing(true);
    var r=await callFriend(text, history.slice(0,-1));
    typing(false);
    if(!r||!r.ok){ addMsg("a",(r&&r.reply)||"잠깐 딴 데 정신 팔렸다 ㅋㅋ 다시 말해줄래?"); busy=false; sendEl.disabled=false; return; }
    var m=addMsg("a", r.reply||"…"); history.push({role:"assistant",content:r.reply||""});
    if(history.length>20) history=history.slice(-20);
    addActions(m, r.actions);
    if(r.friendName&&r.friendName!==friendName){ friendName=r.friendName; var h=sheet.querySelector(".fr-name"); if(h) h.textContent=friendName; }
    if(speakReply && r.reply) speak(r.reply);
    busy=false; sendEl.disabled=false;
  }
  function submit(){
    var text=(taEl.value||"").trim(); if(!text) return;
    taEl.value=""; taEl.style.height="auto";
    sendText(text, false).then(function(){ taEl.focus(); });
  }

  /* 🎙 음성 채팅 — 녹음 → STT(받아쓰기) → 친구 → 음성 답변(브라우저 TTS, 무료). */
  function speak(text){
    try{
      if(!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      var u=new SpeechSynthesisUtterance(String(text).replace(/[#*_>`]/g,""));
      u.lang="ko-KR"; u.rate=1.05; u.pitch=1.0;
      window.speechSynthesis.speak(u);
    }catch(e){}
  }
  async function toggleVoice(){
    var mic=sheet.querySelector(".fr-mic");
    if(recording){ try{ rec && rec.state!=="inactive" && rec.stop(); }catch(e){} return; }
    var jwt=await token(); if(!jwt){ addMsg("a","로그인부터 하고 오면 음성으로 얘기하자!"); return; }
    try{
      var md=navigator.mediaDevices;
      var gum=(md.__origGetUserMedia?md.__origGetUserMedia.bind(md):md.getUserMedia.bind(md)); // iosrtc 우회(MediaRecorder 호환)
      var stream=await gum({audio:true});
      recChunks=[];
      rec=new MediaRecorder(stream);
      rec.ondataavailable=function(e){ if(e.data&&e.data.size) recChunks.push(e.data); };
      rec.onstop=async function(){
        recording=false; mic&&mic.classList.remove("fr-rec");
        try{ stream.getTracks().forEach(function(t){ t.stop(); }); }catch(e){}
        var blob=new Blob(recChunks,{type:(rec.mimeType||"audio/webm")});
        if(!blob.size) return;
        await sttSend(blob);
      };
      rec.start();
      recording=true; mic&&mic.classList.add("fr-rec");
    }catch(e){ addMsg("a","마이크를 못 켰어 ㅠㅠ 권한 확인해줄래?"); }
  }
  async function sttSend(blob){
    var jwt=await token(); if(!jwt) return;
    typing(true);
    try{
      var res=await fetch(STT,{ method:"POST", headers:{ apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type": blob.type||"audio/webm" }, body:blob });
      var j=await res.json().catch(function(){return {};});
      typing(false);
      var text=(j&&j.text||"").trim();
      if(!text){ addMsg("a","음... 잘 안 들렸어 ㅋㅋ 다시 말해줄래?"); return; }
      voiceMode=true;
      await sendText(text, true);   // 음성으로 왔으니 음성으로 답
    }catch(e){ typing(false); addMsg("a","목소리 못 알아들었어 ㅠㅠ 다시 한 번만"); }
  }

  function boot(){
    if(!document.body || document.body.dataset.page!=="spa") return;
    build();
    window.GALLA_openFriend = open;
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
