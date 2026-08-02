/* 🫂 갈라 친구 — 상주 오브 → 대화 시트. SPA(앱) 전용. 엔드포인트 galla-friend.
   도구가 아니라 친구: 열면 기억을 꺼내 반겨주고(자동 인사), 희로애락 같이 타고, 편들어주고,
   재밌는 콘텐츠는 보여주거나(view) 공유하게(share) 링크를 건넨다. */
(function () {
  "use strict";
  if (window.__friendInit) return; window.__friendInit = true;

  var SB = "https://bidqauputnhkqepvdzrr.supabase.co";
  var ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  var history = [], busy = false, friendName = "갈비스";
  var BACKRONYM = "Galla's A Little Very Intelligent System";   // J.A.R.V.I.S. 오마주
  function isDefaultName(n){ return !n || n==="갈비스" || n==="갈라친구"; }
  function setTitle(){
    if(!sheet) return;
    var nm=sheet.querySelector(".fr-name"), sb=sheet.querySelector(".fr-sub");
    if(nm) nm.textContent = isDefaultName(friendName) ? "G.A.L.V.I.S." : friendName;
    if(sb) sb.textContent = BACKRONYM;
  }

  /* 💾 대화 이어가기 — 나갔다 와도(SPA 이동·앱 재시작) 전사(history)를 유저별 localStorage에 저장/복원.
     DM처럼 초기화되지 않고 계속 이어진다. history엔 user/assistant 텍스트가 다 있어 재렌더로 복구. */
  var _uid = null;
  async function uid(){
    if(_uid) return _uid;
    try{ var sb=window.supabaseClient; var r=await sb.auth.getUser(); if(r&&r.data&&r.data.user){ _uid=r.data.user.id; } }catch(e){}
    return _uid;
  }
  function chatKey(u){ return "frChat:"+(u||_uid||"anon"); }
  async function saveChat(){
    try{ var u=await uid(); if(!u) return;
      localStorage.setItem(chatKey(u), JSON.stringify({ v:1, name:friendName, history:history.slice(-30), t:Date.now() }));
    }catch(e){}
  }
  function loadLocalChat(u){
    try{ var raw=localStorage.getItem(chatKey(u)); if(!raw) return null;
      var d=JSON.parse(raw); return (d&&d.history&&d.history.length)? d : null;
    }catch(e){ return null; }
  }
  // 🔄 서버 우선 로드 — 어느 기기서든 같은 대화. 서버 저장본이 있으면 그걸 정본으로(PC↔앱↔웹 동기화).
  //    서버 실패/빈값이면 로컬 캐시로 폴백(오프라인·초기).
  async function loadChat(){
    var u=await uid(); if(!u) return null;
    try{
      var jwt=await token();
      if(jwt){
        var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
          body:JSON.stringify({op:"load"}) });
        var j=await res.json();
        if(j&&j.ok&&Array.isArray(j.history)&&j.history.length){
          var d={ v:1, name:(j.friend_name||friendName), history:j.history.slice(-30), t:Date.now() };
          try{ localStorage.setItem(chatKey(u), JSON.stringify(d)); }catch(e){}   // 로컬 캐시 갱신
          return d;
        }
        // 서버에 로그 없음(첫 사용/구계정) → 로컬에 있으면 그걸로(다음 턴에 서버로 올라감)
      }
    }catch(e){}
    return loadLocalChat(u);
  }

  // 🔄 실시간 미러링 — 다른 기기서 대화가 이어지면(친구 답 포함) 켜져있는 이 기기에도 즉시 반영.
  //    Supabase realtime으로 내 friend_relationship.chat_log 변경 구독(RLS로 본인 행만 수신).
  var _syncChan=null, _lastSig="";
  function chatSig(log){                 // 마지막 유저·친구 발화 내용으로 시그니처(길이 무관 — 에코 오탐 방지)
    if(!log||!log.length) return "0";
    var a=log[log.length-1]||{}, b=log[log.length-2]||{};
    return String(a.content||"").slice(-60)+"§"+String(b.content||"").slice(-40);
  }
  function renderHistory(log){
    if(!logEl) return;
    logEl.innerHTML="";
    history = log.slice(-30);
    history.forEach(function(msg){
      if(msg && msg.role==="user") addMsg("u", msg.content||"");
      else splitBubbles((msg&&msg.content)||"").forEach(function(p){ addMsg("a", p); });
    });
    scrollBottom();
  }
  function applyRemoteChat(remoteLog){
    try{
      if(!Array.isArray(remoteLog)||!remoteLog.length) return;
      if(busy) return;                                     // 이 기기가 전송 중 = 곧 내 것으로 정리됨(에코)
      var sig=chatSig(remoteLog);
      if(sig===chatSig(history)){ _lastSig=sig; return; }   // 내가 이미 가진 것과 동일(내 에코) → 무시
      if(sig===_lastSig) return;
      _lastSig=sig;
      try{ if(_uid) localStorage.setItem(chatKey(_uid), JSON.stringify({v:1,name:friendName,history:remoteLog.slice(-30),t:Date.now()})); }catch(e){}
      if(logEl && logEl.children.length) renderHistory(remoteLog);   // 챗이 열려 렌더된 상태면 즉시 미러링. 닫혀있으면 다음 오픈시 서버로드가 처리.
      else history=remoteLog.slice(-30);
    }catch(e){}
  }
  async function subscribeSync(){
    try{
      if(_syncChan) return;
      var u=await uid(); if(!u) return;
      var sb=window.supabaseClient; if(!sb||!sb.channel) return;
      _syncChan=sb.channel("frsync:"+u)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"friend_relationship",filter:"user_id=eq."+u},
          function(p){ applyRemoteChat(p&&p.new&&p.new.chat_log); })
        .subscribe();
    }catch(e){}
  }

  /* 📡 대행 진행상황 실시간 — 엣지 툴 루프가 단계마다 broadcast(frwork:uid). 대행 중이면
     미니챗(도킹)으로 전환하고 "🔍 검색하는 중…" 라이브 라인 표시(진행 상황을 같이 본다). */
  var _workChan=null;
  async function subscribeWork(){
    try{
      if(_workChan) return;
      var u=await uid(); if(!u) return;
      var sb=window.supabaseClient; if(!sb||!sb.channel) return;
      _workChan=sb.channel("frwork:"+u)
        .on("broadcast",{event:"step"}, function(p){ onAgentStep(p && p.payload); })
        .subscribe();
    }catch(e){}
  }
  function onAgentStep(pl){
    if(!pl || !pl.text || !busy) return;   // 진행 중인 요청일 때만
    if(pl.dock) enterAgentDock();          // 🛠 진짜 '대행'(초안·수정·관리)만 미니챗 도킹으로 전환해 같이 본다
    showProgress(pl.text);                 // 진행 라인은 항상(가벼운 검색도 라이브로 보이게)
  }
  // 대행 시작 → 풀시트/오브 상태를 도킹 미니챗으로 전환(편집기 도킹 openDock과 공유하는 표면)
  function enterAgentDock(){
    if(!sheet) build();
    if(_dock && sheet.classList.contains("fr-dock")) return;   // 이미 도킹
    _dock=true;
    bindKb();
    if(mini) mini.classList.remove("on");
    orb && orb.classList.add("fr-hidden");
    sheet.classList.add("fr-dock"); sheet.classList.remove("fr-dock-min");
    document.body.classList.add("fr-docked");
    sheet.classList.add("fr-open");
    setTimeout(scrollBottom, 60);
  }
  // 진행 라인(말풍선 아님, 라이브 상태) — 타이핑 점 대신 라벨+스피너
  function showProgress(text){
    if(!logEl) return;
    typing(false);
    var p=logEl.querySelector(".fr-prog");
    if(!p){ p=el('<div class="fr-prog"><span class="fr-prog-spin"></span><span class="fr-prog-t"></span></div>'); logEl.appendChild(p); }
    p.querySelector(".fr-prog-t").textContent=text;
    scrollBottom();
  }
  function clearProgress(){ var p=logEl&&logEl.querySelector(".fr-prog"); if(p) p.remove(); }

  var ICON = {
    face: '<svg class="fr-face" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" fill="#fff" fill-opacity=".15"/><circle cx="8.5" cy="10.5" r="1.5" fill="#fff"/><circle cx="15.5" cy="10.5" r="1.5" fill="#fff"/><path d="M8 15c1.2 1.3 6.8 1.3 8 0" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>',
    go:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    share:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>',
    send:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg>',
    mic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg>',
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>'
  };
  var STT = "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/galla-stt";
  var rec = null, recChunks = [], recording = false, voiceMode = false;
  var voiceOut = false; try{ voiceOut = localStorage.getItem("frVoiceOut")==="1"; }catch(e){}   // 🔊 음성 답변 토글(기억)

  var orb, sheet, mini, logEl, taEl, sendEl;
  var _dock=false, _work=null;   // 🛠 작업 모드(도킹 미니챗) — 편집기 옆에서 같이 창작
  function el(h){ var d=document.createElement("div"); d.innerHTML=h.trim(); return d.firstChild; }

  function build(){
    // 🔵 아크 리액터 오브 — 회전 틱 링 + 카운터 링 + 앰버 코어(자비스 HUD 오마주)
    orb = el('<button id="frOrb" aria-label="G.A.L.V.I.S.">'+
      '<span class="fr-ring fr-r1"></span><span class="fr-ring fr-r2"></span><span class="fr-core"></span>'+
      '<span class="fr-dot"></span></button>');
    document.body.appendChild(orb);
    orb.addEventListener("click", open);

    sheet = el('<div id="frSheet" role="dialog" aria-label="G.A.L.V.I.S.">'+
      '<div class="fr-scrim"></div>'+
      '<div class="fr-panel">'+
        '<div class="fr-hud-line"></div>'+
        '<div class="fr-head">'+
          '<div class="fr-av"><span class="fr-ring fr-r1"></span><span class="fr-ring fr-r2"></span><span class="fr-core"></span></div>'+
          '<div class="fr-idwrap"><div class="fr-name">G.A.L.V.I.S.</div><div class="fr-sub">'+BACKRONYM+'</div></div>'+
          '<button class="fr-voice" aria-label="리얼보이스 켜기/끄기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path class="fr-vw1" d="M15.5 8.5a5 5 0 0 1 0 7"/><path class="fr-vw2" d="M18.5 5.5a9.5 9.5 0 0 1 0 13"/></svg></button>'+
          '<span class="fr-status"><i></i>ONLINE</span>'+
          // 🌐 웹 전용 — 앱 받기(다운로드 트리거). CSS로 웹(fr-web)에서만 노출.
          '<button class="fr-getapp" aria-label="갈라 앱 받기">앱 받기</button>'+
          '<button class="fr-publish" aria-label="올리기">올리기 ↑</button>'+
          '<button class="fr-expand" aria-label="크게/작게"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14v6h6M20 10V4h-6M14 4h6v6M10 20H4v-6"/></svg></button>'+
          '<button class="fr-dockmin" aria-label="접기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 10l6 6 6-6"/></svg></button>'+
          '<button class="fr-x" aria-label="닫기">×</button></div>'+
        '<div class="fr-log"></div>'+
        // 🎙 마이크 버튼을 UI에 눈에 띄게 — 사람들이 키보드 받아쓰기를 잘 몰라서, 우리가 대신 쉽게.
        '<div class="fr-input">'+
          '<textarea rows="1" placeholder="친구한테 아무 말이나 해봐"></textarea>'+
          '<button class="fr-mic" aria-label="음성으로 말하기">'+ICON.mic+'</button>'+
          '<button class="fr-send">'+ICON.send+'</button>'+
        '</div>'+
      '</div></div>');
    document.body.appendChild(sheet);
    // 🔽 미니 보드 — 콘텐츠 보러 갈 때 챗이 여기로 '접힌다'(대화 유지). 탭하면 복귀.
    mini = el('<button id="frMini" aria-label="갈비스로 돌아가기">'+
      '<span class="fr-mav"><span class="fr-ring fr-r1"></span><span class="fr-core"></span></span>'+
      '<span class="fr-mini-txt">갈비스</span>'+
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 14l6-6 6 6"/></svg></button>');
    document.body.appendChild(mini);
    mini.addEventListener("click", function(){ restoreFromMini(); });
    logEl=sheet.querySelector(".fr-log"); taEl=sheet.querySelector("textarea"); sendEl=sheet.querySelector(".fr-send");
    var micEl=sheet.querySelector(".fr-mic");
    sheet.querySelector(".fr-scrim").addEventListener("click", function(){ if(_dock) return; close(); });   // 도킹 중 스크림은 편집기로 pass-through
    sheet.querySelector(".fr-x").addEventListener("click", function(){ if(_dock) exitDock(); else close(); });
    var dmBtn=sheet.querySelector(".fr-dockmin"); if(dmBtn) dmBtn.addEventListener("click", toggleDockMin);
    var exBtn=sheet.querySelector(".fr-expand"); if(exBtn) exBtn.addEventListener("click", toggleDockSize);
    var pubBtn=sheet.querySelector(".fr-publish"); if(pubBtn) pubBtn.addEventListener("click", function(){
      try{ if(window.GALLA_WORKFORM && typeof window.GALLA_WORKFORM.submit==="function"){ window.GALLA_WORKFORM.submit(); } }catch(e){}
    });
    // 접힘(바) 상태에서 헤더 아무데나 탭하면 펼침
    var headEl=sheet.querySelector(".fr-head");
    if(headEl) headEl.addEventListener("click", function(e){
      if(_dock && sheet.classList.contains("fr-dock-min") && !e.target.closest("button")){ sheet.classList.remove("fr-dock-min"); setTimeout(scrollBottom,260); }
    });
    /* ⌨️ 카톡/DM식 — 전송을 눌러도 키보드 유지(다른 영역 터치 전까지). 버튼 터치의 기본동작이
       textarea를 blur시켜 키보드가 닫히므로, touch 기본동작을 막아 blur 자체를 차단하고 전송은 직접 호출.
       touchend의 preventDefault가 합성 click도 억제하므로 모바일에선 중복 전송 없음.
       데스크톱(마우스)은 touch가 없으니 mousedown 포커스차단 + click→submit. */
    sendEl.addEventListener("mousedown", function(e){ e.preventDefault(); });
    sendEl.addEventListener("touchstart", function(e){ e.preventDefault(); }, {passive:false});
    sendEl.addEventListener("touchend", function(e){ e.preventDefault(); submit(); }, {passive:false});
    sendEl.addEventListener("click", submit);   // 데스크톱용(모바일은 touchend가 click 억제)
    if(micEl) micEl.addEventListener("click", toggleVoice);
    var getApp=sheet.querySelector(".fr-getapp");
    if(getApp) getApp.addEventListener("click", function(){ window.GALLA_appDownload && window.GALLA_appDownload("getapp"); });
    // 🔊 리얼보이스 토글(유료 아이템 voice_pack) — 미보유면 askShop 규약대로 즉시 상점(문구 금지)
    var vBtn=sheet.querySelector(".fr-voice");
    if(vBtn){
      var paintVoice=function(){ vBtn.classList.toggle("on", voiceOut); };
      vBtn.addEventListener("click", async function(){
        if(!voiceOut){
          var owned=false; try{ owned=await window.GALLA_hasItem("voice_pack"); }catch(e){}
          if(!owned){ window.openShop && window.openShop(); return; }
          voiceOut=true; try{ localStorage.setItem("frVoiceOut","1"); }catch(e){}
          paintVoice(); speak("응, 이제 리얼보이스로 말해줄게!");
        } else {
          voiceOut=false; try{ localStorage.setItem("frVoiceOut","0"); }catch(e){}
          paintVoice(); hushSpeak();
        }
      });
      paintVoice();
    }
    taEl.addEventListener("keydown", function(e){ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); submit(); } });
    taEl.addEventListener("input", function(){ taEl.style.height="auto"; taEl.style.height=Math.min(taEl.scrollHeight,120)+"px"; });
  }

  function scrollBottom(){ if(logEl) logEl.scrollTop=logEl.scrollHeight; }
  function open(){
    if(!sheet) build();
    bindKb();                                     // 키보드 트래킹(1회 등록)
    if(mini) mini.classList.remove("on");
    orb && orb.classList.remove("fr-ping");
    document.body.classList.add("fr-chatting");   // 하단 내비 숨김
    sheet.classList.add("fr-open");
    // 인사는 '세션 최초 1회'만 — 내렸다(닫기/미니) 다시 올리면 재-greet 금지(didIntro 가드).
    // askGalvis가 첫 말을 책임질 땐도 인사 억제. 저장된 대화는 항상 렌더.
    if(!logEl.children.length) restoreOrGreet(window.__frSuppressGreet===true || window.__frDidIntro===true);
    window.__frDidIntro = true;
    setTimeout(function(){ scrollBottom(); taEl && taEl.focus(); }, 340);  // 열면 마지막 대화로
    setTimeout(scrollBottom, 600);
  }
  function close(){
    if(sheet) sheet.classList.remove("fr-open");
    if(mini) mini.classList.remove("on");
    orb && orb.classList.remove("fr-hidden");
    document.body.classList.remove("fr-chatting");   // 내비 복원
    hushSpeak();   // 닫으면 음성 정지(네이티브 TTS 포함)
  }
  /* 🔽 미니 보드로 접기 — 콘텐츠를 보여줄 때 챗은 닫는 게 아니라 '접힌다'(대화·입력 그대로 유지).
     패널이 슬라이드 다운되는 동안 미니 필이 스프링으로 팝인 — 다시 탭하면 그 자리에서 대화 복귀. */
  function minimize(){
    if(sheet) sheet.classList.remove("fr-open","fr-dock","fr-dock-min");   // 패널 슬라이드 다운 + 도킹 해제
    _dock=false; document.body.classList.remove("fr-docked");
    document.body.classList.remove("fr-chatting");       // 내비 복원(콘텐츠 탐색 가능)
    orb && orb.classList.add("fr-hidden");               // 런처 오브와 중복 방지
    if(mini){ mini.classList.remove("pop"); void mini.offsetWidth; mini.classList.add("on","pop"); }
  }
  function restoreFromMini(){
    if(mini) mini.classList.remove("on");
    open();                                              // 로그·입력 보존된 채 그대로 복귀
  }

  /* 🛠 작업 모드(도킹 미니챗) — 편집기 위에 작은 라이브 대화창으로 붙어 같이 다듬는다.
     키보드 트래킹(top 앵커+--fr-vvh)을 그대로 재활용(fr-dock이 top만 하단쪽으로 밀어 반쪽 시트로). */
  function openDock(work){
    if(!sheet) build();
    _dock=true; _work=work||_work||{type:"issue"};
    bindKb();
    if(mini) mini.classList.remove("on");
    orb && orb.classList.add("fr-hidden");               // 도킹 중엔 런처 오브 숨김
    sheet.classList.add("fr-dock"); sheet.classList.remove("fr-dock-min");
    document.body.classList.add("fr-docked");
    sheet.classList.add("fr-open");                      // 편집기는 위에서 그대로 사용(스크림 pass-through)
    if(!logEl.children.length) restoreOrGreet(true);     // 인사 억제 — 작업 오프너가 첫 말
    window.__frDidIntro=true;
    setTimeout(function(){ scrollBottom(); }, 300);
  }
  function toggleDockMin(){ if(sheet){ sheet.classList.toggle("fr-dock-min"); setTimeout(scrollBottom,260); } }
  // 도킹(반쪽) ↔ 풀시트(크게) 토글 — 대행/작업 중에도 필요하면 크게 볼 수 있게
  function toggleDockSize(){
    if(!sheet) return;
    if(sheet.classList.contains("fr-dock")){
      sheet.classList.remove("fr-dock","fr-dock-min");
      document.body.classList.remove("fr-docked");
      document.body.classList.add("fr-chatting");          // 풀시트: 하단 내비 숨김
    } else {
      sheet.classList.add("fr-dock");
      document.body.classList.add("fr-docked");
      document.body.classList.remove("fr-chatting");
    }
    setTimeout(scrollBottom,260);
  }
  function exitDock(){
    _dock=false; _work=null;
    if(sheet) sheet.classList.remove("fr-dock","fr-dock-min","fr-open");
    orb && orb.classList.remove("fr-hidden");
    document.body.classList.remove("fr-chatting","fr-docked");
    hushSpeak();
  }
  // ✍️ 갈비스가 낸 필드 수정을 편집기 폼에 실시간 반영(편집기가 노출한 GALLA_WORKFORM 브리지 사용)
  function applyDraftEdit(fields){
    try{
      if(window.GALLA_WORKFORM && fields && typeof window.GALLA_WORKFORM.setFields==="function"){
        window.GALLA_WORKFORM.setFields(fields); flashDock();
      }
    }catch(e){}
  }
  function flashDock(){
    try{ if(sheet){ sheet.classList.remove("fr-flash"); void sheet.offsetWidth; sheet.classList.add("fr-flash"); } }catch(e){}
  }
  // 🖼 AI 썸네일 생성 — generate-thumbnail 엣지 호출(몇 초) → 편집기에 대표이미지로 자동 첨부 + 챗 미리보기.
  async function genThumbnail(a){
    showProgress("🎨 썸네일 그리는 중… (몇 초 걸려)");
    try{
      var jwt=await token(); if(!jwt){ clearProgress(); addMsg("a","로그인해야 그려줄 수 있어 ㅜ"); return; }
      var res=await fetch(SB+"/functions/v1/generate-thumbnail",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({ prompt:a.prompt||"", ratio:a.ratio||"portrait" }) });
      var d=await res.json(); clearProgress();
      if(d && d.ok && d.url){
        var applied=false;
        try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.setThumbnail){ window.GALLA_WORKFORM.setThumbnail(d.url); applied=true; flashDock(); } }catch(e){}
        var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><img class="fr-thumb" alt="썸네일"></div></div>');
        m.querySelector("img").src=d.url; logEl.appendChild(m); scrollBottom();
        addMsg("a", applied ? "이 느낌 어때? 대표 이미지로 붙여놨어 — 별로면 다시 그려줄게" : "그려봤어! 맘에 들면 길게 눌러 저장해서 써 ㅋㅋ");
      } else {
        var why=(d&&d.error)||"fail";
        addMsg("a",
          (why==="blocked_moderation"||why==="blocked_ip") ? "그건 좀 위험한 소재라 못 그려 ㅋㅋ 다른 컨셉으로 가자" :
          why==="user_daily_limit" ? "오늘 썸네일 많이 그렸다 ㅋㅋ 내일 또 그려줄게" :
          why==="ai_daily_cap" ? "지금 그림 요청이 몰려서 잠깐 막혔어 — 좀따 다시" :
          "앗 그리다 삐끗했어 ㅜ 다시 해볼까?");
      }
    }catch(e){ clearProgress(); addMsg("a","앗 그리다 문제 생겼어 ㅜ 다시 해볼까?"); }
  }
  // 이미지 한 장 생성(URL만 반환, UI 없음) — 영상 조립용
  async function genImageOnce(prompt, ratio){
    try{
      var jwt=await token(); if(!jwt) return null;
      var d=await (await fetch(SB+"/functions/v1/generate-thumbnail",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({ prompt:prompt||"", ratio:ratio||"portrait" }) })).json();
      return (d && d.ok && d.url) ? d.url : null;
    }catch(e){ return null; }
  }
  // 영상 렌더 폴링 — done이면 mp4 url, 실패/타임아웃이면 null
  async function pollVideo(jwt, id){
    for(var i=0;i<40;i++){
      try{
        var d=await (await fetch(SB+"/functions/v1/generate-video",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
          body:JSON.stringify({ op:"status", id:id }) })).json();
        if(d && d.status==="done" && d.url) return d.url;
        if(d && (d.status==="failed" || d.ok===false)) return null;
      }catch(e){}
      await sleep(3000);
    }
    return null;
  }
  // 🎬 자동편집형 숏판 영상 — 이미지 확보(상대사진 or AI생성) → 렌더 제출 → 폴링 → 편집기에 자동 첨부.
  async function genVideo(a){
    var images=[];
    try{ if(a.useUserPhotos && window.GALLA_WORKFORM && window.GALLA_WORKFORM.getPhotos) images=window.GALLA_WORKFORM.getPhotos()||[]; }catch(e){}
    if(!images.length && a.imagePrompts && a.imagePrompts.length){
      for(var k=0;k<a.imagePrompts.length && k<6;k++){
        showProgress("🎨 장면 그리는 중… ("+(k+1)+"/"+a.imagePrompts.length+")");
        var u=await genImageOnce(a.imagePrompts[k], a.ratio==="16:9"?"landscape":"portrait");
        if(u) images.push(u);
      }
    }
    if(images.length<1){ clearProgress(); addMsg("a","영상 만들 이미지가 없네 ㅋㅋ 사진을 올리거나 '그림도 그려서 영상 만들어줘' 해줘"); return; }
    showProgress("🎬 영상 합치는 중… (렌더링, 좀 걸려)");
    try{
      var jwt=await token(); if(!jwt){ clearProgress(); addMsg("a","로그인해야 만들어줄 수 있어 ㅜ"); return; }
      var sub=await (await fetch(SB+"/functions/v1/generate-video",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({ op:"submit", images:images, captions:a.captions||[], music:a.music||"upbeat", ratio:a.ratio||"9:16", per:3 }) })).json();
      if(!sub || !sub.ok || !sub.id){
        clearProgress();
        addMsg("a", (sub&&sub.error==="user_daily_limit") ? "오늘 영상 많이 뽑았다 ㅋㅋ 내일 또 만들어줄게" :
          (sub&&sub.error==="no_shotstack_key") ? "영상 기능이 아직 준비 중이야 ㅜ 곧!" : "앗 영상 시작이 안 되네 ㅜ 다시 해볼까?");
        return;
      }
      var url=await pollVideo(jwt, sub.id);
      clearProgress();
      if(url){
        var vk=a.ratio==="16:9"?"horizontal":"vertical", thumb=images[0], applied=false;
        try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.setVideo){ window.GALLA_WORKFORM.setVideo(url, thumb, vk); applied=true; flashDock(); } }catch(e){}
        var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><video class="fr-thumb" controls playsinline muted></video></div></div>');
        m.querySelector("video").src=url; logEl.appendChild(m); scrollBottom();
        addMsg("a", applied ? "영상 뽑았어! 편집기에 넣어놨으니 보고 맘에 들면 올려 🎬" : "영상 완성! 맘에 들면 저장해서 써 ㅋㅋ");
      } else { addMsg("a","영상 만들다 삐끗했어 ㅜ 다시 해볼까?"); }
    }catch(e){ clearProgress(); addMsg("a","영상 만들다 문제 생겼어 ㅜ 다시?"); }
  }
  // 편집기가 준비되면(GALLA_WORKFORM 노출) 도킹 자동 오픈. 최대 ~6s 폴링.
  function tryOpenDockForWork(){
    var raw; try{ raw=sessionStorage.getItem("GALLA_WORK"); }catch(e){}
    if(!raw) return;
    var work; try{ work=JSON.parse(raw); }catch(e){ work=null; }
    if(!work) { try{ sessionStorage.removeItem("GALLA_WORK"); }catch(e){} return; }
    var tries=0;
    (function wait(){
      if(window.GALLA_WORKFORM){
        try{ sessionStorage.removeItem("GALLA_WORK"); }catch(e){}
        openDock(work); return;
      }
      if(tries++ < 40) setTimeout(wait, 150);
      else { try{ sessionStorage.removeItem("GALLA_WORK"); }catch(e){} }
    })();
  }

  /* ⌨️ 키보드 트래킹 = DM(사장님 승인)과 완전 동일 로직 이식. 에뮬 프레임분석으로 검증한 방식.
     - willShow: 이벤트가 주는 keyboardHeight로 --fr-vvh=(fullH-kh+safeB)를 '즉시' 확정 → 입력창이 키보드와
       동시에 최종 위치로 오름(네이티브 resize가 innerHeight 줄이는 타이밍보다 빨라 '시간차 튐' 없음).
     - safeB(홈인디케이터): keyboardHeight엔 포함되나 웹뷰 축소엔 빠져서 안 더하면 입력창이 한 칸 더 떴다 붙음.
     - pinBottom(rAF): 애니 내내 로그를 바닥 고정 → 메시지가 입력창과 '한 몸'으로 오르내림.
     - __frKbShowing: 애니 중 visualViewport 중간값이 끼어들어 바운스 나는 것 차단.
     - fr-kb-anim: 높이 트랜지션을 애니 동안만 ON(평상시 즉답). */
  function bindKb(){
    if(window.__frKbBound) return; window.__frKbBound=true;
    var root=document.documentElement, vv=window.visualViewport;
    function setVvh(px){ root.style.setProperty("--fr-vvh", Math.round(px)+"px"); }
    // 평상시(비애니)엔 vv 실측으로 정확히. 애니 중엔 차단.
    if(vv){ vv.addEventListener("resize", function(){ if(window.__frKbShowing) return; setVvh(vv.height); scrollBottom(); }); setVvh(vv.height); }
    var KB=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Keyboard;
    if(!KB) return;
    // 홈 인디케이터(safe-area-bottom) 실측
    var safeB=0;
    try{ var p=document.createElement("div"); p.style.cssText="position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;"; document.body.appendChild(p); safeB=p.getBoundingClientRect().height||0; p.remove(); }catch(e){}
    function anim(on){ document.body.classList.toggle("fr-kb-anim", on); }
    var kbRaf=0;
    function pinBottom(){ scrollBottom(); kbRaf = window.__frKbShowing ? requestAnimationFrame(pinBottom) : 0; }
    function startPin(){ if(kbRaf) cancelAnimationFrame(kbRaf); kbRaf=requestAnimationFrame(pinBottom); }
    var fullH=window.innerHeight;   // 키보드 내려간 전체 높이
    KB.addListener("keyboardWillShow", function(ev){
      window.__frKbShowing=true; anim(true);
      var kh=(ev&&ev.keyboardHeight)||0;
      setVvh(kh ? (fullH - kh + safeB) : window.innerHeight);   // 키보드와 동시에 최종 위치로
      startPin();
    });
    KB.addListener("keyboardDidShow", function(ev){
      window.__frKbShowing=false;
      var kh=(ev&&ev.keyboardHeight)||0, ih=window.innerHeight;
      setVvh(ih < fullH-10 ? ih : (kh ? (fullH - kh + safeB) : ih));   // resize 완료면 실측이 정답
      scrollBottom();
      setTimeout(function(){ anim(false); }, 60);
    });
    KB.addListener("keyboardWillHide", function(){
      window.__frKbShowing=true; anim(true);
      setVvh(fullH); startPin();                 // 내려가는 애니와 동시에 바닥으로
    });
    KB.addListener("keyboardDidHide", function(){
      window.__frKbShowing=false;
      fullH=window.innerHeight; setVvh(fullH);
      setTimeout(function(){ anim(false); }, 60);
    });
  }

  // 📮 밀린 선톡 수령 — 갈비스가 먼저 보낸 말(푸시 무시했어도 여기서 보임). LLM 비용 0.
  async function consumePing(){
    var jwt=await token(); if(!jwt) return null;
    try{
      var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({op:"consume_ping"}) });
      var d=await res.json(); return (d&&d.ping)||null;
    }catch(e){ return null; }
  }
  // 저장된 대화가 있으면 그대로 이어서 렌더(DM식), 없으면 새로 인사. 선톡이 있으면 그 말이 곧 인사.
  async function restoreOrGreet(suppressGreet){
    var pingP = consumePing();          // 병렬로 선톡 확인
    var d = await loadChat();
    if(d && d.history && d.history.length){
      if(d.name){ friendName=d.name; setTitle(); }
      history = d.history.slice(-30);
      history.forEach(function(msg){
        if(msg && msg.role==="user"){ addMsg("u", msg.content||""); }
        else { splitBubbles((msg&&msg.content)||"").forEach(function(p){ addMsg("a", p); }); }  // 복원도 버블 단위
      });
      scrollBottom();
      var ping=await pingP;
      if(ping){ addMsg("a", ping); history.push({role:"assistant",content:ping}); saveChat(); }
      return;
    }
    var ping2=await pingP;
    if(ping2){ addMsg("a", ping2); history.push({role:"assistant",content:ping2}); saveChat(); return; }
    if(suppressGreet) return;      // askGalvis가 콘텐츠 오프너를 대신 낸다
    greet();
  }
  async function greet(){
    // 빈 메시지 → 서버가 첫만남/재방문 판단해 반겨줌(기억 리콜)
    typing(true);
    var r = await callFriend("", []);
    typing(false);
    if(r && r.friendName){ friendName=r.friendName; setTitle(); }
    var m = await addFriendReply((r&&r.reply) || "안녕! 나 갈비스야. 심심할 때 놀러 와.");
    if(r&&r.actions) addActions(m, r.actions);
    if(r&&r.reply){ history.push({role:"assistant",content:r.reply}); saveChat(); }
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
        if(r&&r.friendName){ friendName=r.friendName; setTitle(); }
        var rep=(r&&r.reply)||("좋아, 이제부터 나 "+nm+"야!");
        addMsg("a", rep); history.push({role:"assistant",content:rep}); saveChat();
      }
    });
    logEl.appendChild(banner); logEl.scrollTop=logEl.scrollHeight;
  }

  // 🎬 *별표 지시문*=지문(이탤릭), [emo:key]=갈라 이모티콘(짤). HTML 이스케이프 후 변환.
  var FR_EMO = {"fact":1,"logic":1,"rebut":1,"line":1,"urthink":1,"noconcede":1,"goso":1,"gukrul":1,"sonjeol":1,"pro_yes":1,"con_no":1,"ojz":1,"nono":1,"kkk":1,"gg":1,"legend":1,"bakje":1,"jjin":1,"e2_king":1,"e2_hyunta":1,"e2_hyeom":1,"e2_sorm":1,"e2_lol":1,"e2_dap":1,"e2_eoi":1,"e2_respect":1,"e2_iduk":1,"e3_naeronambul":1,"e3_uche":1,"e3_animyeon":1,"e3_gukppong":1,"e3_bulpyeon":1,"e3_factcheck":1,"e3_aggro":1,"e3_kadera":1,"e3_naepyeon":1};
  function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
  // 🐎 이모지 → 움직이는 Noto 이모지 스티커 URL(dm-stickers와 동일 소스). 코드포인트 조인.
  function stkUrl(emoji){
    var cps=[]; for(var i=0;i<emoji.length;){ var cp=emoji.codePointAt(i); cps.push(cp.toString(16)); i+=cp>0xffff?2:1; }
    cps=cps.filter(function(c){ return c!=="200d"; });   // ZWJ 제거(단일/기본 이모지 위주)
    return "https://fonts.gstatic.com/s/e/notoemoji/latest/"+cps.join("_").toLowerCase()+"/512.webp";
  }
  function fmtStage(text){
    return esc(text)
      .replace(/\[emo:([a-z0-9_]+)\]/g, function(m,k){ return FR_EMO[k] ? '<img class="fr-emo" src="/assets/emoticons/'+k+'.png" alt="짤" loading="lazy">' : ""; })
      // 🐎 이모지 스티커 [stk:😀] → 큰 애니 스티커(로드 실패 시 이모지로 폴백)
      .replace(/\[stk:([^\]\s]{1,8})\]/g, function(m,e){ var em=e.replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"'); return '<img class="fr-stk" src="'+stkUrl(em)+'" alt="'+em+'" loading="lazy" onerror="this.replaceWith(document.createTextNode(this.alt))">'; })
      .replace(/\(\(([^()\n]{1,80})\)\)/g,'<i class="fr-stage">$1</i>')   // 🎬 갈라식 지문 ((행동))
      .replace(/\*([^*\n]{1,80})\*/g,'<i class="fr-stage">$1</i>');        // 폴백: 혹시 *…* 흘리면도 깨지지 않게
  }
  function addMsg(role,text){
    var m;
    if(role==="u"){ m=el('<div class="fr-msg fr-u"></div>'); m.textContent=text; }
    else { m=el('<div class="fr-msg fr-a"><div class="fr-bubble"></div></div>'); m.querySelector(".fr-bubble").innerHTML=fmtStage(text); }
    logEl.appendChild(m); logEl.scrollTop=logEl.scrollHeight; return m;
  }
  function sleep(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }
  // 💬 카톡식 멀티 버블 — 빈 줄로 나뉜 답을 여러 말풍선으로, 사이사이 타이핑 표시(진짜 친구가 연타로 보내듯)
  function splitBubbles(text){
    var parts=String(text||"").split(/\n{2,}/).map(function(s){ return s.trim(); }).filter(Boolean);
    if(parts.length>4){ parts=[parts[0], parts[1], parts[2], parts.slice(3).join("\n")]; }  // 최대 4덩이(서버 bubbleize와 합)
    return parts.length?parts:[String(text||"")];
  }
  async function addFriendReply(text, instant){
    var parts=splitBubbles(text), last=null;
    for(var i=0;i<parts.length;i++){
      if(i>0 && !instant){ typing(true); await sleep(380+Math.min(parts[i].length*6,420)); typing(false); }
      last=addMsg("a", parts[i]);
    }
    return last;
  }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  function addActions(msgEl, actions){
    if(!actions||!actions.length) return;
    var wrap=el('<div class="fr-acts"></div>');
    actions.forEach(function(a){
      var isLink = (a.kind==="open"||a.kind==="view");
      // 🔗 링크/콘텐츠 = 세련된 리치 카드(제목·부제·출처). 그 외(공유·앱·관리)는 알약칩.
      if(isLink && (a.title||a.sub)){
        var title = a.title || (a.label||"").replace(/\s*보기$/,"") || "바로 열어보기";
        var card=el(
          '<button class="fr-card">'+
            '<span class="fr-card-ic">'+ICON.globe+'</span>'+
            '<span class="fr-card-body">'+
              '<span class="fr-card-t">'+esc(title)+'</span>'+
              (a.sub?'<span class="fr-card-s">'+esc(a.sub)+'</span>':'')+
              (a.source?'<span class="fr-card-src">'+esc(a.source)+'</span>':'')+
            '</span>'+
            '<span class="fr-card-go">'+ICON.go+'</span>'+
          '</button>');
        card.addEventListener("click", function(){ runAction(a); });
        wrap.appendChild(card);
        return;
      }
      var chip=el('<button class="fr-chip"></button>');
      var share = a.kind==="share", opn = a.kind==="open";
      chip.innerHTML=(share?ICON.share:opn?ICON.globe:ICON.go)+"<span></span>";
      chip.querySelector("span").textContent = a.label || (share ? "친구들한테 공유" : opn ? "바로 열어보기" : "이거 보러가기");
      chip.addEventListener("click", function(){ runAction(a); });
      wrap.appendChild(chip);
    });
    (msgEl.querySelector(".fr-bubble")||msgEl).appendChild(wrap);
    logEl.scrollTop=logEl.scrollHeight;
  }
  function nav(u){ (window.GALLA_nav||function(x){location.href=x;})(u); }
  function contentUrl(a){ return a.ctype==="news" ? ("news.html?gn="+a.id) : ("issue.html?id="+a.id); }
  // 🗑 삭제 확인 — 챗 안에 위험 확인 UI. 확정 시 유저 세션으로 삭제 RPC(서버가 소유권 재검증).
  function confirmDelete(a){
    var rpc={issue:"delete_issue",plaza:"delete_plaza_post",gallari:"delete_post",predict:"delete_market"}[a.ctype];
    if(!rpc){ addMsg("a","그건 내가 못 지워."); return; }
    var wrap=el('<div class="fr-msg fr-a"><div class="fr-bubble"></div></div>');
    var b=wrap.querySelector(".fr-bubble");
    b.textContent = (a.title? '"'+a.title+'" ':"이 글 ") + "진짜 지울까? 되돌릴 수 없어.";
    var row=el('<div class="fr-acts"></div>');
    var yes=el('<button class="fr-chip fr-danger"><span>🗑 삭제 확정</span></button>');
    var no=el('<button class="fr-chip"><span>취소</span></button>');
    no.addEventListener("click", function(){ row.remove(); addMsg("a","ㅇㅋ 안 지웠어."); });
    yes.addEventListener("click", async function(){
      yes.disabled=true; yes.querySelector("span").textContent="지우는 중…";
      try{
        var sb=window.supabaseClient; if(!sb) throw new Error("연결 준비 중");
        var pid = (a.ctype==="issue"||a.ctype==="predict") ? Number(a.id) : a.id;
        var r=await sb.rpc(rpc, { p_id: pid });
        if(r.error){ throw new Error((r.error.message||"").indexOf("not_authorized")>=0 ? "네 글이 아니라 못 지워." : "삭제 실패"); }
        row.remove(); addMsg("a","🗑 지웠어. 깔끔하게 정리됐다.");
      }catch(e){ yes.disabled=false; yes.querySelector("span").textContent="🗑 삭제 확정"; addMsg("a", String(e.message||e)); }
    });
    row.appendChild(yes); row.appendChild(no); b.appendChild(row);
    logEl.appendChild(wrap); scrollBottom();
  }
  // 🌐 자비스 내부 브라우저 — 검색으로 찾아준 가게·기사를 앱 안에서 바로 연다(Capacitor Browser=인앱 사파리 시트)
  function openInApp(url){
    if(!/^https?:\/\//.test(url||"")) return;
    try{
      var B=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if(B && B.open){ B.open({ url:url, presentationStyle:"popover" }); return; }
    }catch(e){}
    try{ window.open(url, "_blank", "noopener"); }catch(e){ location.href=url; }
  }
  function runAction(a){
    if(a.kind==="open"){ openInApp(a.url); return; }
    if(a.kind==="app"){
      // 🌐 웹에선 통화(음성/영상)는 앱 전용 → 다운로드 트리거로 전환
      if(!window.GALLA_IS_APP && (a.op==="call_voice"||a.op==="call_video")){
        window.GALLA_appDownload && window.GALLA_appDownload("call"); return;
      }
      // 🎛 앱 컨트롤 — 갈비스가 앱 기능·설정을 직접 구동(미니 보드로 접히고 실행)
      minimize();
      if(a.op==="dm" && a.id) nav("dm.html?dm="+a.id);
      else if((a.op==="call_voice"||a.op==="call_video") && a.id) nav("dm.html?dm="+a.id+"&call="+(a.op==="call_video"?"video":"voice"));
      else if(a.op==="goto" && a.page) nav(a.page + (a.focus ? (a.page.indexOf("?")>=0?"&":"?")+"focus="+a.focus : ""));
      return;
    }
    if(a.kind==="manage"){
      // 🗑✏️ 내 콘텐츠 관리 — 삭제=유저 세션 RPC(서버 소유권 검증) / 수정=해당 콘텐츠 수정폼(?manage=edit)
      var pg={issue:"issue.html?id=",plaza:"plaza_detail.html?id=",gallari:"gallari-post.html?id=",predict:"predict-market.html?id="}[a.ctype];
      if(!pg){ addMsg("a","음 그 콘텐츠는 내가 못 건드려."); return; }
      if(a.op==="edit"){ minimize(); nav(pg+encodeURIComponent(a.id)+"&manage=edit"); return; }
      confirmDelete(a);   // 삭제는 챗 안에서 확인 한 번 더
      return;
    }
    if(a.kind==="draft"){
      // ⚔️ 함께 창작(이슈) — 초안 시드 + 작업모드 플래그 → 편집기 도착 후 도킹 미니챗으로 같이 다듬기
      try{ sessionStorage.setItem("GALLA_SEED", JSON.stringify({ from:"jarvis",
        title:a.title||"", oneLine:a.oneLine||"", description:a.description||"",
        category:a.category||"", factionA:a.factionA||"", factionB:a.factionB||"" })); }catch(e){}
      try{ sessionStorage.setItem("GALLA_WORK", JSON.stringify({ type:"issue" })); }catch(e){}
      minimize(); nav("write.html");
      return;
    }
    if(a.kind==="draftPlaza"){
      // 📰 광장 글 초안 — plaza.js jarvisSeedPrefill(kind:plaza)이 받아 폼에 채움 + 작업모드
      try{ sessionStorage.setItem("GALLA_SEED", JSON.stringify({ from:"jarvis", kind:"plaza",
        title:a.title||"", description:a.description||"", category:a.category||"" })); }catch(e){}
      try{ sessionStorage.setItem("GALLA_WORK", JSON.stringify({ type:"plaza" })); }catch(e){}
      minimize(); nav("plaza.html?compose=1");
      return;
    }
    if(a.kind==="draftGallari"){
      // 🎬 갈라리(숏판/롱판/사진) 초안 — 캡션·태그·(가로)제목 프리필 + 작업모드. 미디어는 상대가.
      try{ sessionStorage.setItem("GALLA_SEED", JSON.stringify({ from:"jarvis", kind:"gallari",
        vkind:a.vkind||"vertical", title:a.title||"", caption:a.caption||"", tags:a.tags||[] })); }catch(e){}
      try{ sessionStorage.setItem("GALLA_WORK", JSON.stringify({ type:"gallari" })); }catch(e){}
      minimize(); nav("gallari-write.html");
      return;
    }
    if(a.kind==="draftPredict"){
      // 🎲 예측 마켓 초안 — 질문·정산기준·카테고리·마감 프리필 + 작업모드. 발행은 사람이 확인.
      try{ sessionStorage.setItem("GALLA_SEED", JSON.stringify({ from:"jarvis", kind:"predict",
        question:a.question||"", description:a.description||"", category:a.category||"", closeDays:a.closeDays||7 })); }catch(e){}
      try{ sessionStorage.setItem("GALLA_WORK", JSON.stringify({ type:"predict" })); }catch(e){}
      minimize(); nav("galla-predict.html?compose=1");
      return;
    }
    if(a.kind==="editdraft"){ applyDraftEdit(a.fields); return; }   // ✍️ 작업모드 실시간 폼 수정
    if(a.kind==="genThumbnail"){ genThumbnail(a); return; }         // 🖼 AI 썸네일 생성
    if(a.kind==="genVideo"){ genVideo(a); return; }                 // 🎬 자동편집형 영상 생성
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
    minimize(); nav(contentUrl(a));   // 챗은 미니 보드로 접히고 콘텐츠가 뜬다(대화 유지)
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
  async function callFriend(message, hist, setName, meta){
    var jwt=await token(); if(!jwt) return null;
    try{
      var body={message:message, history:hist||[]}; if(setName) body.setFriendName=setName; if(meta) body.meta=true;
      // 🛠 작업 모드면 현재 편집 중인 초안 상태를 동봉 → 갈비스가 폼을 알고 실시간 수정(edit_draft)
      if(_dock && _work && window.GALLA_WORKFORM){
        try{ body.work={ type:_work.type||window.GALLA_WORKFORM.type||"issue", fields:window.GALLA_WORKFORM.getFields() }; }catch(e){}
      }
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
    typing(false); clearProgress();
    if(!r||!r.ok){ addMsg("a",(r&&r.reply)||"잠깐 딴 데 정신 팔렸다 ㅋㅋ 다시 말해줄래?"); busy=false; sendEl.disabled=false; return; }
    var m=await addFriendReply(r.reply||"…"); history.push({role:"assistant",content:r.reply||""});
    if(history.length>30) history=history.slice(-30);
    // ✍️ 작업모드 폼수정(editdraft)·🖼 썸네일생성(genThumbnail)은 칩이 아니라 즉시 실행. 나머지만 칩으로.
    var acts=r.actions||[];
    acts.filter(function(a){return a.kind==="editdraft";}).forEach(function(a){ applyDraftEdit(a.fields); });
    acts.filter(function(a){return a.kind==="genThumbnail";}).forEach(function(a){ genThumbnail(a); });
    acts.filter(function(a){return a.kind==="genVideo";}).forEach(function(a){ genVideo(a); });
    addActions(m, acts.filter(function(a){return a.kind!=="editdraft"&&a.kind!=="genThumbnail"&&a.kind!=="genVideo";}));
    // ⚡ 자동 실행 — 명시 요청은 칩 탭 안 기다린다(답 잠깐 보여주고 0.7s 후):
    //   ① 앱 컨트롤(DM·통화·페이지)은 요청받아 나온 것이므로 바로 실행
    //   ② "보여줘/열어줘"면 콘텐츠(view→open) 자동 오픈
    if(r.actions && r.actions.length){
      var appA = r.actions.filter(function(a){ return a.kind==="app"; })[0];
      if(appA && (appA.op==="goto" || /걸어|전화|톡|디엠|dm|보내|열어/i.test(text))){
        setTimeout(function(){ runAction(appA); }, 700);
      } else if(/보여|열어|보자|가보자|띄워|틀어/.test(text)){
        var auto = r.actions.filter(function(a){ return a.kind==="view"; })[0] || r.actions.filter(function(a){ return a.kind==="open"; })[0];
        if(auto) setTimeout(function(){ runAction(auto); }, 700);
      }
    }
    if(r.friendName&&r.friendName!==friendName){ friendName=r.friendName; setTitle(); }
    if((voiceOut || speakReply) && r.reply) speak(r.reply);   // 🔊 토글 켜져 있으면 답을 읽어준다(무료 온디바이스)
    saveChat();                                  // 대화 이어가기 — 매 턴 저장
    if(!window.GALLA_IS_APP) maybeWebNudge();     // 🌐 웹: 몇 번 대화하면 자연스럽게 앱 다운로드 유도
    busy=false; sendEl.disabled=false;
  }

  /* 🌐 웹 전용 — 몇 번 대화가 오가면 갈비스가 슬쩍 앱 설치를 권한다(세션당 몇 번, 단계적).
     대화 흐름을 끊지 않게 답 뒤에 붙이고, 다운로드 칩 하나. history엔 안 남김(합성 넛지). */
  var _webMsgs = 0, _webNudgeIdx = 0;
  var _webThresholds = [3, 9];   // 3번째·9번째 유저 메시지 후 한 번씩
  function maybeWebNudge(){
    _webMsgs++;
    if(_webNudgeIdx >= _webThresholds.length || _webMsgs < _webThresholds[_webNudgeIdx]) return;
    _webNudgeIdx++;
    setTimeout(function(){
      if(!logEl) return;
      var lines = [
        "우리 은근 자주 얘기하네 ㅎㅎ ((눈웃음)) 앱으로 받으면 알림도 오고 음성·통화까지 다 돼 — 훨씬 편해!",
        "이럴 거면 앱이 낫지 않아? ((씨익)) 홈에 두고 바로 켜자. 알림·통화·오프라인 다 되니까."
      ];
      var m = addMsg("a", lines[Math.min(_webNudgeIdx-1, lines.length-1)]);
      var wrap = el('<div class="fr-acts"></div>');
      var chip = el('<button class="fr-chip fr-getapp-chip"><span>📲 앱 받기</span></button>');
      chip.addEventListener("click", function(){ window.GALLA_appDownload && window.GALLA_appDownload("getapp"); });
      wrap.appendChild(chip);
      (m.querySelector(".fr-bubble")||m).appendChild(wrap);
      scrollBottom();
    }, 900);
  }
  function submit(){
    var text=(taEl.value||"").trim(); if(!text) return;
    taEl.value=""; taEl.style.height="auto";
    sendText(text, false).then(function(){ taEl.focus(); });
  }

  /* 🎙 음성 채팅 — 녹음 → STT(받아쓰기) → 친구 → 음성 답변(브라우저 TTS, 무료). */
  /* 🔊 갈비스 목소리(무료) — 네이티브=AVSpeechSynthesizer(기기 최고 한국어 보이스), 웹=speechSynthesis 폴백.
     낭독 전 정리: 짤/스티커 마커·지문((…))·URL 제거(말로 읽으면 이상한 것들). */
  function cleanForSpeech(text){
    return String(text||"")
      .replace(/\[emo:[a-z0-9_]+\]/g," ").replace(/\[stk:[^\]]+\]/g," ")
      .replace(/\(\([^()\n]*\)\)/g," ").replace(/\*[^*\n]*\*/g," ")
      .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi," ").replace(/[#_>`]/g,"")
      .replace(/\s{2,}/g," ").trim();
  }
  // 🔊 리얼보이스(유료 voice_pack) — 서버(op:tts, 소유권 재검증)가 OpenAI 자연 음성 mp3를 만들어줌.
  //    애플 TTS는 품질 문제로 폐기(사장님), 네이티브 speak 브리지는 잠재움(추후 재활용 가능).
  var frAudio=null;
  async function speak(text){
    var t=cleanForSpeech(text); if(!t) return;
    var jwt=await token(); if(!jwt) return;
    try{
      var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({op:"tts", text:t.slice(0,500)}) });
      var d=await res.json();
      if(!d||!d.ok||!d.audio) return;
      hushSpeak();
      // 🔊 재생 직전 네이티브 플레이백 세션(스피커·제볼륨) — 웹뷰 기본 세션이 수화부/저볼륨으로 흘러 소리 작던 것 수정
      if(nsrAvail()){ try{ window.webkit.messageHandlers.gallaSpeech.postMessage({op:"ttsOn"}); }catch(e){} }
      frAudio=new Audio("data:audio/mp3;base64,"+d.audio);
      frAudio.volume=1.0;
      frAudio.onended=function(){ if(nsrAvail()){ try{ window.webkit.messageHandlers.gallaSpeech.postMessage({op:"ttsOff"}); }catch(e){} } frAudio=null; };
      frAudio.play().catch(function(){});
    }catch(e){}
  }
  function hushSpeak(){
    try{ if(frAudio){ frAudio.pause(); frAudio=null; if(nsrAvail()){ window.webkit.messageHandlers.gallaSpeech.postMessage({op:"ttsOff"}); } } }catch(e){}
    try{ window.speechSynthesis && window.speechSynthesis.cancel(); }catch(e){}
  }
  /* 🎙 네이티브(iOS) = 애플 온디바이스 실시간 인식(GallaSpeech 브릿지) — 말하는 동안 입력창에 글자가 차오르고,
     다시 탭하면 확정→전송. iosrtc의 getUserMedia 점거와 무관·무료·저지연. 웹은 기존 Whisper 폴백. */
  function nsrAvail(){ try{ return !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.gallaSpeech); }catch(e){ return false; } }
  function nsrPost(op){ try{ window.webkit.messageHandlers.gallaSpeech.postMessage({op:op}); }catch(e){} }
  window.__gallaSpeechEvt = function(type, text){
    var mic=sheet && sheet.querySelector(".fr-mic");
    if(type==="listening"){
      recording=true; mic&&mic.classList.add("fr-rec");
      if(taEl){ taEl.value=""; taEl.placeholder="듣는 중… 말해봐 🎙"; }
    } else if(type==="partial"){
      if(taEl){ taEl.value=text||""; taEl.style.height="auto"; taEl.style.height=Math.min(taEl.scrollHeight,120)+"px"; }
    } else if(type==="end"){
      recording=false; mic&&mic.classList.remove("fr-rec");
      var t=(text||(taEl&&taEl.value)||"").trim();
      if(taEl){ taEl.value=""; taEl.style.height="auto"; taEl.placeholder="친구한테 아무 말이나 해봐"; }
      if(t) sendText(t, false);
    } else { // error
      recording=false; mic&&mic.classList.remove("fr-rec");
      if(taEl) taEl.placeholder="친구한테 아무 말이나 해봐";
      addMsg("a", text==="perm" ? "음성인식 권한이 꺼져 있어! 설정 > 갈라에서 '음성 인식'을 켜줘" :
                  text==="mic" ? "마이크 권한을 허용해줘야 음성으로 대화할 수 있어!" :
                  "마이크를 못 켰어 ㅠㅠ 다시 한 번 눌러볼래?");
    }
  };
  async function toggleVoice(){
    var mic=sheet.querySelector(".fr-mic");
    if(nsrAvail()){
      if(recording){ nsrPost("stop"); return; }
      var jwt0=await token(); if(!jwt0){ addMsg("a","로그인부터 하고 오면 음성으로 얘기하자!"); return; }
      nsrPost("start"); return;
    }
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
      // 🎙 음성 = '입력(받아쓰기)' 전용. 답은 텍스트로(TTS 비용·기계음·공공장소 불편 회피). speak는 필요시 재활성.
      taEl.value=text;                 // 받아쓴 걸 입력창에 넣어 보여주고(확인 가능)
      await sendText(text, false);     // 친구는 텍스트로 답
      taEl.value="";
    }catch(e){ typing(false); addMsg("a","목소리 못 알아들었어 ㅠㅠ 다시 한 번만"); }
  }

  /* 🔗 콘텐츠 → 갈비스 파이프라인 — 모든 콘텐츠 액션바(좋아요·공유 줄)의 갈비스 아이콘.
     탭하면 그 콘텐츠 맥락을 들고 챗이 열리고, 갈비스가 그 얘기로 먼저 말을 건다. */
  async function askGalvis(ctx){
    window.__frSuppressGreet = true;      // 콘텐츠 오프너를 내가 낸다(기본 인사 억제)
    open();
    var title=(ctx&&ctx.title||"").slice(0,120), type=(ctx&&ctx.type)||"content";
    var jwt=await token();
    if(!jwt || !title){ window.__frSuppressGreet=false; if(!logEl.children.length) greet(); return; }
    typing(true);
    var r=await callFriend("(상대가 갈라 콘텐츠 '"+title+"'("+type+")에서 나를 불렀다. 그 콘텐츠 얘기로 짧게 먼저 말을 걸어라 — 네 평 한마디+어느 편인지 묻거나, 재밌는 포인트 하나 콕. 리스트 금지.)", history, null, true);
    typing(false);
    window.__frSuppressGreet = false;
    if(r&&r.reply){ var m=await addFriendReply(r.reply); history.push({role:"assistant",content:r.reply}); addActions(m, r.actions); saveChat(); }
    else if(!logEl.children.length){ addMsg("a","이 얘기 나랑 해볼까? 어떻게 생각해?"); }
  }
  window.GALLA_askGalvis = askGalvis;
  // 전역 위임 — 각 화면은 <button data-galvis data-gv-type data-gv-id data-gv-title> 만 심으면 됨
  document.addEventListener("click", function(e){
    var b=e.target.closest && e.target.closest("[data-galvis]");
    if(!b) return;
    e.preventDefault(); e.stopPropagation();
    askGalvis({ type:b.getAttribute("data-gv-type")||"", id:b.getAttribute("data-gv-id")||"", title:b.getAttribute("data-gv-title")||"" });
  }, true);

  function boot(){
    if(!document.body) return;
    // 🌐 앱(SPA)이면 그대로, 웹(MPA)이면 웹모드. 웹에도 상주 오브를 띄우고 앱 전용 기능은 다운로드 트리거로.
    var IS_APP = document.body.dataset.page==="spa";
    window.GALLA_IS_APP = IS_APP;
    if(!IS_APP) document.body.classList.add("fr-web");
    build();
    window.GALLA_openFriend = open;
    window.GALLA_openDock = openDock;   // 편집기에서 직접 작업모드 열기(글쓰기 허브 등에서 재사용 가능)
    // 🛠 작업 모드 — 갈비스가 초안 넘겨 편집기로 왔으면(GALLA_WORK) 편집기 준비 후 도킹 미니챗 자동 오픈.
    tryOpenDockForWork();
    // 🔄 실시간 미러링 + 📡 대행 진행상황 구독(supabaseClient 준비되면).
    (function trySync(n){ if(window.supabaseClient){ subscribeSync(); subscribeWork(); } else if(n>0){ setTimeout(function(){ trySync(n-1); }, 500); } })(24);
    // 📮 선톡 푸시 탭으로 들어왔으면(?frping=1) 부팅 후 갈비스 챗 자동 오픈(선톡이 첫 말이 됨)
    try{ if(/[?&]frping=1/.test(location.search)) setTimeout(open, 900); }catch(e){}
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
