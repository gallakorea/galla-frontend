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
  /* 🎟 게스트 맛보기 — 로그인 전에도 갈비스가 어떤 애인지 몇 턴 겪어보게 한다(가입 전환의 핵심).
     서버가 기기ID로 한도를 세므로 지워지지 않게 localStorage에 고정 발급. */
  function deviceId(){
    try{
      var k="galla_dev", v=localStorage.getItem(k);
      if(!v){ v=(crypto&&crypto.randomUUID)?crypto.randomUUID():(Date.now()+"-"+Math.random().toString(36).slice(2)); localStorage.setItem(k,v); }
      return v;
    }catch(e){ return "nostore-"+Math.random().toString(36).slice(2); }
  }
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
      // ⚠️ CHANNEL_ERROR는 재연결 중 '일시' 상태고 클라가 스스로 SUBSCRIBED로 복구한다(파괴 금지).
      //    CLOSED만 영구 종료 → 참조 비워 재구독 가능하게. 놓친 이벤트는 visibility의 loadChat 따라잡기가 메꾼다.
      _syncChan=sb.channel("frsync:"+u)
        .on("postgres_changes",{event:"UPDATE",schema:"public",table:"friend_relationship",filter:"user_id=eq."+u},
          function(p){ applyRemoteChat(p&&p.new&&p.new.chat_log); })
        .subscribe(function(status){ if(status==="CLOSED"){ _syncChan=null; } });
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
    // 🛠 도킹은 '편집기가 이미 열려있을 때만'(작업모드에서 edit_draft 등). 채팅에서 초안을 '새로 만드는 중'엔 도킹 금지 —
    //    편집기도 없는데 창만 반쪽으로 작아지면 UX 개판(사장님 지적). 초안 카드 탭→편집기 이동 후 tryOpenDockForWork가 도킹한다.
    if(pl.dock && (window.GALLA_WORKFORM || _work || _dock)) enterAgentDock();
    showProgress(pl.text);                 // 진행 라인은 항상(가벼운 검색도 라이브로 보이게)
  }
  // 대행 시작 → 풀시트/오브 상태를 도킹 미니챗으로 전환(편집기 도킹 openDock과 공유하는 표면)
  function enterAgentDock(){
    if(!sheet) build();
    if(_dock && sheet.classList.contains("fr-dock")) return;   // 이미 도킹
    _dock=true;
    bindKb(); bindStick(); _stick=true;
    if(mini) mini.classList.remove("on");
    orb && orb.classList.add("fr-hidden");
    sheet.classList.add("fr-dock"); sheet.classList.remove("fr-dock-min","fr-hasform");   // 에이전트 도킹=편집기 폼 없음(올리기 버튼 숨김)
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
    globe:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.7 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.7-3.9-9S9.5 5.6 12 3z"/></svg>',
    clip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a5 5 0 0 1-7.07-7.07l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
  };
  var STT = "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/galla-stt";
  var rec = null, recChunks = [], recording = false, voiceMode = false;
  // 🎙 네이티브 STT는 '세션 전체'를 누적 반환 → 이미 보낸 부분을 접두어로 빼서 재전송·중복 방지.
  var sttBase = "";
  function sttStrip(full){
    full = (full||"").trim();
    if(!sttBase) return full;
    if(full.indexOf(sttBase)===0) return full.slice(sttBase.length).replace(/^[\s,.·]+/,"").trim();   // 정확 접두어
    var bw = sttBase.split(/\s+/).length, fw = full.split(/\s+/);                                       // 재구두점 등 폴백=단어수
    return fw.length > bw ? fw.slice(bw).join(" ").trim() : full;
  }
  var voiceOut = false; try{ voiceOut = localStorage.getItem("frVoiceOut")==="1"; }catch(e){}   // 🔊 음성 답변 토글(기억)

  var orb, sheet, mini, logEl, taEl, sendEl;
  var _dock=false, _work=null;   // 🛠 작업 모드(도킹 미니챗) — 편집기 옆에서 같이 창작
  var _sources=[];               // 📎 근거 창구 — 콘텐츠 만들 재료(기사·링크·글·이미지)
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
        // 📎 근거 창구 — 콘텐츠 만들 때 기사·링크·글·이미지를 근거로 넣는 칩/입력
        '<div class="fr-srcchips"></div>'+
        '<div class="fr-srcadd" hidden>'+
          '<input class="fr-src-inp" placeholder="기사 링크나 글을 붙여넣어">'+
          '<button class="fr-src-img" aria-label="이미지 첨부">🖼</button>'+
          '<button class="fr-src-ok">담기</button>'+
          '<input type="file" class="fr-src-file" accept="image/*" hidden>'+
        '</div>'+
        // 🎙 마이크 버튼을 UI에 눈에 띄게 — 사람들이 키보드 받아쓰기를 잘 몰라서, 우리가 대신 쉽게.
        '<div class="fr-input">'+
          '<button class="fr-clip" aria-label="근거 첨부">'+ICON.clip+'</button>'+
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
    // 📎 근거 창구 배선
    var clip=sheet.querySelector(".fr-clip"), srcAdd=sheet.querySelector(".fr-srcadd"),
        srcInp=sheet.querySelector(".fr-src-inp"), srcOk=sheet.querySelector(".fr-src-ok"),
        srcImg=sheet.querySelector(".fr-src-img"), srcFile=sheet.querySelector(".fr-src-file");
    if(clip) clip.addEventListener("click", function(){ if(srcAdd){ srcAdd.hidden=!srcAdd.hidden; if(!srcAdd.hidden){ srcInp&&srcInp.focus(); } } });
    function commitSrcText(){
      var v=(srcInp&&srcInp.value||"").trim(); if(!v) return;
      if(/^https?:\/\/\S+$/i.test(v)){ var host=v; try{ host=new URL(v).hostname.replace(/^www\./,""); }catch(e){} addSource({type:"link", value:v, label:host}); }
      else addSource({type:"text", value:v, label:"글 "+v.slice(0,12)+(v.length>12?"…":"")});
      if(srcInp) srcInp.value=""; if(srcAdd) srcAdd.hidden=true;
    }
    if(srcOk) srcOk.addEventListener("click", commitSrcText);
    if(srcInp) srcInp.addEventListener("keydown", function(e){ if(e.key==="Enter"){ e.preventDefault(); commitSrcText(); } });
    if(srcImg) srcImg.addEventListener("click", function(){ srcFile&&srcFile.click(); });
    if(srcFile) srcFile.addEventListener("change", async function(e){
      var f=e.target.files&&e.target.files[0]; if(!f) return; srcFile.value="";
      if(typeof window.GALLA_UPLOAD_MEDIA!=="function"){ addMsg("a","이미지는 글쓰기 화면에서 넣어줘 ㅜ (여긴 링크·글만)"); return; }
      var id="src"+Date.now(); addSource({type:"image", url:"", label:"이미지 올리는 중…", pending:id});
      try{ var url=await window.GALLA_UPLOAD_MEDIA(f,"image"); updateSource(id,{url:url, label:"이미지", pending:null}); }
      catch(err){ removeSourceByPending(id); addMsg("a","이미지 올리다 삐끗했어 ㅜ 다시?"); }
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
  /* 📌 하단 고정 감시자 — "밑에 글 안 보임"의 근본 수정.
     append 순간의 scrollTop만으론 부족: 스트리밍으로 버블이 자라거나, 카드·이미지가 '나중에' 로드되면
     로그가 다시 바닥 밑으로 자란다. 유저가 바닥 근처(<80px)에 있는 동안엔 어떤 성장에도 자동 재고정.
     (유저가 위로 스크롤해 과거를 읽는 중이면 건드리지 않는다.) */
  var _stick=true;
  function bindStick(){
    if(!logEl || logEl.__stickBound) return; logEl.__stickBound=true;
    logEl.addEventListener("scroll", function(){
      _stick = (logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight) < 80;
    }, {passive:true});
    function restick(){ if(_stick) logEl.scrollTop=logEl.scrollHeight; }
    try{ new MutationObserver(restick).observe(logEl, {childList:true, subtree:true, characterData:true}); }catch(e){}
    logEl.addEventListener("load", restick, true);                       // 이미지·미디어 늦은 로드
    try{ new ResizeObserver(restick).observe(logEl); }catch(e){}          // 로그 영역 자체가 줄 때(키보드)
  }
  function open(){
    if(!sheet) build();
    bindKb();                                     // 키보드 트래킹(1회 등록)
    bindStick(); _stick=true;                     // 하단 고정 감시자(1회 등록) — 열 때는 항상 바닥부터
    if(mini) mini.classList.remove("on");
    orb && orb.classList.remove("fr-ping");
    document.body.classList.add("fr-chatting");   // 하단 내비 숨김
    sheet.classList.add("fr-open");
    // 🎟 남은 대화 pill — 열 때마다 갱신(쓴 만큼 줄어드는 게 보여야 업그레이드가 설득된다)
    try{
      var hd=sheet.querySelector(".fr-head");
      if(hd && window.GALLA_planPill){
        var old=hd.querySelector(".gpl-pill"); if(old) old.remove();
        window.GALLA_planPill(hd);
      }
    }catch(e){}
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
    bindKb(); bindStick(); _stick=true;   // 📌 도킹도 하단 고정 — 진입 직후 카드·이미지 늦은 성장에 밀리던 것
    if(mini) mini.classList.remove("on");
    orb && orb.classList.add("fr-hidden");               // 도킹 중엔 런처 오브 숨김
    sheet.classList.add("fr-dock", "fr-hasform"); sheet.classList.remove("fr-dock-min");   // fr-hasform=편집기폼 있음(올리기 버튼 노출)
    document.body.classList.add("fr-docked");
    sheet.classList.add("fr-open");                      // 편집기는 위에서 그대로 사용(스크림 pass-through)
    window.__frDidIntro=true;
    setTimeout(function(){ scrollBottom(); }, 300);
    // 🎬 작업 오프너 — 편집기 도착하면 갈비스가 '먼저' 말한다(침묵=방치 UX, 사장님 지적).
    //    복원(restoreOrGreet) '완료 후' 실행해 순서 보장. 서버가 workBlock(초안·미디어 유무) 보고
    //    "초안 채워놨어, 표지가 없어서 못 넘어가 — 내가 그려줄까?"식으로 리드.
    (async function(){
      var st=window.__frOpener={step:"start"};
      try{
        if(window.__frWorkOpened){ st.step="dup"; return; } window.__frWorkOpened=true;
        // 🔐 콜드스타트 세션 대기 — boot 직후 세션 복원 전이면 401로 오프너가 조용히 버려짐(미러링과 동일 레이스)
        for(var w=0; w<20 && !(await token()); w++){ await sleep(400); }
        st.step="token:"+w;
        if(!logEl.children.length){ try{ await restoreOrGreet(true); }catch(e){ st.restoreErr=String(e).slice(0,80); } }
        st.step="restored";
        typing(true);
        var r=await callFriend("", history, null, true);   // meta=기억오염 방지, fbBody가 work 상태 동봉
        if(r && r.reason==="auth"){ await sleep(1500); r=await callFriend("", history, null, true); }
        typing(false);
        st.step="called"; st.r = r ? {ok:r.ok, reason:r.reason, len:(r.reply||"").length} : null;
        if(r&&r.ok&&r.reply){ var m=await addFriendReply(r.reply, true); if(r.actions) addActions(m, r.actions); history.push({role:"assistant",content:r.reply}); saveChat(); scrollBottom(); st.step="done"; }
      }catch(e){ typing(false); st.err=String(e).slice(0,120); }
    })();
  }
  function toggleDockMin(){ if(sheet){ sheet.classList.toggle("fr-dock-min"); document.body.classList.toggle("fr-docked-min", sheet.classList.contains("fr-dock-min")); setTimeout(scrollBottom,260); } }
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
    if(sheet) sheet.classList.remove("fr-dock","fr-dock-min","fr-open","fr-hasform");
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
  // 📎 근거 소스 관리 — 콘텐츠 만들 재료(기사·링크·글·이미지). 다음 메시지에 실려 서버가 읽는다.
  function srcIcon(t){ return t==="image"?"🖼":t==="link"?"🔗":"📝"; }
  function addSource(s){ if(_sources.length>=6){ addMsg("a","근거는 한 번에 6개까지만 ㅋㅋ"); return; } _sources.push(s); renderSrcChips(); }
  function updateSource(id, patch){ for(var i=0;i<_sources.length;i++){ if(_sources[i].pending===id){ for(var k in patch) _sources[i][k]=patch[k]; break; } } renderSrcChips(); }
  function removeSourceByPending(id){ _sources=_sources.filter(function(s){ return s.pending!==id; }); renderSrcChips(); }
  function clearSources(){ _sources=[]; renderSrcChips(); }
  function renderSrcChips(){
    var box=sheet&&sheet.querySelector(".fr-srcchips"); if(!box) return;
    box.innerHTML="";
    _sources.forEach(function(s,i){
      var c=el('<span class="fr-srcchip'+(s.pending?" pend":"")+'"><b>'+srcIcon(s.type)+'</b><i></i><button aria-label="빼기">×</button></span>');
      c.querySelector("i").textContent=s.label||s.type;
      c.querySelector("button").addEventListener("click", function(){ _sources.splice(i,1); renderSrcChips(); });
      box.appendChild(c);
    });
    box.style.display=_sources.length?"flex":"none";
  }
  // 🗂 콘텐츠 기획안 카드 — '무엇을 만들까' 아이디어를 카드로. '만들기'→그 아이디어로 초안 요청.
  var PLAN_TYPE={ issue:"⚔️ 이슈", plaza:"📝 광장", gallari:"🎬 숏판·롱판", predict:"🎲 예측" };
  function renderPlan(ideas){
    if(!ideas || !ideas.length || !logEl) return;
    var wrap=el('<div class="fr-plan"></div>');
    ideas.forEach(function(idea){
      var card=el('<div class="fr-plan-card">'+
        '<span class="fr-plan-type"></span>'+
        '<div class="fr-plan-title"></div>'+
        '<div class="fr-plan-angle"></div>'+
        '<button class="fr-plan-make">만들기 →</button></div>');
      card.querySelector(".fr-plan-type").textContent=PLAN_TYPE[idea.type]||idea.type||"";
      card.querySelector(".fr-plan-title").textContent=idea.title||"";
      var ang=card.querySelector(".fr-plan-angle"), at=idea.angle||idea.why||"";
      if(at) ang.textContent=at; else ang.style.display="none";
      card.querySelector(".fr-plan-make").addEventListener("click", function(){
        sendText("이 아이디어로 만들어줘 — ["+(PLAN_TYPE[idea.type]||idea.type)+"] "+idea.title+(idea.angle?" / 각도: "+idea.angle:""));
      });
      wrap.appendChild(card);
    });
    logEl.appendChild(wrap); scrollBottom();
  }
  // 🔥 어그로 제목 후보 카드 — 탭하면 초안 제목으로 적용.
  function renderTitles(titles){
    if(!titles || !titles.length || !logEl) return;
    var wrap=el('<div class="fr-titles"></div>');
    wrap.appendChild(el('<div class="fr-titles-h">🔥 제목 골라봐 — 탭하면 적용</div>'));
    titles.forEach(function(t){
      var card=el('<button class="fr-title-card"><span class="fr-title-t"></span><span class="fr-title-s"></span></button>');
      card.querySelector(".fr-title-t").textContent=t.text;
      var s=card.querySelector(".fr-title-s"); if(t.style) s.textContent=t.style; else s.style.display="none";
      card.addEventListener("click", function(){ applyTitle(t.text, t.style); });
      wrap.appendChild(card);
    });
    logEl.appendChild(wrap); scrollBottom();
  }
  function applyTitle(text, style){
    var applied=false;
    try{
      var wf=window.GALLA_WORKFORM;
      if(wf && wf.setFields){ wf.setFields(wf.type==="predict"?{question:text}:{title:text}); applied=true; flashDock(); }
    }catch(e){}
    // 📈 성과 피드백 — 고른 제목의 공식(style) 선택수↑ → 잘 먹히는 공식이 다음에 더 자주 뽑힌다(브레인 자가학습)
    try{ if(style && window.supabaseClient) window.supabaseClient.rpc("pattern_feedback",{p_kind:"title",p_style:style,p_signal:"pick"}).then(function(){},function(){}); }catch(e){}
    // 🔗 실제 성과 역연결 — 이 공식으로 발행되면 콘텐츠에 기록(confirm.js가 첨부) → 크론이 반응 측정
    try{ if(style) sessionStorage.setItem("GALLA_PICKED_STYLE", JSON.stringify({ style:style, at:Date.now() })); }catch(e){}
    addMsg("a", applied ? "'"+text+"' 로 넣었어 👍 별로면 다른 것도 골라봐" : "'"+text+"' — 이걸로 가자! (편집기에서 제목칸에 넣어줘)");
  }
  // 📜 대본 카드 — 스크롤 블록 + 복사
  function renderScript(text){
    if(!text || !logEl) return;
    var wrap=el('<div class="fr-script"><div class="fr-script-h">📜 대본</div><div class="fr-script-body"></div><button class="fr-script-copy">복사</button></div>');
    wrap.querySelector(".fr-script-body").textContent=text;
    var cp=wrap.querySelector(".fr-script-copy");
    cp.addEventListener("click", function(){ try{ navigator.clipboard.writeText(text); }catch(e){} cp.textContent="복사됨 ✓"; setTimeout(function(){ cp.textContent="복사"; },1500); });
    logEl.appendChild(wrap); scrollBottom();
  }
  // 🖼 AI 썸네일 생성 — generate-thumbnail 엣지 호출(몇 초) → 편집기에 대표이미지로 자동 첨부 + 챗 미리보기.
  /* 🔁 진행 중 중복 실행 가드 — 액션이 두 장 오거나 유저가 연타하면 200 GC 가 두 번 빠진다.
     서버도 지문으로 멱등하게 막지만(ai_creation_locks), 여기서 먼저 끊는 게 원가·대기시간 모두 아낀다. */
  var thumbBusy = null;
  async function genThumbnail(a){
    var key = String((a && a.prompt) || "") + "|" + String((a && a.ratio) || "") + "|" + String((a && a.useUserPhotos) || "");
    if (thumbBusy === key) return;              // 같은 요청이 이미 돌고 있다
    thumbBusy = key;
    try { return await genThumbnailInner(a); } finally { thumbBusy = null; }
  }
  async function genThumbnailInner(a){
    // 🧑‍🎨 내 사진 반영 모드 — 작업 모드(숏판·롱판)에 올린 사진을 레퍼런스로
    var refUrls=[];
    if(a && a.useUserPhotos){
      try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.getPhotos) refUrls=(window.GALLA_WORKFORM.getPhotos()||[]).slice(0,4); }catch(e){}
      if(!refUrls.length){ addMsg("a","앗 내 사진으로 하려면 먼저 사진을 올려줘 — 작업창에 사진 넣고 다시 '내 사진으로 썸네일 그려줘' 해줘 ㅋㅋ"); return; }
    }
    showProgress(refUrls.length ? "🎨 네 사진으로 썸네일 뽑는 중… (몇 초)" : "🎨 썸네일 그리는 중… (몇 초 걸려)");
    try{
      var jwt=await token(); if(!jwt){ clearProgress(); addMsg("a","로그인해야 그려줄 수 있어 ㅜ"); return; }
      var res=await fetch(SB+"/functions/v1/generate-thumbnail",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({ prompt:a.prompt||"", ratio:a.ratio||"portrait", image_urls:refUrls }) });
      var d=await res.json(); clearProgress();
      if(d && d.ok && d.url){
        var applied=false;
        try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.setThumbnail){ window.GALLA_WORKFORM.setThumbnail(d.url); applied=true; flashDock(); } }catch(e){}
        var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><img class="fr-thumb" alt="썸네일"></div></div>');
        m.querySelector("img").src=d.url; logEl.appendChild(m); scrollBottom();
        addMsg("a", applied ? "이 느낌 어때? 대표 이미지로 붙여놨어 — 별로면 다시 그려줄게" : "그려봤어! 맘에 들면 길게 눌러 저장해서 써 ㅋㅋ");
      } else {
        var why=(d&&d.error)||"fail";
        if(why==="insufficient"||why==="charge_failed"){
          addMsg("a","GC가 모자라서 못 그렸어 ㅜ 썸네일 한 장에 200 GC거든 — 후원받거나 충전하고 다시 가자");
          try{ window.openShop && window.openShop(); }catch(e){}
          return;
        }
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
      for(var k=0;k<a.imagePrompts.length && k<3;k++){   // ⏱ 10초 숏폼 정책 — 장면 3개까지
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
        body:JSON.stringify({ op:"submit", images:images, captions:a.captions||[], music:a.music||"upbeat", ratio:a.ratio||"9:16", per:a.per||3 }) })).json();
      if(!sub || !sub.ok || !sub.id){
        clearProgress();
        if(sub && (sub.error==="insufficient" || sub.error==="charge_failed")){
          addMsg("a","GC가 모자라서 영상은 못 만들었어 ㅜ 자동편집 영상 한 편에 1000 GC거든 — 후원받거나 충전하고 다시 가자");
          try{ window.openShop && window.openShop(); }catch(e){}
          return;
        }
        addMsg("a", (sub&&sub.error==="user_daily_limit") ? "오늘 영상 많이 뽑았다 ㅋㅋ 내일 또 만들어줄게" :
          (sub&&(sub.error==="no_shotstack_key"||sub.error==="feature_locked")) ? "자동편집 영상은 아직 준비 중이야 ㅜ 곧 열게! 대신 제목·썸네일·대본은 내가 지금 다 뽑아줄 수 있어 — 영상은 직접 찍어 올리면 돼" :
          "앗 영상 시작이 안 되네 ㅜ 다시 해볼까?");
        return;
      }
      var url=await pollVideo(jwt, sub.id);
      clearProgress();
      if(url){
        var vk=a.ratio==="16:9"?"horizontal":"vertical", thumb=images[0], applied=false;
        try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.setVideo){ window.GALLA_WORKFORM.setVideo(url, thumb, vk); applied=true; flashDock(); } }catch(e){}
        // 가로 롱판은 제목 필수 — 갈비스가 준 제목을 폼에 세팅
        try{ if(vk==="horizontal" && a.title && window.GALLA_WORKFORM && window.GALLA_WORKFORM.setFields){ window.GALLA_WORKFORM.setFields({ title:a.title }); } }catch(e){}
        var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><video class="fr-thumb" controls playsinline muted></video></div></div>');
        m.querySelector("video").src=url; logEl.appendChild(m); scrollBottom();
        addMsg("a", applied ? "영상 뽑았어! 편집기에 넣어놨으니 보고 맘에 들면 올려 🎬" : "영상 완성! 맘에 들면 저장해서 써 ㅋㅋ");
      } else { addMsg("a","영상 만들다 삐끗했어 ㅜ 다시 해볼까?"); }
    }catch(e){ clearProgress(); addMsg("a","영상 만들다 문제 생겼어 ㅜ 다시?"); }
  }
  /* 🎞 실촬영 릴스 — '릴스 실행 에이전트' 접수 카드(사장님 확정 구조: 자체 ffmpeg 렌더러 완주).
     카드에서: 녹음(또는 AI 목소리 선택) → reel-agent 잡 생성 → 서버가 STT 정렬·클립 비전 분석·
     AI 내용 매칭까지 자율 실행 → 렌더 워커가 완성 → 카드가 status 폴링으로 진행을 보여주고
     완성되면 편집기에 자동 첨부(setVideo). 앱을 나가도 잡은 서버에 살아있다. */
  function renderReelScript(text, place){
    if(!text || !logEl) return;
    var wrap=el('<div class="fr-script fr-reel"><div class="fr-script-h">🎞 릴스 대본'+(place?" — "+place:"")+'</div><div class="fr-script-body"></div>'+
      '<div class="fr-reel-ctl"><button class="fr-reel-rec">🎙 녹음 시작</button><button class="fr-reel-ai">🤖 AI 목소리로</button><span class="fr-reel-time"></span></div>'+
      '<div class="fr-reel-done" hidden><audio class="fr-reel-audio" controls></audio>'+
      '<div class="fr-reel-ctl"><button class="fr-reel-redo">다시 녹음</button><button class="fr-reel-make">🎬 이 녹음으로 영상 만들기</button></div></div>'+
      '<div class="fr-reel-status"></div></div>');
    wrap.querySelector(".fr-script-body").textContent=text;
    var recBtn=wrap.querySelector(".fr-reel-rec"), timeEl=wrap.querySelector(".fr-reel-time"),
        doneEl=wrap.querySelector(".fr-reel-done"), audioEl=wrap.querySelector(".fr-reel-audio"),
        stEl=wrap.querySelector(".fr-reel-status");
    var mr=null, chunks=[], blob=null, t0=0, tick=null;
    function status(s){ stEl.textContent=s||""; }
    function stopTick(){ if(tick){ clearInterval(tick); tick=null; } }
    recBtn.addEventListener("click", async function(){
      if(mr && mr.state==="recording"){ mr.stop(); return; }
      try{
        var stream=await navigator.mediaDevices.getUserMedia({audio:true});
        // iOS Safari/앱은 mp4(m4a), 크롬은 webm — Shotstack·STT 둘 다 소화 가능한 쪽으로
        var mime=(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported("audio/mp4"))?"audio/mp4":"audio/webm";
        mr=new MediaRecorder(stream,{mimeType:mime}); chunks=[];
        mr.ondataavailable=function(e){ if(e.data && e.data.size) chunks.push(e.data); };
        mr.onstop=function(){
          stopTick(); stream.getTracks().forEach(function(t){t.stop();});
          blob=new Blob(chunks,{type:mime});
          audioEl.src=URL.createObjectURL(blob);
          recBtn.parentElement.hidden=true; doneEl.hidden=false;
          status("들어보고 괜찮으면 [영상 만들기] — 대본이랑 좀 달라도 자막은 실제 녹음 기준으로 맞춰줘");
        };
        mr.start(250); t0=Date.now();
        recBtn.textContent="⏹ 녹음 끝";
        tick=setInterval(function(){ timeEl.textContent=((Date.now()-t0)/1000).toFixed(0)+"s / 목표 30s"; },500);
        status("대본을 소리내어 읽어줘 — 구절마다 또박또박!");
      }catch(e){ status("마이크를 못 열었어 ㅜ 권한을 확인해줘"); }
    });
    wrap.querySelector(".fr-reel-redo").addEventListener("click", function(){
      blob=null; doneEl.hidden=true; recBtn.parentElement.hidden=false; recBtn.textContent="🎙 녹음 시작"; timeEl.textContent=""; status("");
    });
    wrap.querySelector(".fr-reel-make").addEventListener("click", function(){ if(blob) makeReel(blob, text, wrap, status); });
    wrap.querySelector(".fr-reel-ai").addEventListener("click", function(){ makeReel(null, text, wrap, status); });
    logEl.appendChild(wrap); scrollBottom();
  }
  // 클립 실제 길이(초) — 메타데이터만 로드해 잰다. 실패 시 8초 가정.
  function clipDuration(url){
    return new Promise(function(res){
      var v=document.createElement("video"); v.preload="metadata"; v.muted=true;
      var done=false, fin=function(d){ if(!done){ done=true; res(d); } };
      v.onloadedmetadata=function(){ fin(isFinite(v.duration)&&v.duration>0?v.duration:8); };
      v.onerror=function(){ fin(8); };
      setTimeout(function(){ fin(8); },4000);
      v.src=url;
    });
  }
  /* 👀 컷 미리보기 — AI가 짠 컷을 사람이 눈으로 보고 2탭으로 바꾼다.
     "AI가 100% 맞출 때까지 기다린다"가 아니라 "AI가 90% 만들고 사람이 10초 만에 완성한다"가 실전이다. */
  /* ▶ 미리보기 재생기 — renderCutPreview에서 쓰고, 하네스·다른 화면에서도 쓸 수 있게 밖으로 뺀다. */
  function mountReelPlayer(box, getCuts, voiceUrl, subs, status){
    subs=subs||[]; status=status||function(){};

      var vids=box.querySelectorAll(".fr-pv-v"), act=0, curK=-1, raf=null, playing=false;
      var subEl=box.querySelector(".fr-pv-sub span"), btn=box.querySelector(".fr-pv-btn");
      var audio=new Audio(); audio.preload="auto"; if(voiceUrl) audio.src=voiceUrl;
      function map(){ var t=0, a=[]; getCuts().forEach(function(c){ a.push({s:t, e:t+c.dur, c:c}); t+=c.dur; }); return a; }
      function show(i){ vids[i].style.opacity="1"; vids[1-i].style.opacity="0"; act=i; }
      function feed(v, src, off, then){
        if(v.getAttribute("data-src")!==src){
          v.setAttribute("data-src", src); v.src=src;
          v.addEventListener("loadedmetadata", function(){ try{ v.currentTime=off; }catch(e){} if(then) then(); }, {once:true});
        } else { try{ v.currentTime=off; }catch(e){} if(then) then(); }
      }
      function goCut(k, at, m){
        var it=m[k]; if(!it || !it.c.src) return;
        curK=k;
        var nx=1-act, v=vids[nx];
        v.style.objectPosition=(((typeof it.c.cx==="number"?it.c.cx:0.5)*100).toFixed(0))+"% 50%";
        feed(v, it.c.src, (it.c.in||0)+Math.max(0, at-it.s), function(){
          v.play().catch(function(){}); show(nx);
          var nb=m[k+1];   // 다음 클립을 지금 안 보이는 쪽에 미리 물려둔다(전환 끊김 방지)
          if(nb && nb.c.src) feed(vids[1-nx], nb.c.src, nb.c.in||0);
        });
      }
      function tick(){
        if(!playing) return;
        var t=audio.currentTime, m=map(), k=-1;
        for(var i=0;i<m.length;i++){ if(t>=m[i].s && t<m[i].e){ k=i; break; } }
        if(k<0 && t>=(m.length?m[m.length-1].e:0)){ stop(); return; }
        if(k>=0 && k!==curK) goCut(k, t, m);
        var s="";
        for(var j=0;j<subs.length;j++){ var x=subs[j]; if(t>=x.start && t<x.start+(x.len||0.5)){ s=x.text; break; } }
        subEl.textContent=s;
        raf=requestAnimationFrame(tick);
      }
      function stop(){
        playing=false; if(raf) cancelAnimationFrame(raf); raf=null;
        try{ audio.pause(); }catch(e){}
        vids[0].pause(); vids[1].pause(); subEl.textContent="";
        btn.textContent="▶ 미리보기 재생";
      }
      btn.addEventListener("click", function(){
        if(playing){ stop(); return; }
        if(!voiceUrl){ status("미리보기 음성을 못 찾았어 ㅜ"); return; }
        playing=true; curK=-1; btn.textContent="⏸ 정지";
        try{ audio.currentTime=0; }catch(e){}
        audio.play().then(function(){ raf=requestAnimationFrame(tick); }).catch(function(){ stop(); });
      });
      audio.addEventListener("ended", stop);
  }
  window.GALLA_ReelPreview=mountReelPlayer;

  function renderCutPreview(jobId, cuts, allClips, jwt, srcClips, parentWrap, status, unlock, voiceUrl, subs){
    subs=subs||[];
    /* 🅰🅱 문장 단위 확인 화면 — 타임라인(트랙·초·드래그)은 보여주지 않는다.
       사용자가 아는 단위는 '문장'이고, 판단은 "이 문장에 이 화면이 맞나"뿐이다.
       그리고 12개 클립을 뒤지게 하지 않는다 — **A(지금)와 B(차점 후보)를 나란히 놓고 1탭으로 고르게** 한다.
       AI가 자신 없는 자리(unsure)는 먼저 눈에 띄게 표시한다. 더 파고들 사람만 '다른 화면 더 보기'로 내려간다. */
    var box=el('<div class="fr-cutpv"><div class="fr-cutpv-h">🎞 문장마다 화면 확인 — 어색하면 <b>B</b>를 탭</div>'+
      '<div class="fr-pv"><div class="fr-pv-stage">'+
      '<video class="fr-pv-v" muted playsinline webkit-playsinline preload="auto"></video>'+
      '<video class="fr-pv-v" muted playsinline webkit-playsinline preload="auto"></video>'+
      '<div class="fr-pv-sub"><span></span></div></div>'+
      '<button class="fr-pv-btn">▶ 미리보기 재생</button></div>'+
      '<div class="fr-cutpv-list"></div>'+
      '<button class="fr-cutpv-go">이대로 영상 만들기 🎬</button></div>');
    var list=box.querySelector(".fr-cutpv-list");
    var curCuts=cuts;
    /* ▶ 무료 미리보기 — **렌더를 두 번 돌리지 않는다.** 원본 클립을 순서대로 이어 재생하고
       녹음(또는 AI 음성)을 같이 틀고 자막을 얹으면, 최종본과 같은 타이밍을 서버 비용 0·대기 0초로 보여줄 수 있다.
       카드만 봐선 템포(빠른가·끊기나)를 알 수 없어서, 확인 화면엔 재생이 반드시 있어야 한다.
       ⚠️ 최종본은 여기서 '마'(쉬는 구간)를 더 잘라내므로 완성본이 이것보다 몇 초 짧다. */
    mountReelPlayer(box, function(){ return curCuts; }, voiceUrl, subs, status);
    async function chooseAlt(cut, clipIdx){
      try{
        var r=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
          body:JSON.stringify({ op:"swap", id:jobId, cut:cut, clip:clipIdx }) })).json();
        if(r && r.cuts) paint(r.cuts);
      }catch(e){}
    }
    function paint(cs){
      curCuts=cs;
      list.innerHTML="";
      cs.forEach(function(c){
        var row=el('<div class="fr-cut2">'+
          '<div class="fr-cut2-txt"></div>'+
          '<div class="fr-cut2-opts"></div>'+
          '<button class="fr-cut2-more">다른 화면 더 보기</button></div>');
        row.querySelector(".fr-cut2-txt").textContent=(c.text? ("「"+c.text+"」") : "이어지는 화면")+(c.unsure? "  ⚠️ 확실치 않아요":"");
        if(c.unsure) row.classList.add("unsure");
        var opts=row.querySelector(".fr-cut2-opts");
        var cards=[{ label:"A", clip:c.clip, thumb:c.thumb, cap:c.cap, on:true }]
          .concat((c.alts||[]).slice(0,1).map(function(a){ return { label:"B", clip:a.clip, thumb:a.thumb, cap:a.cap, on:false }; }));
        cards.forEach(function(o){
          var b=el('<button class="fr-opt'+(o.on?" on":"")+'"><span class="fr-opt-tag"></span><img alt=""><span class="fr-opt-cap"></span></button>');
          b.querySelector(".fr-opt-tag").textContent=o.label;
          if(o.thumb) b.querySelector("img").src=o.thumb; else b.querySelector("img").style.visibility="hidden";
          b.querySelector(".fr-opt-cap").textContent=o.cap||"";
          if(!o.on) b.addEventListener("click", function(){ chooseAlt(c.cut, o.clip); });
          opts.appendChild(b);
        });
        /* ◀▶ 위치 조정 — 가로로 찍은 원본만 9:16으로 자를 때 잘려나갈 여백이 생긴다.
           세로 원본은 잘라낼 게 없어 아예 숨긴다(있지도 않은 선택지로 방해하지 않는다). */
        var nudge=el('<div class="fr-nudge" hidden><button data-d="-1">◀</button>'+
          '<button data-d="0">가운데</button><button data-d="1">▶</button></div>');
        if(c.thumb){
          var probe=new Image();
          probe.onload=function(){ if(probe.naturalWidth/probe.naturalHeight > 0.60) nudge.hidden=false; };
          probe.src=c.thumb;
        }
        nudge.querySelectorAll("button").forEach(function(b){
          b.addEventListener("click", async function(){
            var d=Number(b.getAttribute("data-d"));
            var cur=(typeof c.cx==="number")?c.cx:0.5;
            var nx=(d===0)?0.5:Math.min(0.85,Math.max(0.15,cur+d*0.12));
            try{
              var r=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
                headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
                body:JSON.stringify({ op:"nudge", id:jobId, cut:c.cut, cx:nx }) })).json();
              if(r && r.cuts) paint(r.cuts);
            }catch(e){}
          });
        });
        row.insertBefore(nudge, row.querySelector(".fr-cut2-more"));
        row.querySelector(".fr-cut2-more").addEventListener("click", function(){ openPicker(c, row); });
        list.appendChild(row);
      });
    }
    function openPicker(cut, row){
      var old=list.querySelector(".fr-pick"); if(old) old.remove();
      var pick=el('<div class="fr-pick"></div>');
      allClips.forEach(function(cl){
        var b=el('<button class="fr-pick-it"><img alt=""><span></span></button>');
        if(cl.thumb) b.querySelector("img").src=cl.thumb;
        b.querySelector("span").textContent=cl.cap||("클립 "+(cl.clip+1));
        b.addEventListener("click", async function(){
          pick.remove();
          try{
            var r=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
              headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
              body:JSON.stringify({ op:"swap", id:jobId, cut:cut.cut, clip:cl.clip }) })).json();
            if(r && r.cuts) paint(r.cuts);
          }catch(e){}
        });
        pick.appendChild(b);
      });
      row.insertAdjacentElement("afterend", pick);
    }
    paint(cuts);
    box.querySelector(".fr-cutpv-go").addEventListener("click", async function(){
      box.querySelector(".fr-cutpv-go").disabled=true;
      status("🎬 영상 만드는 중…");
      try{
        await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
          body:JSON.stringify({ op:"approve", id:jobId }) });
      }catch(e){}
      pollReelDone(jobId, jwt, srcClips, status, unlock);
    });
    logEl.appendChild(box); scrollBottom();
  }
  // 렌더 완료까지 폴링 → 편집기 자동 첨부
  async function pollReelDone(jobId, jwt, clips, status, unlock){
    for(var tries=0; tries<200; tries++){
      await sleep(3000);
      var st;
      try{ st=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({ op:"status", id:jobId }) })).json(); }catch(e){ continue; }
      var job=st && st.job; if(!job) continue;
      var prog=(job.progress||[]); if(prog.length) status("🎬 "+prog[prog.length-1].msg);
      if(job.state==="done"){
        var url=(job.artifacts||{}).video_url; status("");
        var applied=false;
        try{ if(url && window.GALLA_WORKFORM && window.GALLA_WORKFORM.setVideo){ window.GALLA_WORKFORM.setVideo(url, (clips[0]||{}).thumb||null, "vertical"); applied=true; flashDock(); } }catch(e){}
        if(url){
          var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><video class="fr-thumb" controls playsinline></video></div></div>');
          m.querySelector("video").src=url; logEl.appendChild(m); scrollBottom();
        }
        addMsg("a", applied ? "릴스 완성! 편집기에 넣어놨어 — [공유]만 누르면 발행 🎬" : "릴스 완성! 영상 꾹 눌러 저장해 쓰면 돼 🎬");
        unlock(); return;
      }
      if(job.state==="failed"){ status(""); addMsg("a","만들다 실패했어 ㅜ 다시 해볼까?"); unlock(); return; }
    }
    unlock(); addMsg("a","렌더가 오래 걸리네 ㅜ 잠시 뒤 '내 릴스 어떻게 됐어?' 하고 물어봐줘");
  }

  async function makeReel(blob, script, wrap, status){
    var makeBtn=wrap.querySelector(".fr-reel-make"), aiBtn=wrap.querySelector(".fr-reel-ai");
    makeBtn.disabled=true; if(aiBtn) aiBtn.disabled=true;
    var unlock=function(){ makeBtn.disabled=false; if(aiBtn) aiBtn.disabled=false; };
    try{
      // 1) 소스 클립 — 편집기(숏판)에서 수집(+실측 길이). 에이전트가 내용 매칭에 쓴다.
      var items=[];
      try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.getClips) items=window.GALLA_WORKFORM.getClips()||[]; }catch(e){}
      var clips=items.filter(function(c){ return c.kind==="video"; });
      if(!clips.length){
        unlock();
        addMsg("a", items.length ? "사진만으론 릴스 배치가 안 돼 ㅜ 현장에서 찍은 '영상 클립'을 숏판 편집기에 올려줘 (10초 내외 여러 개면 최고)" : "먼저 숏판 편집기에 네가 찍은 클립들을 올려줘! 거기서 다시 부르면 바로 만들게");
        return;
      }
      var jwt=await token(); if(!jwt){ unlock(); addMsg("a","로그인해야 만들 수 있어 ㅜ"); return; }
      status("클립 확인 중…");
      for(var i=0;i<clips.length;i++) clips[i].dur=await clipDuration(clips[i].url);
      // 2) 음성 — 녹음이면 업로드, 없으면 AI 목소리 모드
      var voiceUrl=null;
      if(blob){
        status("🎙 녹음 올리는 중…");
        var ext=(blob.type||"").indexOf("mp4")>=0?"m4a":"webm";
        voiceUrl=await window.GALLA_UPLOAD_MEDIA(new File([blob],"reel-voice."+ext,{type:blob.type||"audio/webm"}),"audio");
      }
      // 3) 릴스 에이전트 접수 — 서버가 정렬·분석·매칭·렌더큐까지 자율 실행
      status("🤖 에이전트 접수 중…");
      var res=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify(blob ? { op:"create", script:script, clips:clips, voice_url:voiceUrl }
                                 : { op:"create", script:script, clips:clips, voice_mode:"ai" }) })).json();
      if(!res || !res.ok || !res.id){
        unlock(); status("");
        addMsg("a", res&&res.error==="stt_failed" ? "녹음을 못 알아들었어 ㅜ 조용한 데서 또박또박 다시 녹음해볼래?" : "접수가 안 됐어 ㅜ 다시 해볼까?");
        return;
      }
      // 4) 미리보기 — 컷을 카드로 보여주고 2탭으로 교체(완성도는 여기서 사람이 채운다)
      if(res.state==="preview" && res.cuts && res.cuts.length){
        status("");
        renderCutPreview(res.id, res.cuts, res.clips||[], jwt, clips, wrap, status, unlock, res.voice||voiceUrl, res.subtitles||[]);
        return;
      }
      // 4') 잡 status 폴링 — 진행 로그를 카드에 흘리고, 완성되면 편집기 자동 첨부
      var jobId=res.id, tries=0, doneUrl=null;
      while(tries++<200){
        await sleep(3000);
        var st;
        try{ st=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
          body:JSON.stringify({ op:"status", id:jobId }) })).json(); }catch(e){ continue; }
        var job=st && st.job;
        if(!job) continue;
        var prog=(job.progress||[]); var last=prog.length?prog[prog.length-1].msg:"";
        if(last) status("🎬 "+last);
        /* ⚠️ create가 잡 id만 즉시 돌려주는 구조(엣지 150초 한도)로 바뀐 뒤로는 **여기서** 미리보기를 열어야 한다.
           안 그러면 preview 상태에서 폴링만 계속 돌다 조용히 포기한다(실사고). */
        if(job.state==="preview"){
          status("");
          var cu=null;
          try{ cu=await (await fetch(SB+"/functions/v1/reel-agent",{ method:"POST",
            headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
            body:JSON.stringify({ op:"cuts", id:jobId }) })).json(); }catch(e){}
          if(cu && cu.cuts && cu.cuts.length){
            renderCutPreview(jobId, cu.cuts, cu.clips||[], jwt, clips, wrap, status, unlock, cu.voice, cu.subtitles||[]);
            return;
          }
        }
        if(job.state==="done"){ doneUrl=(job.artifacts||{}).video_url; break; }
        if(job.state==="failed"){ unlock(); status(""); addMsg("a","만들다 실패했어 ㅜ ("+String(job.error||"").slice(0,60)+") 다시 해볼까?"); return; }
      }
      status("");
      if(doneUrl){
        var applied=false;
        try{ if(window.GALLA_WORKFORM && window.GALLA_WORKFORM.setVideo){ window.GALLA_WORKFORM.setVideo(doneUrl, clips[0].thumb||null, "vertical"); applied=true; flashDock(); } }catch(e){}
        var m=el('<div class="fr-msg fr-a"><div class="fr-bubble"><video class="fr-thumb" controls playsinline></video></div></div>');
        m.querySelector("video").src=doneUrl; logEl.appendChild(m); scrollBottom();
        addMsg("a", applied ? "릴스 완성! 편집기에 넣어놨어 — 확인하고 [공유]만 누르면 발행 🎬 (인스타에 올리려면 영상 꾹 눌러 저장)" : "릴스 완성! 영상 꾹 눌러서 저장해 쓰면 돼 🎬");
        unlock();
      } else { unlock(); addMsg("a","렌더가 오래 걸리네 ㅜ 잠시 뒤에 '내 릴스 어떻게 됐어?' 하고 물어봐줘 — 잡은 살아있어"); }
    }catch(e){ unlock(); status(""); addMsg("a","만들다 문제 생겼어 ㅜ 다시 해볼까?"); }
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
  // 🎉 검사·발행(confirm) 페이지 동행 — 편집기 폼은 없지만 갈비스가 접힌 바로 남아 마지막까지 응원(동행 끊김 마찰#10).
  function tryCheerForConfirm(){
    var cheer=null; try{ cheer=sessionStorage.getItem("GALLA_WORK_CHEER"); }catch(e){}
    if(!cheer) return;
    if(!/confirm/.test(location.pathname)) return;
    try{ sessionStorage.removeItem("GALLA_WORK_CHEER"); }catch(e){}
    enterAgentDock();
    if(sheet){ sheet.classList.add("fr-dock-min"); document.body.classList.add("fr-docked-min"); }   // 접힌 바(검사 화면 가리지 않게)
    addMsg("a","거의 다 왔어! 검사 통과하면 [최종 발행]만 누르면 끝이야 🎉");
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
    // 🌐 웹 전용: 키보드가 페이지를 밀어올리면(vv.offsetTop>0) fixed 패널이 어긋난다 — 오프셋만큼 같이 이동.
    function setOff(){ if(vv) root.style.setProperty("--fr-off", Math.round(vv.offsetTop||0)+"px"); }
    // 평상시(비애니)엔 vv 실측으로 정확히. 애니 중엔 차단.
    if(vv){
      vv.addEventListener("resize", function(){ if(window.__frKbShowing) return; setVvh(vv.height); setOff(); scrollBottom(); });
      vv.addEventListener("scroll", function(){ if(window.__frKbShowing) return; setOff(); });
      setVvh(vv.height); setOff();
    }
    // 🛟 키보드 이벤트 유실 복구 — 어떤 이유로든(플러그인 미로드·이벤트 누락) vvh가 갱신 안 되면
    //    입력창이 키보드에 가린다. 포커스 후 실측으로 한 번 더 보정(정상 동작이면 같은 값이라 무해).
    document.addEventListener("focusin", function(e){
      if(!e.target || !e.target.closest || !e.target.closest("#frSheet")) return;
      setTimeout(function(){ if(window.__frKbShowing) return; if(vv){ setVvh(vv.height); setOff(); } scrollBottom(); }, 450);
    });
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
      if(ping){ addMsg("a", ping); history.push({role:"assistant",content:ping}); saveChat(); return; }
      /* 🗣 대화 기록이 있어도 '먼저' 말을 건다 — 예전엔 여기서 return 해버려서, 한 번이라도 얘기한
         사람은 그 뒤로 영원히 침묵했다(사장님: "버튼 눌러도 아무 대꾸가 없음"). 컴패니언이 아니었다.
         '언제 말 걸지'(공백 30분 미만이면 조용)는 서버가 정한다 — 여긴 항상 요청만 한다. */
      if(!suppressGreet) greet();
      return;
    }
    var ping2=await pingP;
    if(ping2){ addMsg("a", ping2); history.push({role:"assistant",content:ping2}); saveChat(); return; }
    if(suppressGreet) return;      // askGalvis가 콘텐츠 오프너를 대신 낸다
    greet();
  }
  var _greetStale=false;   // 🔐 greet race — 인사 응답 오기 전에 유저가 먼저 말 걸면 인사를 버린다(요청 씹힘 방지, 실사용 E2E 마찰#1)
  async function greet(){
    // 빈 메시지 → 서버가 첫만남/재방문 판단해 반겨줌(기억 리콜 + 그 사이 갈라에서 한 일)
    _greetStale=false;
    /* ⌨️ 타이핑 표시는 '늦게' 띄운다 — 서버가 "조용히 있어라"(공백 30분 미만)로 즉답하면
       말풍선도 없이 점만 깜빡였다 사라져 고장난 것처럼 보인다. 400ms 안에 오면 아예 안 띄운다. */
    var tShown=false, tT=setTimeout(function(){ tShown=true; typing(true); }, 400);
    var r = await callFriend("", []);
    clearTimeout(tT); if(tShown) typing(false);
    if(_greetStale){ if(r&&r.friendName){ friendName=r.friendName; setTitle(); } return; }   // 유저가 이미 용건을 말함 — 인사 폐기
    if(r && r.friendName){ friendName=r.friendName; setTitle(); }
    /* 🤫 서버가 '지금은 말 걸 때가 아니다'라고 판단하면(quiet 또는 빈 reply) 조용히 물러난다.
       ⚠️ 여기서 기본 인사말로 대체하면 침묵 문턱이 통째로 무의미해진다(열 때마다 "안녕!" 스팸). */
    if(r && (r.quiet===true || (typeof r.reply==="string" && !r.reply.trim()))) return;
    // 서버 응답 자체가 없으면(네트워크 실패) 첫 대화일 때만 기본 인사 — 기록이 있으면 조용히 넘어간다.
    if(!r && history.length) return;
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
      // 🎟 가입 유도 — 맛보기가 끝났을 때만 뜬다. 지금까지 나눈 대화가 아까워지는 지점에 딱 하나.
      if(a.kind==="signup"){
        var sb2=el('<button class="fr-chip fr-chip-cta"></button>');
        sb2.textContent=a.label||"가입하고 계속하기";
        sb2.onclick=function(){
          try{ sessionStorage.setItem("galla_after_login","friend"); }catch(e){}
          location.href="login.html?next=" + encodeURIComponent(location.pathname + location.search);
        };
        wrap.appendChild(sb2); return;
      }
      // 🆘 위기 상담 카드 — 차분한 전용 카드 + 탭하면 바로 전화(tel:). 지어낸 번호 아님(서버가 고정 첨부).
      if(a.kind==="crisis"){
        var box=el('<div class="fr-crisis"></div>');
        if(a.title) box.appendChild(el('<div class="fr-crisis-t"></div>')).textContent=a.title;
        (a.lines||[]).forEach(function(ln){
          var row=el('<a class="fr-crisis-call"></a>');
          row.setAttribute("href","tel:"+String(ln.tel||"").replace(/[^0-9]/g,""));
          row.innerHTML='<span class="fr-crisis-ph">'+ICON.globe+'</span><span class="fr-crisis-body"><b>'+esc(ln.label||"")+'</b>'+(ln.sub?'<i>'+esc(ln.sub)+'</i>':'')+'</span><span class="fr-crisis-num">'+esc(ln.tel||"")+'</span>';
          box.appendChild(row);
        });
        wrap.appendChild(box);
        return;
      }
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
  // 📲 외부 앱 핸드오프 — 친구가 카카오T·지도·배민 등을 열어준다(실제 호출·결제는 유저가 그 앱에서 확정).
  //    네이티브: 앱 스킴 우선(AppLauncher canOpenUrl→openUrl), 미설치/웹이면 https(설치 시 OS가 앱으로 라우팅).
  var EXT_SERVICES = {
    taxi:     { name:"카카오 T",   app:function(){ return "kakaot://"; },
                web:function(){ return "https://kakaot.kakao.com/"; } },
    navi:     { name:"길찾기",     app:function(q){ return q?("kakaomap://search?q="+encodeURIComponent(q)):"kakaomap://open"; },
                web:function(q){ return q?("https://map.kakao.com/?q="+encodeURIComponent(q)+"&target=car"):"https://map.kakao.com/"; } },
    map:      { name:"카카오맵",   app:function(q){ return q?("kakaomap://search?q="+encodeURIComponent(q)):"kakaomap://open"; },
                web:function(q){ return q?("https://map.kakao.com/?q="+encodeURIComponent(q)):"https://map.kakao.com/"; } },
    delivery: { name:"배달의민족", app:function(){ return "baemin://"; },
                web:function(){ return "https://www.baemin.com/"; } }
  };
  async function openExternal(a){
    var svc = EXT_SERVICES[a.service];
    if(!svc){ addMsg("a","그 앱은 아직 못 열어 ㅜ"); return; }
    var q = a.query||"";
    var appUrl = svc.app(q), webUrl = svc.web(q);
    var AL = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppLauncher;
    if(window.GALLA_IS_APP && AL && AL.openUrl){
      try{
        if(AL.canOpenUrl){ var c=await AL.canOpenUrl({url:appUrl}); if(c && c.value){ await AL.openUrl({url:appUrl}); return; } }
        else { await AL.openUrl({url:appUrl}); return; }
      }catch(e){}
      openInApp(webUrl); return;   // 앱 미설치 → 웹/스토어
    }
    openInApp(webUrl);   // 웹: https(설치돼 있으면 앱으로 라우팅)
  }
  function runAction(a){
    if(a.kind==="reload"){ try{ location.reload(); }catch(e){} return; }   // 🔐 세션 풀림 복구
    // 🏆 딜리버 실소비 신호 — 콘텐츠성 칩(링크·갈라 콘텐츠·외부앱)을 '실제로 열면' 최강 긍정. 액션당 1회(연타 스팸 방지).
    if((a.kind==="open"||a.kind==="view"||a.kind==="external") && !a._reacted){ a._reacted=true; logReact("chip_open"); }
    if(a.kind==="open"){ openInApp(a.url); return; }
    if(a.kind==="external"){ openExternal(a); return; }
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
      minimize();
      if(window.GALLA_SPA && window.GALLA_SPA.compose){ try{ window.GALLA_SPA.compose("plaza"); return; }catch(e){} }
      nav("plaza.html?compose=1");
      return;
    }
    if(a.kind==="draftGallari"){
      // 🎬 숏판·롱판(영상·사진) 초안 — 캡션·태그·(가로)제목 프리필 + 작업모드. 미디어는 상대가.
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
      minimize();
      // 앱(SPA)은 ?compose=1 URL로 모달이 안 열림 → SPA compose 직접 호출. 웹은 URL nav.
      if(window.GALLA_SPA && window.GALLA_SPA.compose){ try{ window.GALLA_SPA.compose("predict"); return; }catch(e){} }
      nav("galla-predict.html?compose=1");
      return;
    }
    if(a.kind==="editdraft"){ applyDraftEdit(a.fields); return; }   // ✍️ 작업모드 실시간 폼 수정
    if(a.kind==="genThumbnail"){ genThumbnail(a); return; }         // 🖼 AI 썸네일 생성
    if(a.kind==="genVideo"){ genVideo(a); return; }                 // 🎬 자동편집형 영상 생성
    if(a.kind==="plan"){ renderPlan(a.ideas); return; }             // 🗂 콘텐츠 기획안 카드
    if(a.kind==="titles"){ renderTitles(a.titles); return; }        // 🔥 어그로 제목 카드
    if(a.kind==="script"){ renderScript(a.text); return; }          // 📜 대본
    if(a.kind==="reelScript"){ renderReelScript(a.text, a.place); return; }   // 🎞 릴스 대본(녹음→자동편집)
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
    // 🛡 방어 — 콘텐츠 이동은 유효한 id가 있을 때만(없으면 issue.html?id=undefined='잘못된 이슈 접근' 방지)
    if(a && a.id && String(a.id)!=="undefined"){ minimize(); nav(contentUrl(a)); }
    // id 없는 미지의 액션은 조용히 무시(옛 클라가 새 액션 만나도 깨진 이동 안 함)
  }

  async function token(){
    try{ var sb=window.supabaseClient; var r=await sb.auth.getSession(); if(r&&r.data&&r.data.session) return r.data.session.access_token; }catch(e){}
    return null;
  }
  // 🔐 갈비스 호출 — 401(세션 만료/손상)이면 세션 갱신 후 1회 재시도. res.__authFail=true면 재로그인 필요.
  //    (이 처리 없으면 세션 풀렸을 때 갈비스가 "정신 팔렸다"만 반복 = 바보처럼 보임 — 실유저 이탈 원인.)
  async function friendFetch(body){
    var jwt=await token();
    var guest=!jwt;
    // 🎟 게스트 맛보기 — 서버가 도구·기억을 잠근 경량 분기로 처리한다.
    //    ⚠️ Authorization을 비우면 Supabase 게이트웨이가 우리 함수 실행 전에 401을 낸다 → anon 키를 실어야 한다.
    if(guest) body.deviceId=deviceId();
    var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
      headers:{apikey:ANON, Authorization:"Bearer "+(jwt||ANON), "Content-Type":"application/json"}, body:JSON.stringify(body) });
    if(res.status===401 && !guest){   // 게스트의 401은 '세션 만료'가 아니라 진짜 거부 — 재시도 의미 없음
      var jwt2=null;
      try{ var rf=await window.supabaseClient.auth.refreshSession(); if(rf&&rf.data&&rf.data.session) jwt2=rf.data.session.access_token; }catch(e){}
      if(!jwt2) jwt2=await token();
      if(jwt2 && jwt2!==jwt){
        res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
          headers:{apikey:ANON, Authorization:"Bearer "+jwt2, "Content-Type":"application/json"}, body:JSON.stringify(body) });
      }
      if(res.status===401) res.__authFail=true;   // 갱신해도 여전히 401 = 재로그인 필요
    }
    return res;
  }
  // 🏆 라이브 반응 로거 — 칩 실사용(오픈)을 서버에 신호. 직전 주입 기억 보상 정밀화(실패 무시, 비용 0).
  function logReact(kind){
    token().then(function(jwt){ if(!jwt) return;
      fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({op:"react", kind:kind}) }).catch(function(){});
    }).catch(function(){});
  }
  function typing(on){
    var t=logEl.querySelector(".fr-typing");
    if(on&&!t){ logEl.appendChild(el('<div class="fr-typing"><i></i><i></i><i></i></div>')); logEl.scrollTop=logEl.scrollHeight; }
    if(!on&&t) t.remove();
  }
  // 요청 body 조립(callFriend·스트리밍 공용)
  function fbBody(message, hist, setName, meta, handoff){
    var body={message:message, history:hist||[]}; if(setName) body.setFriendName=setName; if(meta) body.meta=true;
    /* 🤫 "지금은 말 걸 때가 아니다"(빈 reply)를 이해하는 클라이언트임을 알린다.
       이 플래그가 없으면 서버는 예전처럼 항상 인사한다(구버전 안전장치). */
    body.quietOk = true;
    // 🌍 비로그인 방문자는 서버가 언어를 알 방법이 없다(users.locale이 없으니) → 브라우저 언어를 실어보낸다.
    //    로그인 유저는 서버가 users.locale을 쓰므로 이 값은 무시된다.
    try{ if(window.GALLA_locale) body.locale = GALLA_locale(); }catch(e){}
    if(handoff) body.handoff=handoff;   // 🎯 게시물 갈비스 버튼 핸드오프 — 서버가 {type,id}로 실제 내용 읽어 오프너
    // 📎 근거(기사·링크·글·이미지)가 담겨있으면 이번 메시지에 실어 보낸다(서버가 읽어 근거로 창작)
    if(_sources && _sources.length){ body.sources=_sources.filter(function(s){ return !s.pending; }).map(function(s){ return s.type==="image"?{type:"image",url:s.url}:{type:s.type,value:s.value}; }); }
    // 🛠 작업 모드면 현재 편집 중인 초안 상태를 동봉 → 갈비스가 폼을 알고 실시간 수정(edit_draft)
    if(_dock && _work && window.GALLA_WORKFORM){
      try{ body.work={ type:_work.type||window.GALLA_WORKFORM.type||"issue", fields:window.GALLA_WORKFORM.getFields() }; }catch(e){}
    }
    return body;
  }
  async function callFriend(message, hist, setName, meta, handoff){
    try{
      var res=await friendFetch(fbBody(message,hist,setName,meta,handoff));   // 401→세션갱신·재시도
      if(res.__authFail) return { ok:false, reason:"auth" };
      return await res.json();
    }catch(e){ return null; }
  }
  /* 🌊 스트리밍 소비 — 서버가 SSE(text/event-stream)로 답하면 토큰을 흘려 라이브 렌더.
     onText(full): 누적 프리뷰 텍스트. 반환: 최종 r({ok,reply,_bubbles,actions,friendName,...}) 또는 null(폴백). */
  async function consumeStream(res, onText){
    var reader=res.body.getReader(), dec=new TextDecoder(), buf="", done=null;
    for(;;){
      var rr=await reader.read(); if(rr.done) break;
      buf+=dec.decode(rr.value,{stream:true});
      var idx;
      while((idx=buf.indexOf("\n\n"))>=0){
        var chunk=buf.slice(0,idx); buf=buf.slice(idx+2);
        var em=/event: (\w+)/.exec(chunk); var dm=/data: ([\s\S]+)/.exec(chunk);
        if(!em||!dm) continue;
        var data; try{ data=JSON.parse(dm[1]); }catch(e){ continue; }
        if(em[1]==="text"){ if(data.full!=null) onText(data.full); }
        else if(em[1]==="done"){ done=data; }
      }
    }
    if(!done) return null;
    return { ok:true, reply:(done.bubbles||[]).join("\n\n"), _bubbles:done.bubbles||[], actions:done.actions||[], friendName:done.friendName, depth:done.depth, firstMeet:done.firstMeet, streamed:true };
  }

  async function sendText(text, speakReply){
    if(busy || !text) return;
    var jwt=await token();
    var isGuest=!jwt;                    // 🎟 로그인 안 했어도 막지 않는다 — 서버가 맛보기 턴을 센다
    busy=true; sendEl.disabled=true;
    _greetStale=true;   // 🔐 진행 중인 인사(greet)가 있으면 폐기 — 유저 용건이 우선
    addMsg("u",text); history.push({role:"user",content:text}); typing(true);
    var hadSources=_sources.length>0;
    // 🌊 스트리밍 시도 — 서버가 컴패니언 턴이면 SSE로 토큰을 흘린다(첫 글자 ~2초). 에이전트/작업/핸드오프면 서버가 JSON 반환.
    var r=null, streamed=false, liveEl=null, authFail=false;
    try{
      var body=fbBody(text, history.slice(0,-1)); if(!isGuest) body.stream=true;   // 게스트 경로는 SSE가 아니라 JSON
      var res=await friendFetch(body);
      if(res.__authFail){ authFail=true; }
      else {
        var ctype=(res.headers.get("content-type")||"");
        if(ctype.indexOf("text/event-stream")>=0 && res.body && res.body.getReader){
          r=await consumeStream(res, function(full){
            if(!liveEl){ typing(false); liveEl=addMsg("a",""); }
            var bub=liveEl.querySelector(".fr-bubble"); if(bub) bub.innerHTML=fmtStage(full);
            logEl.scrollTop=logEl.scrollHeight;
          });
          streamed=true;
        } else {
          r=await res.json();
        }
      }
    }catch(e){ r=null; }
    if(hadSources) clearSources();   // 근거는 이 메시지에 소비됨
    typing(false); clearProgress();
    // 🔐 세션 풀림 — 바보 폴백 대신 '재로그인' 명확 안내 + 원탭 새로고침 칩.
    if(authFail || (r&&r.reason==="auth")){
      if(liveEl){ try{ liveEl.remove(); }catch(e){} }
      var am=addMsg("a","어 로그인이 풀렸나봐 ㅠㅠ 새로고침하면 바로 돌아올게!");
      try{ addActions(am, [{ kind:"reload", label:"새로고침하고 이어가기" }]); }catch(e){}
      busy=false; sendEl.disabled=false; return;
    }
    if(!r||!r.ok){ if(liveEl){ try{ liveEl.remove(); }catch(e){} } addMsg("a",(r&&r.reply)||"잠깐 딴 데 정신 팔렸다 ㅋㅋ 다시 말해줄래?"); busy=false; sendEl.disabled=false; return; }
    // 렌더: 스트리밍이면 라이브 버블을 최종 버블로 정리(1버블이면 제자리 확정, 여러 버블이면 재렌더).
    var m;
    if(streamed){
      var bubbles=r._bubbles && r._bubbles.length ? r._bubbles : splitBubbles(r.reply||"…");
      if(liveEl && bubbles.length<=1){
        var lb=liveEl.querySelector(".fr-bubble"); if(lb) lb.innerHTML=fmtStage(bubbles[0]||r.reply||"…"); m=liveEl;
      } else {
        if(liveEl){ try{ liveEl.remove(); }catch(e){} }
        m=await addFriendReply(r.reply||"…", true);   // instant — 이미 스트리밍으로 보여줬으니 인위적 딜레이 X
      }
    } else {
      m=await addFriendReply(r.reply||"…");
    }
    history.push({role:"assistant",content:r.reply||""});
    // 🎟 게스트 맛보기 소진 — 여기가 가입 전환의 순간이다. 문구는 서버가 이미 말했고, 버튼만 붙인다.
    if(r.gate && r.gate.guest && r.gate.ok===false){
      try{ addActions(m, [{ kind:"signup", label:"30초 가입하고 계속 얘기하기" }]); }catch(e){}
      busy=false; sendEl.disabled=false; return;
    }
    if(history.length>30) history=history.slice(-30);
    // ✍️ 작업모드 폼수정(editdraft)·🖼 썸네일생성(genThumbnail)은 칩이 아니라 즉시 실행. 나머지만 칩으로.
    var acts=r.actions||[];
    acts.filter(function(a){return a.kind==="editdraft";}).forEach(function(a){ applyDraftEdit(a.fields); });
    acts.filter(function(a){return a.kind==="genThumbnail";}).forEach(function(a){ genThumbnail(a); });
    acts.filter(function(a){return a.kind==="genVideo";}).forEach(function(a){ genVideo(a); });
    acts.filter(function(a){return a.kind==="plan";}).forEach(function(a){ renderPlan(a.ideas); });
    acts.filter(function(a){return a.kind==="titles";}).forEach(function(a){ renderTitles(a.titles); });
    acts.filter(function(a){return a.kind==="script";}).forEach(function(a){ renderScript(a.text); });
    acts.filter(function(a){return a.kind==="reelScript";}).forEach(function(a){ renderReelScript(a.text, a.place); });
    addActions(m, acts.filter(function(a){return ["editdraft","genThumbnail","genVideo","plan","titles","script","reelScript"].indexOf(a.kind)<0;}));
    // ⚡ 자동 실행 — 명시 요청은 칩 탭 안 기다린다(답 잠깐 보여주고 0.7s 후):
    //   ① 앱 컨트롤(DM·통화·페이지)은 요청받아 나온 것이므로 바로 실행
    //   ② "보여줘/열어줘"면 콘텐츠(view→open) 자동 오픈
    if(r.actions && r.actions.length){
      var appA = r.actions.filter(function(a){ return a.kind==="app"; })[0];
      if(appA && (appA.op==="goto" || /걸어|전화|톡|디엠|dm|보내|열어/i.test(text))){
        appA._reacted=true;   // 🏆 자동실행은 유저 행동 아님 — 보상신호 스킵(가짜 +3 방지)
        setTimeout(function(){ runAction(appA); }, 700);
      } else if(/보여|열어|보자|가보자|띄워|틀어/.test(text)){
        var auto = r.actions.filter(function(a){ return a.kind==="view"; })[0] || r.actions.filter(function(a){ return a.kind==="open"; })[0];
        if(auto){ auto._reacted=true; setTimeout(function(){ runAction(auto); }, 700); }   // 🏆 동일 — 자동오픈 보상 제외
      }
    }
    if(r.friendName&&r.friendName!==friendName){ friendName=r.friendName; setTitle(); }
    if((voiceOut || speakReply) && r.reply) speak(r.reply);   // 🔊 토글 켜져 있으면 답을 읽어준다(무료 온디바이스)
    saveChat();                                  // 대화 이어가기 — 매 턴 저장
    // 🌐 웹 앱 넛지 — 단 '창작 흐름'(초안·썸네일 등 액션 나온 턴)엔 끼어들지 않는다(몰입 깨짐, 실사용 마찰).
    var creating = acts.some(function(a){ return /^draft|^gen|^editdraft|^plan|^titles|^script/.test(a.kind); });
    if(!window.GALLA_IS_APP && !creating && !_dock) maybeWebNudge();
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
      sttBase="";   // 새 세션 시작 → 누적 접두어 리셋
      if(taEl){ taEl.value=""; taEl.placeholder="듣는 중… 말해봐 🎙"; }
    } else if(type==="partial"){
      var pt=sttStrip(text);   // 이미 보낸 앞 발화 제거
      if(taEl){ taEl.value=pt; taEl.style.height="auto"; taEl.style.height=Math.min(taEl.scrollHeight,120)+"px"; }
    } else if(type==="end"){
      recording=false; mic&&mic.classList.remove("fr-rec");
      var t=sttStrip(text||(taEl&&taEl.value)||"");   // 누적분 빼고 '새로 말한 것'만
      sttBase=(text||"").trim();                       // 세션이 안 꺼져도 다음 발화 땐 이번 전체가 접두어
      if(taEl){ taEl.value=""; taEl.style.height="auto"; taEl.placeholder="친구한테 아무 말이나 해봐"; }
      if(t) sendText(t, false);
    } else { // error
      recording=false; mic&&mic.classList.remove("fr-rec"); sttBase="";
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
    var title=(ctx&&ctx.title||"").slice(0,120), type=(ctx&&ctx.type)||"content", id=(ctx&&ctx.id)||"";
    var jwt=await token();
    if(!jwt || (!title && !id)){ window.__frSuppressGreet=false; if(!logEl.children.length) greet(); return; }
    typing(true);
    // 🎯 서버가 {type,id}로 실제 콘텐츠(찬반수·요약·본문)를 읽어 근거 오프너를 낸다 — 클라는 제목만 넘기던 것 폐지.
    var r=await callFriend("", history, null, true, { type:type, id:id, title:title });
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
    /* 🌐 웹에서는 대화 대신 '앱 받기'로 보낸다(사장님 2026-08-18).
       콘텐츠 갈비스는 앱 경험이라 웹에서 열어주면 반쪽이 된다 — 대신 입구는 보여주고
       누르는 순간 앱으로 유도한다. 분기를 여기 한 곳에 두는 이유: 갈비스 버튼은
       홈·예측·광장 등 여러 화면이 각자 심는다. 렌더하는 쪽마다 조건을 두면 또 갈라진다. */
    if(!window.GALLA_IS_APP){
      if(window.GALLA_appDownload) window.GALLA_appDownload("galvis");
      else askGalvis({ type:b.getAttribute("data-gv-type")||"", id:b.getAttribute("data-gv-id")||"", title:b.getAttribute("data-gv-title")||"" });
      return;
    }
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
    tryCheerForConfirm();   // 🎉 검사·발행 페이지 응원 바
    // 🔄 실시간 미러링 + 📡 대행 진행상황 구독.
    // ⚠️ 버그였던 것: supabaseClient 존재만 보고 1회 호출 → 세션 복원이 부팅보다 늦으면 uid()=null로
    //    조용히 포기하고 영영 미구독(특히 앱 콜드스타트). → '구독 성공까지' 재시도.
    (function trySync(n){
      if(window.supabaseClient){ subscribeSync(); subscribeWork(); }
      if((!_syncChan || !_workChan) && n>0) setTimeout(function(){ trySync(n-1); }, 800);
    })(40);
    // 📲 복귀 수렴 — 백그라운드에서 소켓이 죽어 이벤트를 놓쳤어도, 화면 복귀 시 서버 전사로 따라잡는다(+미구독이면 재구독).
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState!=="visible") return;
      try{
        if(!_syncChan) subscribeSync();
        if(!_workChan) subscribeWork();
        if(logEl && logEl.children.length && !busy) loadChat().then(function(d){ if(d&&d.history) applyRemoteChat(d.history); }).catch(function(){});
      }catch(e){}
    });
    // 📮 선톡 푸시 탭으로 들어왔으면(?frping=1) 부팅 후 갈비스 챗 자동 오픈(선톡이 첫 말이 됨)
    try{ if(/[?&]frping=1/.test(location.search)) setTimeout(open, 900); }catch(e){}
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
