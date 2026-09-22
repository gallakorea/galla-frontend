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
          _srvSig=chatSig(j.history);   // 서버 chat_log 서명 — 다른 칸만 바뀐 실시간 이벤트를 걸러낸다(applyRemoteChat)
          return d;
        }
        // 서버에 로그 없음(첫 사용/구계정) → 로컬에 있으면 그걸로(다음 턴에 서버로 올라감)
      }
    }catch(e){}
    return loadLocalChat(u);
  }

  // 🔄 실시간 미러링 — 다른 기기서 대화가 이어지면(친구 답 포함) 켜져있는 이 기기에도 즉시 반영.
  //    Supabase realtime으로 내 friend_relationship.chat_log 변경 구독(RLS로 본인 행만 수신).
  /* ⚠️ _srvSig — 이 행의 UPDATE 는 chat_log 가 안 바뀌어도 온다(pending_ping·감정·기억 칸 등). 예전엔 그걸 전부
     '원격 대화'로 받아, 내 화면에만 있는 말(방금 받은 선톡)과 다르다고 로그를 통째로 다시 그렸다 → 선톡을 받는
     consume_ping 자신의 UPDATE 가 되돌아와 **방금 띄운 선톡·구분선을 지웠다**(2026-09-10 QA). chat_log 서명이
     마지막으로 본 서버 것과 같으면 다른 칸 변경이므로 무시한다. */
  var _syncChan=null, _lastSig="", _srvSig="";
  function chatSig(log){                 // 마지막 유저·친구 발화 내용으로 시그니처(길이 무관 — 에코 오탐 방지)
    if(!log||!log.length) return "0";
    var a=log[log.length-1]||{}, b=log[log.length-2]||{};
    return String(a.content||"").slice(-60)+"§"+String(b.content||"").slice(-40);
  }
  /* 🃏 카드 보존 — 대화 기록은 글자만 저장돼서, 대화를 다시 그리면(풀 모드 복귀·실시간 동기화·새로 열기) 카드와 사진이 사라졌다(26.9.22 사장님).
     카드는 그 말풍선 글자를 열쇠로 이 기기에 따로 저장해 두고, 다시 그릴 때 붙인다(자동 열기 없이). */
  var _cardMap=null;
  function cardKey(t){ return String(t||"").replace(/[0-9\s]+/g,"").slice(0,60); }
  function cardMapLoad(){ if(_cardMap) return _cardMap; try{ _cardMap=JSON.parse(localStorage.getItem("frCards:"+(_uid||"anon"))||"{}")||{}; }catch(e){ _cardMap={}; } return _cardMap; }
  function rememberCards(msgEl, actions){
    try{
      var bb=msgEl && (msgEl.querySelector(".fr-bubble")||msgEl); var k=cardKey(bb && bb.textContent); if(!k) return;
      var cs=(actions||[]).filter(function(a){ return (a.kind==="open"||a.kind==="view") && (a.title||a.sub); }).slice(0,3)
        .map(function(a){ return { kind:a.kind, ctype:a.ctype, id:a.id, url:a.url, title:a.title, sub:a.sub, img:a.img, label:a.label, source:a.source, badge:a.badge }; });
      if(!cs.length) return;
      var m=cardMapLoad(); m[k]={ c:cs, at:Date.now() };
      var ks=Object.keys(m); if(ks.length>80){ ks.sort(function(x,y){ return (m[x].at||0)-(m[y].at||0); }).slice(0, ks.length-80).forEach(function(x){ delete m[x]; }); }
      localStorage.setItem("frCards:"+(_uid||"anon"), JSON.stringify(m));
    }catch(e){}
  }
  function restoreCards(){
    try{
      var m=cardMapLoad(); if(!logEl) return;
      logEl.querySelectorAll(".fr-msg.fr-a").forEach(function(msgEl){
        if(msgEl.querySelector(".fr-acts")) return;
        var bb=msgEl.querySelector(".fr-bubble"); var hit=m[cardKey(bb && bb.textContent)];
        if(hit && hit.c && hit.c.length) addActions(msgEl, hit.c.map(function(a){ var o={}; for(var k in a) o[k]=a[k]; o.auto=false; o._restored=true; return o; }));
      });
      _cardGroup=null; _offerOne=null;   // 되살린 옛 카드가 「1번/ㅇㅇ」 대상이 되지 않게
    }catch(e){}
  }
  function renderHistory(log){
    if(!logEl) return;
    logEl.innerHTML="";
    history = log.slice(-30);
    history.forEach(function(msg){
      if(msg && msg.role==="user") addMsg("u", msg.content||"");
      else splitBubbles((msg&&msg.content)||"").forEach(function(p){ addMsg("a", p); });
    });
    restoreCards();
    scrollBottom();
  }
  function applyRemoteChat(remoteLog){
    try{
      if(!Array.isArray(remoteLog)||!remoteLog.length) return;
      if(busy) return;                                     // 이 기기가 전송 중 = 곧 내 것으로 정리됨(에코)
      var sig=chatSig(remoteLog);
      if(sig===_srvSig) return;                            // 서버 chat_log 그대로 = 다른 칸만 바뀐 UPDATE(선톡 수령 등) → 무시
      _srvSig=sig;
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
    if(!p){ p=el('<div class="fr-prog"><div class="fr-prog-hist"></div><div class="fr-prog-now"><span class="fr-prog-spin"></span><span class="fr-prog-t"></span></div></div>'); logEl.appendChild(p); }
    var t=p.querySelector(".fr-prog-t");
    /* 지나간 단계는 위로 흔적으로 — "뭘 하고 있는지"가 자비스 HUD 처럼 쌓인다 */
    if(t.textContent && t.textContent!==text){
      var h=el('<div class="fr-prog-done"></div>'); h.textContent=t.textContent;
      var hist=p.querySelector(".fr-prog-hist"); hist.appendChild(h);
      while(hist.children.length>3) hist.removeChild(hist.firstChild);
    }
    t.textContent=text;
    var now=p.querySelector(".fr-prog-now"); now.classList.remove("fr-prog-in"); void now.offsetWidth; now.classList.add("fr-prog-in");
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

  /* 🔒 비로그인은 갈비스를 못 쓴다(사장님 26.9.18 「로그인을 해야 무료 사용량을 쓸 수 있음. 로그아웃 상태에서는 못한다」).
     예전(8/8)엔 게스트 체험(하루 5→2턴)을 열어 뒀다 — 폐지. 앱은 로그인 창, 웹은 앱 받기.
     서버도 ai_tiers.guest.galla-friend n:0 으로 막았다(앱을 우회한 직접 호출 방어). true = 막았다 */
  /* 🎤 비로그인 유입 창 — 평범한 '로그인이 필요해요' 대신 갈비스가 직접 말을 건다(사장님 26.9.18 「재밌고 위트 있는 워딩으로 유입」).
     문구는 돌아가며 — 매번 같은 말이면 두 번째부터 안 읽는다. 콘텐츠에서 눌렀으면 그 제목으로 말을 건다.
     ⚠️ 사행성·과장 표현 금지, '무료'는 사실(로그인하면 무료 사용량이 있다). */
  var GUEST_LINES=[
    ["잠깐, 우리 아직 통성명도 안 했잖아 👋", "나 갈비스. 로그인하면 네 얘기 기억해 뒀다가 편 들어줄게. 매일 무료로 수다 떨 수 있어."],
    ["낯가림 있는 AI라서… 🙈", "이름 모르는 사람이랑은 말을 못 해. 로그인 3초면 우리 바로 친구."],
    ["할 말 많은데 입이 안 떨어져 🤐", "로그인하면 봉인 해제. 오늘 무료 대화도 넉넉하게 준비해 뒀어."],
    ["너 누군지 알아야 편을 들지 😏", "로그인하면 네 성향 파악해서 제대로 맞장구 쳐 줄게. 공짜로."],
    ["문 앞에서 기다리고 있었어 🚪", "들어오는 건 로그인 한 번이면 끝. 안에선 무료로 떠들자."]
  ];
  var GUEST_TOPIC=[
    ["「{t}」 얘기? 나 할 말 많아 🔥", "근데 로그인부터 하자. 3초면 돼 — 그다음부턴 무료로 끝장 토론."],
    ["「{t}」… 이거 그냥 못 넘어가지 👀", "로그인하면 바로 이 얘기로 이어서 해 줄게. 무료로."]
  ];
  function guestSheet(title){
    var old=document.getElementById("frGuest"); if(old) old.remove();
    var pool=title?GUEST_TOPIC:GUEST_LINES, pick=pool[Math.floor(Math.random()*pool.length)];
    var t=title?String(title).replace(/\s+/g," ").trim():"";
    if(t.length>20) t=t.slice(0,20).trim()+"…";
    var head=pick[0].replace("{t}", t), body=pick[1];
    var w=el('<div id="frGuest" class="frg-dim" data-no-ptr><div class="frg-card">'+
      '<div class="frg-av"><span class="fr-ring fr-r1"></span><span class="fr-ring fr-r2"></span><span class="fr-core"></span></div>'+
      '<div class="frg-bubble"><b></b><p></p></div>'+
      '<button type="button" class="frg-go">로그인하고 갈비스랑 친해지기</button>'+
      '<button type="button" class="frg-x">좀 이따가</button></div></div>');
    w.querySelector(".frg-bubble b").textContent=head;
    w.querySelector(".frg-bubble p").textContent=body;
    document.body.appendChild(w);
    requestAnimationFrame(function(){ w.classList.add("on"); });
    function bye(){ w.classList.remove("on"); setTimeout(function(){ w.remove(); }, 220); }
    w.addEventListener("click", function(e){ if(e.target===w || e.target.closest(".frg-x")) bye(); });
    w.querySelector(".frg-go").addEventListener("click", function(){
      bye();
      try{ sessionStorage.setItem("galla_after_login","friend"); }catch(e){}
      if(window.GALLA_gotoLogin) window.GALLA_gotoLogin(); else if(window.GALLA_needLogin) window.GALLA_needLogin("로그인하면 갈비스와 무료로 대화할 수 있어요.");
    });
  }
  async function guestBlocked(title){
    if(await token()) return false;
    if(!window.GALLA_IS_APP && window.GALLA_appDownload){ window.GALLA_appDownload("galvis"); return true; }
    guestSheet(title||"");
    return true;
  }
  async function openGated(){ if(await guestBlocked()) return; open(); }

  function build(){
    // 🔵 아크 리액터 오브 — 회전 틱 링 + 카운터 링 + 앰버 코어(자비스 HUD 오마주)
    orb = el('<button id="frOrb" aria-label="G.A.L.V.I.S."><span class="gf-host">'+galvisFace(62)+'</span><span class="fr-dot"></span></button>');
    document.body.appendChild(orb);
    orb.addEventListener("click", openGated);

    /* 🔴 오브가 화면 하단 고정 입력바의 '등록' 버튼을 덮고 있었다(실측 2026-08-28 iOS 앱).
       광장 상세: 컴포저는 bottom 78px~146px, 오브는 74px~130px 에 right:14px —
       정확히 등록 버튼 자리다. z-index 는 컴포저(1000)가 높지만 SPA 에선 판 트랙이
       transform 을 걸어 별도 쌓임 맥락을 만들기 때문에, body 직속인 오브가 위에 그려진다.
       그래서 **광장 댓글을 쓸 수는 있어도 올릴 방법이 없었다**(엔터는 textarea 라 줄바꿈).
       글을 쓰는 중이면 갈비스를 부를 일이 없다 — 입력 중에는 비켜선다. */
    var _orbFocusHide = function (on) {
      if (!orb) return;
      if (on) orb.classList.add("fr-hidden");
      else if (!_dock && !(sheet && sheet.classList.contains("fr-open"))) orb.classList.remove("fr-hidden");
    };
    function _isTextEntry(t) {
      if (!t || !t.tagName) return false;
      var tag = t.tagName.toLowerCase();
      return tag === "textarea" || t.isContentEditable ||
             (tag === "input" && !/^(button|submit|checkbox|radio|file|range|reset|image)$/i.test(t.type || "text"));
    }
    document.addEventListener("focusin", function (e) { if (_isTextEntry(e.target)) _orbFocusHide(true); }, true);
    document.addEventListener("focusout", function () { setTimeout(function () {
      if (!_isTextEntry(document.activeElement)) _orbFocusHide(false);
    }, 60); }, true);

    sheet = el('<div id="frSheet" role="dialog" aria-label="G.A.L.V.I.S.">'+
      '<div class="fr-scrim"></div>'+
      '<div class="fr-panel">'+
        '<div class="fr-hud-line"></div>'+
        '<div class="fr-head">'+
          '<div class="fr-av gf-host">'+galvisFace(44)+'</div>'+
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
          '<input class="fr-src-inp" placeholder="기사 링크나 글을 붙여넣어" autocapitalize="off" autocorrect="off" spellcheck="false">'+
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
      '<span class="fr-mav gf-host">'+galvisFace(34)+'</span>'+
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
      /* 스킴은 소문자로 — iOS 자동수정이 「HTTPS://」로 바꾸면 서버가 링크를 못 읽고 「읽기 실패」로 떨궜다(2026-09-10 QA) */
      v=v.replace(/^https?:/i, function(m){ return m.toLowerCase(); });
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
    if(_asEl) _asEl.classList.remove("on","fri-open","fri-think");
    setSurface("sheet");
    bindKb();                                     // 키보드 트래킹(1회 등록)
    bindStick(); _stick=true;                     // 하단 고정 감시자(1회 등록) — 열 때는 항상 바닥부터
    if(mini) mini.classList.remove("on");
    orb && orb.classList.remove("fr-ping");
    document.body.classList.add("fr-chatting");   // 하단 내비 숨김
    sheet.classList.add("fr-open");
    // 🎟 남은 대화 pill — 열 때마다 갱신(쓴 만큼 줄어드는 게 보여야 업그레이드가 설득된다)
    refreshPill();
    /* 🗣 열 때마다 인사를 '시도'한다. 실제로 말을 걸지 말지는 서버가 정한다(공백 30분 미만이면 조용).
       예전엔 __frDidIntro 로 '세션 1회'만 허용했는데, 앱(SPA)은 페이지가 안 바뀌어 그 세션 내내
       침묵이었다. 닫았다 다시 열어도 반응이 없다는 제보가 이것이다(실측: 2차 열기 때 서버 호출 0).
       ⚠️ 억제는 askGalvis 가 첫 말을 책임질 때(__frSuppressGreet)만. */
    var frSuppress = (window.__frSuppressGreet === true);
    if(!logEl.children.length) restoreOrGreet(frSuppress);   // 첫 렌더: 지난 대화 복원 + 인사
    else if(!frSuppress) greet();                            // 이미 떠 있으면 인사만 다시
    window.__frDidIntro = true;
    setTimeout(function(){ scrollBottom(); taEl && taEl.focus(); }, 340);  // 열면 마지막 대화로
    setTimeout(scrollBottom, 600);
  }
  /* 🎟 남은 대화 pill 다시 그리기.
     ⚠️ 예전엔 '열 때'만 그렸다. 한 턴 쓰고 나서도 숫자가 그대로라, 5턴 남았다고 믿다가
     갑자기 막히는 화면을 봤다(실측: used 는 서버에서 올라가는데 pill 은 5로 고정).
     서버 캐시를 무시하고(force) 매 턴 끝에 다시 센다. */
  function refreshPill(){
    try{
      if(!sheet) return;
      var hd=sheet.querySelector(".fr-head");
      if(!hd || !window.GALLA_planPill) return;
      if(window.GALLA_entitlementBust) { try{ window.GALLA_entitlementBust(); }catch(e){} }
      var old=hd.querySelector(".gpl-pill"); if(old) old.remove();
      window.GALLA_planPill(hd);
    }catch(e){}
  }

  function close(){
    /* 🔁 콘텐츠 화면에서 크게 봤다가 닫으면 → 다시 아일랜드(미니)로 돌아간다(26.9.22 사장님: 「창↔미니 회귀 매우 중요」) */
    if(_assist && _asEl){
      if(sheet) sheet.classList.remove("fr-open");
      document.body.classList.remove("fr-chatting");
      orb && orb.classList.add("fr-hidden");
      setSurface("island"); _asEl.classList.add("on"); friExpand(false); syncAssist();
      return;
    }
    setSurface("orb");
    try{ sessionStorage.removeItem("fr_mini"); }catch(e){}
    var _ms=document.getElementById("frMiniSay"); if(_ms) _ms.classList.remove("on");
    if(sheet) sheet.classList.remove("fr-open");
    if(mini) mini.classList.remove("on");
    orb && orb.classList.remove("fr-hidden");
    document.body.classList.remove("fr-chatting");   // 내비 복원
    hushSpeak();   // 닫으면 음성 정지(네이티브 TTS 포함)
  }
  /* 🔽 미니 보드로 접기 — 콘텐츠를 보여줄 때 챗은 닫는 게 아니라 '접힌다'(대화·입력 그대로 유지).
     패널이 슬라이드 다운되는 동안 미니 필이 스프링으로 팝인 — 다시 탭하면 그 자리에서 대화 복귀. */
  /* 🔽 미니 모드 말풍선(26.9.22 사장님: 「페이지 떴을 때 갈비스 미니 모드도 없고 흐름이 끊김」)
     콘텐츠를 열면 갈비스가 알약으로 접히며 한 마디 건넨다. 웹은 페이지가 새로 떠도(sessionStorage) 그대로 이어진다. */
  var MINI_SAY={ food:"맛있어 보여? 보고 말해줘 ㅎㅎ", travel:"가보고 싶어? 보고 얘기해줘!", predict:"넌 어느 쪽 같아? 보고 와서 알려줘", issue:"넌 어느 편이야? 보고 말해줘",
    news:"다 읽으면 어땠는지 말해줘", hottube:"웃겼는지 보고 말해줘 ㅋㅋ", plaza:"보고 어땠는지 알려줘", gallari:"보고 어땠는지 알려줘", link:"다 읽고 어땠는지 말해줘" };
  function miniSay(text){
    if(!mini || !text) return;
    var b=document.getElementById("frMiniSay");
    if(!b){ b=el('<button id="frMiniSay" aria-label="갈비스로 돌아가기"></button>'); document.body.appendChild(b); b.addEventListener("click", function(){ restoreFromMini(); }); }
    b.textContent=text; b.classList.remove("on"); void b.offsetWidth; b.classList.add("on");
    clearTimeout(miniSay._t); miniSay._t=setTimeout(function(){ b.classList.remove("on"); }, 7000);
  }
  /* 🧭 보조 모드(26.9.22 사장님: 「창이 띄워지면 갈비스가 미니 모드로 — 페이지가 뜬 상태에서 보조 역할」)
     콘텐츠를 열면 갈비스가 사라지지 않고 화면 아래 작은 창으로 남는다. 그 콘텐츠를 서버가 읽어(핸드오프) 먼저 한마디 +
     요약·참여·저장·관련 찾기를 그 자리에서 돕는다. 접기(한 줄 바)·크게 보기·닫기는 기존 도킹 버튼 그대로. */
  var _assist=null, _asEl=null, _asObs=null, _asBase=0;
  /* 🧭 갈비스는 화면에 하나만(머티리얼 '컨테이너 변환' — 오브가 곧 창·아일랜드로 변한다, 둘이 같이 뜨지 않는다. 26.9.22)
     상태: orb(닫힘) · sheet(대화창) · island(보조 창) · mini(알약). CSS 가 나머지를 숨긴다. */
  function setSurface(name){
    ["orb","sheet","island","mini"].forEach(function(n){ document.body.classList.toggle("fr-sf-"+n, n===name); });
  }
  /* 🧭 보조 창 — 화면 오른쪽 아래 반투명 유리 창. 페이지는 뒤로 비친다.
     갈비스 최신 말(3줄) + 작은 입력. [크게](전체 대화) [접기](알약) [닫기]. 답에 카드가 있으면 「카드 보기」. */
  /* 🏝 갈비스 아일랜드(26.9.22 — 다이내믹 아일랜드·리퀴드 글래스·제미나이 오버레이 참고)
     평소=아래 가운데 작은 유리 캡슐(눈 깜빡이는 갈비스 + 최신 한 줄) → 답이 오면 스프링으로 부풀어 카드(15px·상황 버튼)
     → 페이지를 스크롤하면 다시 캡슐로. 생각 중엔 테두리가 빛나며 돌고 파형이 춤춘다. 전부 SVG·CSS(비용 0). */
  /* 🕺 갈비스 = 우리 졸라맨(투표바 줄다리기 사람과 같은 그림체 — 꽉 찬 동그란 머리 + 굵기 2.4 선).
     평소 통통 뛰며 손 흔들기 · 생각 중 턱 괴고 고개 갸웃 + 「…」 · 답 오면 두 팔 번쩍 점프(26.9.22 사장님). */
  /* 🤖 갈비스 얼굴(26.9.22 사장님: 「자비스 오마주 — 얼굴을 창조해라」) — 자비스 분절 링·도는 글자 링·궤도 빛·
     둘레 음성 막대 36개(말할 때 출렁)·빛나는 눈(눈동자)·파형 입. 표정은 감싼 요소의 클래스로: gf-think / gf-speak / gf-happy.
     ⚠️ <use> 로 재사용하면 표정 클래스가 안 먹는다 — 매번 직접 그린다(그라데이션 id 는 겹치지 않게). */
  var _gfN=0;
  function galvisFace(size){
    var id="gf"+(++_gfN), bars="", ticks="";
    for(var i=0;i<36;i++){ bars+='<rect class="vbar" x="49.1" y="12.6" width="1.8" height="5.4" rx=".9" transform="rotate('+(i*10)+' 50 50)" style="animation-delay:'+((i*37)%500)+'ms"/>'; }
    for(var k=0;k<12;k++){ ticks+='<rect x="49.4" y="1.2" width="1.2" height="'+(k%3?3:5)+'" transform="rotate('+(k*30)+' 50 50)"/>'; }
    return '<svg class="gf" width="'+size+'" height="'+size+'" viewBox="0 0 100 100" aria-hidden="true"><defs>'+
      '<radialGradient id="'+id+'p" cx="50%" cy="40%" r="62%"><stop offset="0" stop-color="#0f3b58"/><stop offset=".7" stop-color="#041524"/><stop offset="1" stop-color="#020a12"/></radialGradient>'+
      '<linearGradient id="'+id+'e" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#9ff4ff"/><stop offset="1" stop-color="#3fe0ff"/></linearGradient>'+
      '<clipPath id="'+id+'c"><circle cx="50" cy="50" r="25.5"/></clipPath>'+
      '<path id="'+id+'t" d="M50 50 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0"/></defs>'+
      '<g class="gf-spin2" fill="#3fe0ff">'+ticks+'</g>'+
      '<g class="gf-spin"><circle cx="50" cy="50" r="47.5" fill="none" stroke="#3fe0ff" stroke-width="1.6" stroke-dasharray="26 5 4 5 44 9 2 9" opacity=".95"/></g>'+
      '<g class="gf-spinr"><text class="gf-rtext"><textPath href="#'+id+'t">G.A.L.V.I.S · 연결됨 · 내 편 AI · G.A.L.V.I.S · 연결됨 ·</textPath></text></g>'+
      '<g class="gf-spinr"><circle cx="50" cy="50" r="38.5" fill="none" stroke="#ffb347" stroke-width="1.5" stroke-dasharray="48 12 6 12" opacity=".9"/></g>'+
      '<g class="gf-orbit"><circle cx="50" cy="2.8" r="1.8" fill="#fff"/><circle cx="50" cy="2.8" r="4" fill="#3fe0ff" opacity=".35"/></g>'+
      '<g fill="#3fe0ff" opacity=".85">'+bars+'</g>'+
      '<g class="gf-prog"><circle cx="50" cy="50" r="42.5" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round"/></g>'+
      '<circle cx="50" cy="50" r="26" fill="url(#'+id+'p)" stroke="#3fe0ff" stroke-opacity=".6" stroke-width="1"/>'+
      '<g clip-path="url(#'+id+'c)"><rect class="gf-scan" x="20" y="20" width="60" height="4" fill="#3fe0ff" opacity=".2"/></g>'+
      '<g class="gf-eyes"><rect class="gf-eye" x="37.5" y="39" width="8.4" height="12" rx="4.2" fill="url(#'+id+'e)"/><rect class="gf-eye" x="54.1" y="39" width="8.4" height="12" rx="4.2" fill="url(#'+id+'e)"/>'+
        '<g class="gf-pupils"><circle cx="41.7" cy="44" r="1.9" fill="#04121c" opacity=".55"/><circle cx="58.3" cy="44" r="1.9" fill="#04121c" opacity=".55"/><circle cx="40.6" cy="42.2" r="1" fill="#fff"/><circle cx="57.2" cy="42.2" r="1" fill="#fff"/></g></g>'+
      '<g class="gf-happy" fill="none" stroke="#bdf7ff" stroke-width="3" stroke-linecap="round"><path d="M37 46 q4.8 -6.6 9.6 0"/><path d="M53.4 46 q4.8 -6.6 9.6 0"/></g>'+
      '<g class="gf-mouth" fill="#3fe0ff"><rect x="41" y="57.5" width="2.2" height="3.6" rx="1.1"/><rect x="44.6" y="56.6" width="2.2" height="5.4" rx="1.1"/><rect x="48.2" y="55.6" width="2.2" height="7.4" rx="1.1"/><rect x="51.8" y="55.6" width="2.2" height="7.4" rx="1.1"/><rect x="55.4" y="56.6" width="2.2" height="5.4" rx="1.1"/><rect x="59" y="57.5" width="2.2" height="3.6" rx="1.1"/></g>'+
    '</svg>';
  }
  /* 얼굴 표정 — 모든 얼굴(오브·헤더·알약·아일랜드)에 한 번에 */
  function faceMood(m){
    document.querySelectorAll(".gf-host").forEach(function(h){ h.classList.remove("gf-think","gf-speak","gf-happy"); if(m) h.classList.add("gf-"+m); });
    clearTimeout(faceMood._t);
    if(m==="speak") faceMood._t=setTimeout(function(){ faceMood("happy"); faceMood._t=setTimeout(function(){ faceMood(""); }, 1600); }, 1800);
  }
  var FRI_ORB='<span class="gf-host fri-face">'+'</span>';
  var FRI_WAVE='<svg class="fri-wave" viewBox="0 0 22 16" aria-hidden="true"><rect x="1" y="5" width="3" height="6" rx="1.5"/><rect x="7" y="2" width="3" height="12" rx="1.5"/><rect x="13" y="4" width="3" height="8" rx="1.5"/><rect x="19" y="6" width="2.4" height="4" rx="1.2"/></svg>';
  var FRI_IC={
    sum:'<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h10M5 17h7"/></svg>',
    side:'<svg viewBox="0 0 24 24"><path d="M12 4v16M5 8h14M5 8l-2.5 6a3 3 0 0 0 5 0zM19 8l-2.5 6a3 3 0 0 0 5 0z"/></svg>',
    chart:'<svg viewBox="0 0 24 24"><path d="M4 19V5M4 19h16M8 15l4-4 3 3 5-6"/></svg>',
    save:'<svg viewBox="0 0 24 24"><path d="M7 4h10v16l-5-3.5L7 20z"/></svg>',
    pin:'<svg viewBox="0 0 24 24"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
    more:'<svg viewBox="0 0 24 24"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
    join:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M8.5 12.5l2.4 2.4 4.6-5"/></svg>'
  };
  function friSparkle(){
    if(!_asEl) return;
    var box=_asEl.querySelector(".fri-spark"); if(!box) return; box.innerHTML="";
    for(var i=0;i<7;i++){
      var sp=el('<svg viewBox="0 0 10 10"><path d="M5 0l1.2 3.8L10 5 6.2 6.2 5 10 3.8 6.2 0 5l3.8-1.2z"/></svg>');
      var ang=(i/7)*Math.PI*2 + Math.random()*.5, d=26+Math.random()*22;
      sp.style.setProperty("--dx", Math.round(Math.cos(ang)*d)+"px"); sp.style.setProperty("--dy", Math.round(Math.sin(ang)*d*.6-8)+"px");
      sp.style.animationDelay=(i*25)+"ms"; box.appendChild(sp);
    }
    setTimeout(function(){ box.innerHTML=""; }, 900);
  }
  /* 🫧 캡슐 생애주기(26.9.22 — 안드로이드 버블·애플 PiP·채팅 위젯 원칙)
     밖을 누르면 접힘 · 끌면 따라오고 놓으면 가까운 옆 가장자리에 붙음 · 가장자리로 던지면 얇은 손잡이만 남기고 숨음(탭하면 나옴)
     · 아래로 끌면 「닫기」 과녁이 나타나 가까이 가면 자석처럼 빨려들고 놓으면 닫힘. */
  var _friPos=null;   // 끌어서 옮긴 캡슐 자리 {x,y,side}
  function friPlace(){
    if(!_asEl) return;
    if(_asEl.classList.contains("fri-open") || !_friPos){ _asEl.classList.remove("fri-free"); _asEl.style.left=_asEl.style.top=""; return; }
    _asEl.classList.add("fri-free");
    var w=_asEl.offsetWidth||260;
    var x = _friPos.stash ? (_friPos.side==="left" ? -(w-26) : window.innerWidth-26) : (_friPos.side==="left" ? 10 : window.innerWidth - w - 10);
    _asEl.style.left=x+"px"; _asEl.style.top=_friPos.y+"px";
    _asEl.classList.toggle("fri-stash", !!_friPos.stash); _asEl.classList.toggle("fri-stash-left", !!_friPos.stash && _friPos.side==="left");
  }
  function friDrag(){
    var cap=_asEl.querySelector(".fri-cap"), dz=null, st=null;
    function target(){ if(!dz){ dz=el('<div id="frDismiss" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg><span>닫기</span></div>'); document.body.appendChild(dz); } return dz; }
    cap.addEventListener("pointerdown", function(e){
      if(_asEl.classList.contains("fri-open")) return;
      var r=_asEl.getBoundingClientRect();
      st={ x0:e.clientX, y0:e.clientY, ox:r.left, oy:r.top, t0:Date.now(), moved:false, lx:e.clientX, lt:Date.now(), vx:0 };
      try{ cap.setPointerCapture(e.pointerId); }catch(_){}
    });
    cap.addEventListener("pointermove", function(e){
      if(!st) return;
      var dx=e.clientX-st.x0, dy=e.clientY-st.y0;
      if(!st.moved && Math.hypot(dx,dy)<7) return;
      if(!st.moved){ st.moved=true; _asEl.classList.add("fri-drag","fri-free"); _asEl.classList.remove("fri-stash","fri-stash-left"); target().classList.add("on"); }
      var now=Date.now(); st.vx=(e.clientX-st.lx)/Math.max(1,now-st.lt); st.lx=e.clientX; st.lt=now;
      var x=st.ox+dx, y=st.oy+dy;
      // 🧲 닫기 과녁 — 가까우면 빨려든다
      var tr=target().getBoundingClientRect(), tcx=tr.left+tr.width/2, tcy=tr.top+tr.height/2, w=_asEl.offsetWidth, h=_asEl.offsetHeight;
      var d=Math.hypot(x+w/2-tcx, y+h/2-tcy), near=d<110;
      target().classList.toggle("hot", near);
      if(near){ x=tcx-w/2 + (x+w/2-tcx)*0.25; y=tcy-h/2 + (y+h/2-tcy)*0.25; }
      _asEl.classList.toggle("fri-doomed", near);
      _asEl.style.left=x+"px"; _asEl.style.top=y+"px";
    });
    function end(e){
      if(!st) return; var s0=st; st=null;
      if(dz) dz.classList.remove("on");
      if(!s0.moved) return;
      _asEl.classList.remove("fri-drag");
      cap._justDragged=Date.now();
      if(_asEl.classList.contains("fri-doomed")){   // 닫기
        _asEl.classList.remove("fri-doomed"); if(dz) dz.classList.remove("hot");
        _asEl.classList.add("fri-pop-out"); try{ navigator.vibrate && navigator.vibrate(15); }catch(_){}
        setTimeout(function(){ _asEl.classList.remove("fri-pop-out","fri-free"); _friPos=null; closeAssist(); setSurface("orb"); orb && orb.classList.remove("fr-hidden"); }, 320);
        return;
      }
      var r=_asEl.getBoundingClientRect(), cx=r.left+r.width/2, side = cx < window.innerWidth/2 ? "left" : "right";
      var flung = Math.abs(s0.vx)>0.9 || r.left < -r.width*0.25 || r.right > window.innerWidth + r.width*0.25;
      var y=Math.max(70, Math.min(window.innerHeight-160, r.top));
      _friPos={ side: flung ? (s0.vx<0?"left":"right") : side, y:y, stash: flung };
      friPlace();
    }
    cap.addEventListener("pointerup", end); cap.addEventListener("pointercancel", end);
    // 숨긴 손잡이를 누르면 다시 나온다
    _asEl.addEventListener("click", function(e){ if(_asEl.classList.contains("fri-stash")){ e.stopPropagation(); e.preventDefault(); _friPos.stash=false; friPlace(); } }, true);
    // 밖을 누르면 접힌다
    document.addEventListener("pointerdown", function(e){
      if(!_asEl.classList.contains("on") || !_asEl.classList.contains("fri-open")) return;
      if(_asEl.contains(e.target)) return;
      friExpand(false);
    }, true);
  }
  function friExpand(on){
    if(!_asEl) return;
    var cap0=_asEl.querySelector(".fri-cap"); if(on && cap0 && cap0._justDragged && Date.now()-cap0._justDragged<350) return;   // 끌고 놓은 직후의 클릭은 무시
    _asEl.classList.toggle("fri-open", !!on);
    friPlace();
    if(on){ _asEl._openAt=Date.now(); _asEl.classList.remove("fri-unread"); }
    if(on){ var mb=_asEl.querySelector(".fra-msg"); if(mb) mb.scrollTop=mb.scrollHeight; }
  }
  function buildAssist(){
    if(_asEl) return _asEl;
    _asEl=el('<div id="frAssist" class="fri" role="dialog" aria-label="갈비스">'+
      '<div class="fri-spark"></div>'+
      '<div class="fri-top">'+
        '<button class="fri-cap" aria-label="갈비스 펼치기">'+FRI_ORB+'<span class="fri-tick">갈비스</span>'+FRI_WAVE+'</button>'+
        '<button class="fra-big fri-ic" aria-label="전체 대화"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg></button>'+
        '<button class="fra-x fri-ic" aria-label="닫기"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'+
      '</div>'+
      '<div class="fri-card">'+
        '<div class="fra-msg"></div>'+
        '<div class="fri-cf" hidden><button class="fri-cf-yes"></button><button class="fri-cf-no">취소</button></div>'+
        '<button class="fra-cards" hidden>카드 보기 ›</button>'+
        '<div class="fra-quick"></div>'+
        '<div class="fra-in"><span class="fra-pr">›</span><input placeholder="갈비스한테 말해봐" enterkeyhint="send"><button class="fra-send" aria-label="보내기">'+ICON.send+'</button></div>'+
      '</div>'+
    '</div>');
    document.body.appendChild(_asEl);
    _asEl.querySelector(".fri-face").innerHTML=galvisFace(40);
    setTimeout(friDrag, 0);
    _asEl.insertAdjacentHTML("afterbegin",'<i class="hud-hex"></i><i class="hud-br tl"></i><i class="hud-br tr"></i><i class="hud-br bl"></i><i class="hud-br brr"></i><i class="hud-scan"></i>');
    var inp=_asEl.querySelector("input");
    var go=function(){ var t=String(inp.value||"").trim(); if(!t) return; inp.value=""; sendText(t); };
    _asEl.querySelector(".fra-send").onclick=go;
    inp.addEventListener("keydown", function(e){ if(e.key==="Enter" && !e.isComposing){ e.preventDefault(); go(); } });
    _asEl.querySelector(".fri-cap").onclick=function(){
      if(_assist && _assist.away){ bigOpen(); return; }   // 콘텐츠를 떠난 뒤의 캡슐 = 대화로 돌아가기
      friExpand(!_asEl.classList.contains("fri-open"));
    };
    // 아일랜드 → 크게: 이어가는 대화라 새 인사 없이(「또 왔네 반가워」가 붙던 것)
    var bigOpen=function(){ var away=_assist && _assist.away; if(away) closeAssist(); else hideAssist(); if(_asEl) _asEl.classList.remove("fri-away"); window.__frSuppressGreet=true; open(); window.__frSuppressGreet=false; };
    _asEl.querySelector(".fra-big").onclick=bigOpen;
    _asEl.querySelector(".fra-cards").onclick=bigOpen;
    _asEl.querySelector(".fra-x").onclick=function(){
      _asEl.classList.add("fri-out");
      setTimeout(function(){ _asEl.classList.remove("fri-out"); closeAssist(); setSurface("orb"); orb && orb.classList.remove("fr-hidden"); }, 380);
    };
    // 페이지를 스크롤하면 캡슐로(보는 걸 가리지 않게) — 입력 중이면 그대로
    // 페이지든 상세 시트(맛집·여행)든 — 스크롤하는 그 요소 기준으로 본다(시트 안 스크롤에 안 접히던 것)
    window.addEventListener("scroll", function(e){
      if(!_asEl.classList.contains("on") || !_asEl.classList.contains("fri-open") || document.activeElement===inp) return;
      var t=(e.target===document||e.target===window)?null:e.target;
      if(t && _asEl.contains(t)) return;
      if(Date.now() - (_asEl._openAt||0) < 800) return;   // 펼치자마자 생기는 레이아웃 스크롤은 무시
      friExpand(false);
    }, {passive:true, capture:true});
    // 쓸어내리면 접기, 쓸어올리면 전체 대화
    var sy=null;
    _asEl.querySelector(".fri-top").addEventListener("touchstart", function(e){ sy=e.touches[0].clientY; }, {passive:true});
    _asEl.querySelector(".fri-top").addEventListener("touchend", function(e){ if(sy==null) return; var dy=e.changedTouches[0].clientY-sy; sy=null;
      if(dy>28) friExpand(false); else if(dy<-40){ if(_asEl.classList.contains("fri-open")){ hideAssist(); open(); } else friExpand(true); } }, {passive:true});
    // 말을 눌러도 펼침/접힘
    _asEl.querySelector(".fra-msg").addEventListener("click", function(){ _asEl.classList.toggle("fri-full"); });
    return _asEl;
  }
  function hideAssist(){ if(_asEl) _asEl.classList.remove("on","fri-open","fri-think"); if(document.body.classList.contains("fr-sf-island")) setSurface("orb"); }
  var _friLastTxt="";
  function syncAssist(){
    if(!_asEl || !logEl) return;
    var msgs=logEl.querySelectorAll(".fr-msg"); var lastU=-1;
    for(var i=msgs.length-1;i>=0;i--){ if(msgs[i].classList.contains("fr-u")){ lastU=i; break; } }
    lastU=Math.max(lastU, (_asBase|0)-1);   // 아일랜드를 연 뒤의 말만(그 전 대화가 섞이던 것)
    var parts=[], hasCards=false;
    for(var j=Math.max(lastU+1,0); j<msgs.length; j++){
      var bb=msgs[j].querySelector(".fr-bubble"); if(!bb) continue;
      if(bb.querySelector(".fr-tc,.fr-confirm,.fr-card")) hasCards=true;
      var t=""; bb.childNodes.forEach(function(n){ if(n.nodeType===3) t+=n.textContent; else if(n.classList && !n.classList.contains("fr-acts")) t+=n.textContent; });
      t=t.trim(); if(t) parts.push(t);
    }
    var thinking=!!logEl.querySelector(".fr-typing") && !parts.length;
    _asEl.classList.toggle("fri-think", thinking);
    if(thinking) faceMood("think");
    var box=_asEl.querySelector(".fra-msg"), tick=_asEl.querySelector(".fri-tick");
    if(thinking){ tick.textContent="생각하는 중…"; }
    var txt=parts.slice(-3).join("\n");
    if(txt && txt!==_friLastTxt){
      _friLastTxt=txt; box.innerHTML=fmtRich(fmtStage(txt)); revealRich(box);
      var last=parts[parts.length-1]||""; tick.textContent=last.replace(/\s+/g," ").slice(0,40);
      _asEl.classList.remove("fri-full");
      if(_asEl.classList.contains("fri-open") || !_asEl._seenOnce){ friExpand(true); _asEl._seenOnce=true; } else _asEl.classList.add("fri-unread");   // 접어둔 사이 온 답은 점으로만(흐름 방해 안 함)
      friSparkle(); faceMood("speak");
      _asEl.classList.remove("hud-boot"); void _asEl.offsetWidth; _asEl.classList.add("hud-boot");
      _asEl.classList.remove("fri-pop"); void _asEl.offsetWidth; _asEl.classList.add("fri-pop");
      clearTimeout(syncAssist._p); syncAssist._p=setTimeout(function(){ if(_asEl) _asEl.classList.remove("fri-pop"); }, 1600);   // 번쩍 뒤엔 다시 손 흔들기
    }
    /* ✅ 확인 카드(저장·참여·투표)는 아일랜드 안에서 바로 누른다 — 원래 카드의 버튼을 대신 눌러 준다 */
    var cfs=logEl.querySelectorAll(".fr-confirm:not(.fr-done)"), cf=cfs.length?cfs[cfs.length-1]:null;
    var cfBox=_asEl.querySelector(".fri-cf");
    if(cf && msgs.length && cf.closest(".fr-msg")===msgs[msgs.length-1]){
      var oy=cf.querySelector(".fr-cf-yes"), on=cf.querySelector(".fr-cf-no");
      var yb=cfBox.querySelector(".fri-cf-yes"); yb.textContent="✓ "+((oy&&oy.textContent)||"확인");
      yb.onclick=function(){ if(oy) oy.click(); cfBox.hidden=true; };
      cfBox.querySelector(".fri-cf-no").onclick=function(){ if(on) on.click(); cfBox.hidden=true; };
      cfBox.hidden=false; hasCards=false;
    } else cfBox.hidden=true;
    _asEl.querySelector(".fra-cards").hidden=!hasCards;
  }
  function openAssist(a, fromBoot){
    if(!sheet) build();
    _assist={ type:(a&&a.k)||(a&&(a.ctype||(/watch\.html/.test(String(a.url||""))?"hottube":"")))||"", id:(a&&a.id)||((String((a&&a.url)||"").match(/[?&]v=([^&]+)/)||[])[1])||"", title:(a&&(a.title||a.t))||"" };
    try{ sessionStorage.setItem("fr_assist", JSON.stringify({ at:Date.now(), k:_assist.type, id:_assist.id, t:_assist.title, from:location.pathname })); sessionStorage.removeItem("fr_mini"); }catch(e){}
    // 본창은 내리고(대화는 그대로 보존) 보조 창을 띄운다
    if(sheet) sheet.classList.remove("fr-open","fr-dock","fr-dock-min");
    _dock=false; document.body.classList.remove("fr-chatting","fr-docked");
    if(mini) mini.classList.remove("on");
    var ms=document.getElementById("frMiniSay"); if(ms) ms.classList.remove("on");
    orb && orb.classList.add("fr-hidden");
    /* 그 콘텐츠를 떠나면(다른 화면으로 이동) 아일랜드도 물러난다 — 주소에 그 id 가 사라지면 닫고 오브 복귀 */
    /* 🔁 콘텐츠를 떠나면 — 사라지지 않고 캡슐로 접힌다. 누르면 원래 대화(풀 모드)로(26.9.22 사장님: 「기사 페이지로 가면 미니 모드가 없어지고 오브를 다시 눌러야 한다」).
       ⚠️ 앱(SPA)은 뉴스를 열면 주소가 #/news 로 바뀌어 id 가 사라진다 → id 대신 '자리 잡은 뒤의 주소'를 기준점으로 삼는다. */
    clearInterval(_asWatch);
    var _asStart=Date.now(); _asHome="";
    _asWatch=setInterval(function(){
      if(!_assist) return;
      var here=location.pathname+location.search+location.hash;
      /* 떠남 판정 — ① id 가 있는 콘텐츠: 주소에 id 가 한 번 보였다가 사라지면(빨리 뒤로 가도 잡힌다 — 시간 기준점은 경쟁이 났다)
                    ② id 없는 것(바깥 기사 등): 자리 잡은 뒤(2.5초) 주소에서 바뀌면 */
      var idStr=_assist.id ? String(_assist.id) : "";
      if(idStr && here.indexOf(idStr)>=0) _assist.seen=true;
      var left = idStr ? (_assist.seen && here.indexOf(idStr)<0)
                       : (Date.now()-_asStart>=2500 && (_asHome ? here!==_asHome : (_asHome=here, false)));
      if(!_assist.away && left && !/tab=(food|travel)/.test(here)){
        _assist.away=true;
        if(_asEl){ _asEl.classList.add("fri-away"); friExpand(false); var tk=_asEl.querySelector(".fri-tick"); if(tk) tk.textContent="대화로 돌아가기"; }
      }
    }, 1000);
    /* 💬 대화 중에 카드를 눌러 왔으면 — 새 한마디·「세 줄 요약」 버튼 없이 하던 대화를 그대로 잇는다(26.9.22 사장님: 「미니 모드도 대화하던 게 아니고 3줄 요약 이러고」) */
    var _fromChat = !fromBoot && !!(logEl && logEl.querySelector(".fr-msg"));
    buildAssist(); _friLastTxt=""; _asBase=logEl ? logEl.querySelectorAll(".fr-msg").length : 0;
    if(_fromChat){ var _ms=logEl.querySelectorAll(".fr-msg"); for(var _i=_ms.length-1;_i>=0;_i--){ if(_ms[_i].classList.contains("fr-u")){ _asBase=_i+1; break; } } }
    try{ var ob=orb && orb.getBoundingClientRect(); if(ob && ob.width){ _asEl.style.setProperty("--fx", Math.round(ob.left+ob.width/2 - window.innerWidth/2)+"px"); _asEl.style.setProperty("--fy", Math.round(ob.top+ob.height/2 - (window.innerHeight-110))+"px"); } }catch(e){}
    setSurface("island"); _asEl.classList.remove("on","fri-open","fri-full"); void _asEl.offsetWidth; _asEl.classList.add("on","fri-think");
    _asEl.querySelector(".fri-tick").textContent="보는 중…";
    if(!_asObs && logEl && window.MutationObserver){ _asObs=new MutationObserver(function(){ syncAssist(); }); _asObs.observe(logEl, {childList:true, subtree:true, characterData:true}); }
    _asEl.querySelector(".fra-msg").textContent="";
    /* 한 번 누르면 되는 도움 — 콘텐츠 종류별 */
    var QK={ issue:["세 줄 요약","넌 어느 편?"], news:["요약해줘","쟁점만"], predict:["판세 알려줘","나도 참여할래"], food:["저장해줘","근처 다른 데"],
      travel:["저장해줘","근처 맛집"], hottube:["비슷한 거 더"], video:["비슷한 거 더"], plaza:["요약해줘","댓글 분위기"], gallari:["비슷한 거 더"] };
    var qk=_asEl.querySelector(".fra-quick"); qk.innerHTML="";
    var QI={ "세 줄 요약":"sum","요약해줘":"sum","쟁점만":"sum","넌 어느 편?":"side","판세 알려줘":"chart","나도 참여할래":"join","저장해줘":"save","근처 다른 데":"pin","근처 맛집":"pin","비슷한 거 더":"more","댓글 분위기":"chart" };
    if(!_fromChat) (QK[_assist.type]||["요약해줘"]).forEach(function(t, qi){ var b=el('<button class="fra-q" style="--qi:'+qi+'">'+(FRI_IC[QI[t]]||FRI_IC.more)+'<span></span></button>'); b.querySelector("span").textContent=t;
      b.onclick=function(){ sendText(t==="세 줄 요약"?"이거 세 줄로 요약해줘":t==="넌 어느 편?"?"넌 이거 어느 편이야?":t==="판세 알려줘"?"이 예측 판세 어때?":t==="근처 다른 데"?"이 근처 다른 맛집도 보여줘":t==="근처 맛집"?"이 근처 맛집 찾아줘":t==="비슷한 거 더"?"이거랑 비슷한 거 더 보여줘":t==="쟁점만"?"이 뉴스 쟁점만 짚어줘":t==="댓글 분위기"?"여기 댓글 분위기 어때?":t); };
      qk.appendChild(b); });
    if(_fromChat){ setTimeout(function(){ syncAssist(); }, 450); return; }   // 하던 대화 그대로(마지막 주고받은 말이 보인다)
    (async function(){
      await sleep(fromBoot ? 900 : 650);          // 화면이 뜬 뒤에 말한다
      if(!logEl.children.length){ try{ await restoreOrGreet(true); }catch(e){} }
      var say=function(q){ addMsg("a", q); history.push({role:"assistant",content:q}); saveChat(); };
      if(!_assist || !_assist.id){ say(MINI_SAY[_assist&&_assist.type]||"다 보면 어땠는지 말해줘 ㅎㅎ"); syncAssist(); return; }
      var r=null; try{ r=await callFriend("", history, null, true, { type:_assist.type, id:_assist.id, title:_assist.title, auto:true }); }catch(e){}   // auto = 우리가 먼저 거는 말(무료 한도 미차감·공유 캐시)
      if(r&&r.reply){ var m=await addFriendReply(r.reply); history.push({role:"assistant",content:r.reply}); addActions(m, r.actions); saveChat(); }
      else say(MINI_SAY[_assist.type]||"다 보면 어땠는지 말해줘 ㅎㅎ");
      syncAssist();
    })();
  }
  var _asWatch=0, _asHome="";
  window.GALLA_assistDbg=function(){ return { assist:_assist, home:_asHome, here:location.pathname+location.search+location.hash, watching:!!_asWatch }; };
  function closeAssist(){
    clearInterval(_asWatch); _asWatch=0; _friPos=null; if(_asEl){ _asEl.classList.remove("fri-free","fri-stash","fri-stash-left"); _asEl.style.left=_asEl.style.top=""; }
    _assist=null; try{ sessionStorage.removeItem("fr_assist"); }catch(e){}
    hideAssist();
  }
  function minimize(a){
    var say = a ? (MINI_SAY[a.ctype || (/watch\.html/.test(String(a.url||""))?"hottube":"")] || "다 보면 어땠는지 말해줘 ㅎㅎ") : "";
    try{ sessionStorage.setItem("fr_mini", JSON.stringify({ at:Date.now(), say:say, t:(a&&a.title)||"", k:(a&&(a.ctype||(/watch\.html/.test(String(a.url||""))?"hottube":"")))||"" })); }catch(e){}
    if(say) setTimeout(function(){ miniSay(say); }, 650);
    if(sheet) sheet.classList.remove("fr-open","fr-dock","fr-dock-min");   // 패널 슬라이드 다운 + 도킹 해제
    _dock=false; document.body.classList.remove("fr-docked");
    document.body.classList.remove("fr-chatting");       // 내비 복원(콘텐츠 탐색 가능)
    orb && orb.classList.add("fr-hidden");               // 런처 오브와 중복 방지
    if(mini){ mini.classList.remove("pop"); void mini.offsetWidth; mini.classList.add("on","pop"); }
    setSurface("mini");
  }
  function restoreFromMini(){
    if(mini) mini.classList.remove("on");
    var ms=document.getElementById("frMiniSay"); if(ms) ms.classList.remove("on");
    var back=null; try{ back=JSON.parse(sessionStorage.getItem("fr_mini")||"null"); sessionStorage.removeItem("fr_mini"); }catch(e){}
    window.__frSuppressGreet=true;                       // 미니에서 돌아온 건 '이어가기' — 새 인사 안 붙인다(「어땠어?」 뒤에 딴 인사가 붙었다)
    open();                                              // 로그·입력 보존된 채 그대로 복귀
    window.__frSuppressGreet=false;
    /* 보고 돌아오면 갈비스가 먼저 묻는다 — 흐름이 이어지게(서버 호출 없음) */
    if(back && back.say && (Date.now()-back.at)>2500){
      setTimeout(function(){
        // 제목은 따옴표·괄호 떼고 어절 단위로 짧게(「"…"여기가 개" 어땠어?」처럼 중간에서 잘리던 것)
        var tt=String(back.t||"").replace(/["“”'‘’「」『』\[\]()<>]/g,"").replace(/\s+/g," ").trim(), ws=tt.split(" "), sh="";
        for(var wi=0; wi<ws.length; wi++){ if((sh+" "+ws[wi]).trim().length>14) break; sh=(sh+" "+ws[wi]).trim(); }
        if(sh && sh.length<tt.length) sh+="…";
        // 무거운 이슈·뉴스에 「어땠어? ㅎㅎ」는 안 맞는다 — 종류별로
        var BACK_Q={ issue:"보고 왔어? 넌 어느 편이야?", news:"다 읽었어? 어떻게 봤어?", predict:"봤어? 넌 어느 쪽 같아?", food:"어때, 맛있어 보여? ㅎㅎ", travel:"어때, 가보고 싶어? ㅎㅎ", hottube:"어땠어? 웃겼어? ㅋㅋ" };
        var q=(sh?(sh+" "):"")+(BACK_Q[back.k]||"어땠어? ㅎㅎ"); addMsg("a", q); history.push({role:"assistant",content:q}); saveChat(); }, 420);
    }
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
    closeAssist();
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
          /* 💸 금액은 서버가 준 값만 쓴다 — 하드코딩이 가격표와 어긋나 있었다
             (문구 200 GC / 실제 gc_prices.thumbnail 60 GC, QA 0909).
             틀린 금액을 말하면 상대가 헛돈을 충전한다. 모르면 숫자 없이 말한다. */
          var _cost = d && d.detail && Number(d.detail.cost);
          addMsg("a", _cost > 0
            ? ("GC가 모자라서 못 그렸어 ㅜ 썸네일 한 장에 " + _cost + " GC거든 — 후원받거나 충전하고 다시 가자")
            : "GC가 모자라서 못 그렸어 ㅜ 후원받거나 충전하고 다시 가자");
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
          /* 💸 위와 같은 이유 — 문구 1000 GC / 실제 gc_prices.video 80 GC 였다(QA 0909) */
          var _vcost = sub && sub.detail && Number(sub.detail.cost);
          addMsg("a", _vcost > 0
            ? ("GC가 모자라서 영상은 못 만들었어 ㅜ 영상 한 편에 " + _vcost + " GC거든 — 후원받거나 충전하고 다시 가자")
            : "GC가 모자라서 영상은 못 만들었어 ㅜ 후원받거나 충전하고 다시 가자");
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
  /* 🎞 실촬영 숏판 — '숏판 실행 에이전트' 접수 카드(사장님 확정 구조: 자체 ffmpeg 렌더러 완주).
     카드에서: 녹음(또는 AI 목소리 선택) → reel-agent 잡 생성 → 서버가 STT 정렬·클립 비전 분석·
     AI 내용 매칭까지 자율 실행 → 렌더 워커가 완성 → 카드가 status 폴링으로 진행을 보여주고
     완성되면 편집기에 자동 첨부(setVideo). 앱을 나가도 잡은 서버에 살아있다. */
  function renderReelScript(text, place){
    if(!text || !logEl) return;
    /* 🔒 창작 에이전트는 런칭 뒤에 연다(agent-hub.js 의 ENABLED 하나로 켜진다).
       '새로 만들기' 쪽 문은 이미 잠겨 있었는데 **이 경로는 안 잠겨 있었다** —
       갈비스가 reelScript 액션을 내리면 녹음·영상 만들기 버튼이 그대로 떴다(2026-09-01 발견).
       대본은 보여준다(그 자체로 쓸모가 있다). 만드는 버튼만 접고 이유를 말한다. */
    /* fail-closed — agent-hub.js 가 아직 안 실렸으면 undefined 다. 런칭 차단은
       '모르면 막는다'가 맞다. 열 때 ENABLED=true 가 되면 여기도 같이 열린다. */
    if (window.GALLA_AGENT_READY !== true) {
      var lock = el('<div class="fr-script fr-reel"><div class="fr-script-h">🎞 숏판 대본' +
        (place ? " — " + place : "") + '</div><div class="fr-script-body"></div>' +
        '<div class="fr-reel-status">영상으로 만들어 주는 기능은 아직 준비 중이에요 — 정식 출시 뒤 바로 열려요 🙂</div></div>');
      lock.querySelector(".fr-script-body").textContent = text;
      logEl.appendChild(lock); scrollBottom();
      return;
    }
    var wrap=el('<div class="fr-script fr-reel"><div class="fr-script-h">🎞 숏판 대본'+(place?" — "+place:"")+'</div><div class="fr-script-body"></div>'+
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
      }catch(e){ status("마이크를 못 열었어 ㅜ"); try { window.GALLA_permHelp && window.GALLA_permHelp("mic"); } catch (_) {} }
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
        addMsg("a", applied ? "숏판 완성! 편집기에 넣어놨어 — [공유]만 누르면 발행 🎬" : "숏판 완성! 영상 꾹 눌러 저장해 쓰면 돼 🎬");
        unlock(); return;
      }
      if(job.state==="failed"){ status(""); addMsg("a","만들다 실패했어 ㅜ 다시 해볼까?"); unlock(); return; }
    }
    unlock(); addMsg("a","렌더가 오래 걸리네 ㅜ 잠시 뒤 '내 숏판 어떻게 됐어?' 하고 물어봐줘");
  }

  /* 🎬 미리보기 = 작업대. 컷 배치는 눈으로 보고 고치는 일이라 말풍선 안에서 할 일이 아니다.
     작업대가 열리면 GALLA_WORKFORM 이 노출되고 → 도킹 미니챗이 저절로 붙는다.
     즉 "대화 → 작업대 → (옆에서 계속 대화) → 완성"이 한 고리로 이어진다.
     ⚠️ 작업대가 없으면(옛 번들·웹 구버전) 예전처럼 말풍선 카드로 떨어진다 — 끊기지는 않는다. */
  function openBench(jobId, fallback){
    /* 🔒 잠금 중이면 작업대를 안 쓴다 — 예전처럼 말풍선 카드로 떨어진다.
       새 기능을 막는 것이지 되던 걸 막는 게 아니다. */
    if(window.GALLA_AGENT_READY === true && window.GALLA_openWorkbench){
      try{
        window.GALLA_openWorkbench(jobId);
        addMsg("a","컷 짜놨어! 작업대 열었으니까 어색한 데만 눌러서 바꿔줘 🎬");
        return true;
      }catch(e){}
    }
    if(typeof fallback==="function") fallback();
    return false;
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
        addMsg("a", items.length ? "사진만으론 숏판 배치가 안 돼 ㅜ 현장에서 찍은 '영상 클립'을 숏판 편집기에 올려줘 (10초 내외 여러 개면 최고)" : "먼저 숏판 편집기에 네가 찍은 클립들을 올려줘! 거기서 다시 부르면 바로 만들게");
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
      // 3) 숏판 에이전트 접수 — 서버가 정렬·분석·매칭·렌더큐까지 자율 실행
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
        status(""); unlock();
        openBench(res.id, function(){
          renderCutPreview(res.id, res.cuts, res.clips||[], jwt, clips, wrap, status, unlock, res.voice||voiceUrl, res.subtitles||[]);
        });
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
            unlock();
            openBench(jobId, function(){
              renderCutPreview(jobId, cu.cuts, cu.clips||[], jwt, clips, wrap, status, unlock, cu.voice, cu.subtitles||[]);
            });
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
        addMsg("a", applied ? "숏판 완성! 편집기에 넣어놨어 — 확인하고 [공유]만 누르면 발행 🎬 (인스타에 올리려면 영상 꾹 눌러 저장)" : "숏판 완성! 영상 꾹 눌러서 저장해 쓰면 돼 🎬");
        unlock();
      } else { unlock(); addMsg("a","렌더가 오래 걸리네 ㅜ 잠시 뒤에 '내 숏판 어떻게 됐어?' 하고 물어봐줘 — 잡은 살아있어"); }
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
  /* 🔴 오브에 '선톡 왔음' 점 켜기 — 소모하지 않고 존재만 확인.
     세션당 한 번만(페이지 이동마다 왕복하지 않게). 패널을 열면 consumePing이 실제로 소모한다. */
  async function peekPing(){
    try{
      if(sessionStorage.getItem("galla:frpeek")==="1") return;
      sessionStorage.setItem("galla:frpeek","1");
    }catch(e){}
    var jwt=await token(); if(!jwt) return;
    try{
      var res=await fetch(SB+"/functions/v1/galla-friend",{ method:"POST",
        headers:{apikey:ANON, Authorization:"Bearer "+jwt, "Content-Type":"application/json"},
        body:JSON.stringify({op:"peek_ping"}) });
      var d=await res.json();
      if(d && d.has && orb && !sheet?.classList.contains("fr-open")) orb.classList.add("fr-ping");
    }catch(e){}
  }
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
      _frNoAnim=true;
      history.forEach(function(msg){
        if(msg && msg.role==="user"){ addMsg("u", msg.content||""); }
        else { splitBubbles((msg&&msg.content)||"").forEach(function(p){ addMsg("a", p); }); }  // 복원도 버블 단위
      });
      _frNoAnim=false;
      restoreCards();
      /* 📍 새 대화 경계 — 복원분은 살짝 딤 + 구분선. "어디부터 지금 대화인지 모르겠다"(사장님). */
      try{
        logEl.querySelectorAll(".fr-msg").forEach(function(m){ m.classList.add("fr-old"); });
        var now=new Date(); var hh=("0"+now.getHours()).slice(-2)+":"+("0"+now.getMinutes()).slice(-2);
        logEl.appendChild(el('<div class="fr-divider"><span>'+hh+' · 새 대화</span></div>'));
      }catch(e){}
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
  /* 💛 폰에서 바로 하는 인사 — 시간대별, 다시 온 사람엔 「또 왔네」 */
  /* 💬 폰 인사 — 「오 왔네」만 반복하던 것(26.9.22 사장님: 「맨날 오 왔네, 재미없다」). 시간·요일별로 많이, 최근 6개는 안 쓴다 */
  function localGreet(back){
    var d=new Date(), h=d.getHours(), wd=d.getDay();
    var P=[];
    if(h<5) P=P.concat(["이 시간에 깨어 있는 사람 = 나랑 너 둘뿐인 듯 ㅋㅋ","새벽 감성 충전하러 왔구나? 뭐든 털어놔","잠 안 오는 밤엔 갈라지 ㅎㅎ 오늘 무슨 생각해?","야행성 인정 ㅋㅋ 야식 뭐 먹었어?"]);
    else if(h<9) P=P.concat(["굿모닝! 커피 수혈 완료?","아침부터 날 찾다니 감동이다 ㅠㅠ","출근길이야? 지루할 때 나랑 놀자","일어나자마자 갈라라니 찐이다 ㅋㅋ"]);
    else if(h<12) P=P.concat(["오전 버티는 중? 딴짓하러 왔구나 ㅋㅋ","점심 뭐 먹을지 벌써 고민 중이지?","오늘 뭐 재밌는 일 있었어?"]);
    else if(h<14) P=P.concat(["점심 뭐 먹었어? 맛있었으면 자랑해","식곤증 오는 시간 ㅋㅋ 나랑 수다로 깨자","밥 먹고 왔어? 오늘 메뉴 궁금하다"]);
    else if(h<18) P=P.concat(["오후 세 시의 저주 ㅋㅋ 버틸 거리 줄까?","퇴근까지 얼마나 남았어? 같이 세자","오늘 하루 절반 넘겼다! 수고 중이야"]);
    else if(h<22) P=P.concat(["오늘도 고생했어 👏 저녁은 먹었어?","하루 어땠어? 좋은 거 하나만 말해줘","퇴근 후 자유시간! 뭐 하고 놀까","저녁 뭐 먹을지 같이 골라줄까?"]);
    else P=P.concat(["하루 마무리하러 왔구나 ㅎㅎ 오늘 최고의 순간은?","자기 전에 수다 한 판? 좋지","내일 뭐 해? 미리 응원해줄게"]);
    if(wd===5 && h>=15) P.push("불금이다!! 오늘 뭐 할 거야?");
    if(wd===1 && h<14) P.push("월요병 괜찮아? 나도 옆에서 버틸게 ㅋㅋ");
    if(wd===0||wd===6) P.push("주말이다~ 오늘은 뭐 하고 쉬어?");
    if(back) P=P.concat(["보고 싶었는데 딱 왔네 ㅎㅎ","기다리고 있었지! 무슨 일이야?"]);
    var used=[]; try{ used=JSON.parse(localStorage.getItem("fr_greet_used")||"[]"); }catch(e){}
    var cand=P.filter(function(x){ return used.indexOf(x)<0; }); if(!cand.length) cand=P;
    var pick=cand[Math.floor(Math.random()*cand.length)];
    try{ used.push(pick); localStorage.setItem("fr_greet_used", JSON.stringify(used.slice(-6))); }catch(e){}
    return pick;
  }
  var _greetStale=false;   // 🔐 greet race — 인사 응답 오기 전에 유저가 먼저 말 걸면 인사를 버린다(요청 씹힘 방지, 실사용 E2E 마찰#1)
  var _greeting=false;
  async function greet(){
    if(_greeting) return;            // 진행 중인 인사가 있으면 겹쳐 부르지 않는다
    if(talkingNow() && logEl && logEl.querySelector(".fr-msg")) return;   // 🗣 얘기 중(10분 안)엔 인사 없이 이어간다(「얘기 중에 또 왔네」 금지)
    _greeting=true;
    try{ await _greet(); } finally { _greeting=false; }
  }
  async function _greet(){
    // 빈 메시지 → 서버가 첫만남/재방문 판단해 반겨줌(기억 리콜 + 그 사이 갈라에서 한 일)
    _greetStale=false;
    /* ⌨️ 타이핑 표시는 '늦게' 띄운다 — 서버가 "조용히 있어라"(공백 30분 미만)로 즉답하면
       말풍선도 없이 점만 깜빡였다 사라져 고장난 것처럼 보인다. 400ms 안에 오면 아예 안 띄운다. */
    /* 열자마자 타이핑 도트 즉시 — 400ms 지연은 "눌러도 반응이 없다"는 첫인상을 만들었다. */
    var tShown=true, tT=0; typing(true);
    /* 🌊 인사 스트리밍 — 첫 글자가 ~1초에 뜬다(예전엔 통짜 JSON 2~4초).
       서버가 SSE 를 주면 라이브 렌더, 아니면(구서버·게스트·quiet) JSON 그대로. */
    var r=null, liveEl=null;
    try{
      var gb=fbBody("", [], null, true); gb.stream=true; gb.greetStream=true;
      var res=await friendFetch(gb);
      if(res.__authFail){ r=null; }
      else{
        var ct=(res.headers.get("content-type")||"");
        if(ct.indexOf("text/event-stream")>=0 && res.body && res.body.getReader){
          r=await consumeStream(res, function(full){
            if(_greetStale) return;                       // 유저가 먼저 말 걸었으면 라이브 렌더도 중단
            if(!liveEl){ typing(false); tShown=false; liveEl=addMsg("a",""); }
            var bub=liveEl.querySelector(".fr-bubble"); if(bub) bub.innerHTML=fmtStage(full);
            logEl.scrollTop=logEl.scrollHeight;
          });
        } else { r=await res.json(); }
      }
    }catch(e){ r=null; }
    if(tT)clearTimeout(tT); if(tShown) typing(false);
    /* 스트림으로 이미 그렸으면 아래 addFriendReply 중복 방지 — 라이브 버블을 최종본으로 확정 */
    if(liveEl && r && r.streamed){
      if(_greetStale){ liveEl.remove(); }
      else{
        var parts=(r._bubbles&&r._bubbles.length)?r._bubbles:[r.reply||""];
        var bub0=liveEl.querySelector(".fr-bubble"); if(bub0) bub0.innerHTML=fmtStage(parts[0]||"");
        for(var bi=1; bi<parts.length; bi++) addMsg("a", parts[bi]);
        history.push({role:"assistant",content:r.reply||""}); saveChat(); scrollBottom();
        if(r.friendName){ friendName=r.friendName; setTitle(); }
      }
      return;
    }
    if(_greetStale){ if(r&&r.friendName){ friendName=r.friendName; setTitle(); } return; }   // 유저가 이미 용건을 말함 — 인사 폐기
    if(r && r.friendName){ friendName=r.friendName; setTitle(); }
    /* 🤫 서버가 '지금은 말 걸 때가 아니다'라고 판단하면(quiet 또는 빈 reply) 조용히 물러난다.
       ⚠️ 여기서 기본 인사말로 대체하면 침묵 문턱이 통째로 무의미해진다(열 때마다 "안녕!" 스팸). */
    /* 💛 26.9.22 사장님: 「창을 띄우면 갈비스가 먼저 반겨줘야」 — 서버가 조용히(3분 안 재오픈·무료 인사 한도 0) 하거나 실패해도
       폰에서 바로 시간대 인사(비용 0). 20초 안에 여닫기만 반복할 때만 쉰다(인사 쌓임 방지). */
    if(!r || r.ok===false || r.quiet===true || (typeof r.reply==="string" && !r.reply.trim())){
      if(Date.now() - (window.__frLastGreet||0) < 20000) return;
      window.__frLastGreet = Date.now();
      var gl = localGreet(history.length>0); addMsg("a", gl); history.push({role:"assistant",content:gl}); saveChat(); scrollBottom();
      return;
    }
    window.__frLastGreet = Date.now();
    /* 기본 인사는 '화면이 비어 있을 때'만 쓴다.
       비로그인·네트워크 실패면 서버가 판단을 못 하는데, 그때마다 폴백을 찍으면
       열 때마다 "안녕! 나 갈비스야"가 쌓인다(열 때마다 인사 시도로 바꾼 뒤 실측). */
    var shown = logEl && logEl.children.length;
    if(shown && (!r || r.ok === false)) return;
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
  /* ✨ 답 글 꾸미기(26.9.22 사장님: 「사람들이 받아보는 결과물 — 텍스트 형식을 비주얼로 죽이게, 동적으로」)
     숫자·평점·퍼센트·GP·시간은 빛나는 숫자(0부터 올라감), 따옴표 제목은 빛 밑줄, 찬성/반대는 색 표식,
     「1. / · 」 줄은 번호 배지 줄. 태그 밖 글자에만 건다(짤·지문 태그는 그대로). */
  function fmtRich(html){
    var UNIT="GP|명|개|원|만\\s?원|억|곳|표|회|위|배|km|m|분|초|도|점|편|건|대";
    return String(html||"").split(/(<[^>]+>)/).map(function(seg){
      if(!seg || seg.charAt(0)==="<") return seg;
      return seg
        .replace(/★\s?(\d(?:\.\d)?)/g, '<span class="rx-star">★<b class="rx-num" data-n="$1">$1</b></span>')
        .replace(/(\d{1,3}(?:\.\d)?)\s?%/g, '<b class="rx-num rx-pct" data-n="$1">$1</b><span class="rx-u">%</span>')
        .replace(/((?:오전|오후|새벽|아침|저녁|밤)\s?)?(\d{1,2})시(\s?(?:\d{1,2}분|반))?/g, function(m){ var lead=m.match(/^\s*/)[0]; return lead+'<span class="rx-time">'+m.trim()+'</span>'; })
        .replace(new RegExp("(\\d{1,3}(?:,\\d{3})+|\\d+(?:\\.\\d+)?)\\s?("+UNIT+")","g"), function(m,n,u){ return '<b class="rx-num" data-n="'+n.replace(/,/g,"")+'">'+n+'</b><span class="rx-u">'+u+'</span>'; })
        .replace(/(&quot;|“|「|『)([^&“”「」『』<>\n]{2,40})(&quot;|”|」|』)/g, '<span class="rx-q">$1$2$3</span>')
        .replace(/(^|[\s(])(찬성|반대)(?=[\s,.!?)쪽에이가을도]|$)/g, function(m,a,w){ return a+'<span class="rx-side '+(w==="찬성"?"pro":"con")+'">'+w+'</span>'; });
    }).join("")
    // 줄머리 번호·가운뎃점 → 번호 배지 줄(줄바꿈은 블록이 대신한다)
    .replace(/(^|\n)\s*(?:([1-9])[.)]|[·•\-–])\s+([^\n]+)/g, function(m,pre,n,body){ return '<span class="rx-li"><i class="rx-ln">'+(n||"•")+'</i><span>'+body+'</span></span>'; });
  }
  /* 새 답 등장 — 단어가 흐릿→또렷하게 차르르(자비스 말하듯), 숫자는 제 차례에 0부터 올라간다 */
  var _frNoAnim=false;
  function revealRich(box){
    if(!box || _frNoAnim || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    var d=0, STEP=55, MAX=2400;   // 흘러나오는 게 눈에 보이게(26→55ms)
    (function walk(node){
      Array.prototype.slice.call(node.childNodes).forEach(function(n){
        if(n.nodeType===3){
          var parts=n.textContent.split(/(\s+)/); if(parts.length<=1 && !n.textContent.trim()) return;
          var frag=document.createDocumentFragment();
          parts.forEach(function(w){ if(!w) return; if(/^\s+$/.test(w)){ frag.appendChild(document.createTextNode(w)); return; }
            var sp=document.createElement("span"); sp.className="rx-w"; sp.style.setProperty("--d", Math.min(d,MAX)+"ms"); sp.textContent=w; frag.appendChild(sp); d+=STEP; });
          n.parentNode.replaceChild(frag, n);
        } else if(n.nodeType===1){
          if(/^(IMG|VIDEO|BUTTON)$/.test(n.tagName) || n.classList.contains("fr-acts")) return;
          if(n.classList.contains("rx-num") || n.classList.contains("rx-time") || n.classList.contains("rx-side") || n.classList.contains("rx-q") || n.classList.contains("rx-star") || n.classList.contains("rx-u")){
            n.classList.add("rx-w"); n.style.setProperty("--d", Math.min(d,MAX)+"ms");
            var nums = n.classList.contains("rx-num") ? [n] : Array.prototype.slice.call(n.querySelectorAll(".rx-num"));
            nums.forEach(function(x){ countUp(x, Math.min(d,MAX)); });
            d+=STEP*2; return;
          }
          if(n.classList.contains("rx-li")){ n.style.setProperty("--d", Math.min(d,MAX)+"ms"); n.classList.add("rx-li-in"); }
          walk(n);
        }
      });
    })(box);
  }
  function countUp(x, delay){
    var to=parseFloat(x.getAttribute("data-n")); if(!isFinite(to) || to===0) return;
    var dec=(String(x.getAttribute("data-n")).split(".")[1]||"").length, fin=x.textContent, big=to>=1000;
    x.textContent=dec?(0).toFixed(dec):"0";
    setTimeout(function(){ var t0=performance.now(), ms=Math.min(1600, 800+String(Math.round(to)).length*160);   // 올라가는 게 보이게
      (function f(t){ var p=Math.min(1,(t-t0)/ms), v=to*(1-Math.pow(1-p,3));
        x.textContent = p>=1 ? fin : (dec? v.toFixed(dec) : (big? Math.round(v).toLocaleString("ko-KR") : String(Math.round(v))));
        if(p<1) requestAnimationFrame(f); })(t0); }, delay+80);
  }
  /* ⏱ 대화 중인지 — 마지막 말(누구든) 뒤 10분 안이면 '이어가는 중', 넘으면 '새 세션'(인사) */
  function markTalk(){ try{ localStorage.setItem("fr_last_at", String(Date.now())); }catch(e){} }
  function talkingNow(){ try{ return (Date.now() - (+localStorage.getItem("fr_last_at")||0)) < 10*60000; }catch(e){ return false; } }
  function addMsg(role,text){
    if(!_frNoAnim) markTalk();
    var m;
    if(role==="u"){ m=el('<div class="fr-msg fr-u"></div>'); m.textContent=text; }
    else { m=el('<div class="fr-msg fr-a'+(_frNoAnim?"":" rx-new")+'"><div class="fr-bubble"></div></div>'); var bb=m.querySelector(".fr-bubble"); bb.innerHTML=fmtRich(fmtStage(text)); revealRich(bb); }
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
    try{ if(!_frNoAnim && navigator.vibrate) navigator.vibrate([8,40,12]); }catch(e){}
    for(var i=0;i<parts.length;i++){
      if(i>0 && !instant){ typing(true); await sleep(380+Math.min(parts[i].length*6,420)); typing(false); }
      last=addMsg("a", parts[i]);
      if(i===0 && last && !_frNoAnim){ last.classList.add("rx-glow"); faceMood("speak"); }   // 첫 말풍선에 네 색 빛 테두리 한 바퀴
    }
    try{ var ch=parseChoices(text); if(ch) addChoices(last, ch); }catch(e){}
    return last;
  }
  function esc(s){ return String(s==null?"":s).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];}); }
  /* 🔢 넘버링 선택지 — 갈비스가 "1. … 2. …" 안을 내면(제목 후보·기획 3안 등)
     번호 버튼으로 바꿔 탭 한 번에 고르게 한다(사장님: "클로드처럼 넘버링 선택").
     타이핑 없이 고르는 순간이 '교류하는 느낌'의 핵심이다. */
  function parseChoices(text){
    var items=[]; var re=/^\s*([1-9])[.)]\s+(.+)$/gm; var m;
    while((m=re.exec(String(text||"")))){ items.push({n:+m[1], t:m[2].trim().slice(0,60)}); }
    // 진짜 선택지만: 2~5개, 번호가 1부터 연속
    if(items.length<2||items.length>5) return null;
    for(var i=0;i<items.length;i++){ if(items[i].n!==i+1) return null; }
    return items;
  }
  function addChoices(afterEl, items){
    _cardGroup=null;   // 🔢 텍스트 선택지 턴 — "N번"은 서버로 보낸다(카드 인터셉트와 충돌 방지)
    var wrap=el('<div class="fr-choices fr-in"></div>');
    items.forEach(function(it){
      var b=el('<button class="fr-choice"><span class="fr-choice-n">'+it.n+'</span><span class="fr-choice-t"></span></button>');
      b.querySelector(".fr-choice-t").textContent=it.t;
      b.onclick=function(){
        wrap.querySelectorAll(".fr-choice").forEach(function(x){ x.disabled=true; });
        b.classList.add("fr-choice-sel");
        setTimeout(function(){ wrap.remove(); }, 350);
        sendText(it.n+"번");
      };
      wrap.appendChild(b);
    });
    if(afterEl&&afterEl.parentNode){ afterEl.parentNode.insertBefore(wrap, afterEl.nextSibling); }
    else logEl.appendChild(wrap);
    scrollBottom();
  }
  /* 🔢 직전 턴의 '고를 수 있는 카드 묶음' — "2번"이라고 치면 서버 왕복 없이 그 카드를 바로 연다.
     (사장님: 추천이 여러 개면 '열어줘' 하기 전에 선택지를 주는 게 나은 UX) */
  var _cardGroup=null;
  var _offerOne=null;   // 🃏 카드 한 장 — 「ㅇㅇ」만 쳐도 연다
  /* 🃏 콘텐츠 카드 덱(26.9.22 사장님: 「텍스트 말고 형식을 갖춘 멋진 카드 — 썸네일, 돈 안 들게 최대 멋지고 동적인 애니메이션,
     대접받는 느낌 번쩍번쩍」·「다지선다도 고려」). 전부 CSS(비용 0). 여러 장 = 가로 넘김 + 번호 + 번호 빠른 선택 줄. */
  var TC_KIND={
    issue:{n:"이슈",c:"#ff6b57"}, news:{n:"갈라뉴스",c:"#5ab0ff"}, predict:{n:"예측",c:"#b07cff"}, food:{n:"맛집",c:"#ffb020"},
    travel:{n:"여행",c:"#2fd3c6"}, plaza:{n:"광장",c:"#36c2a0"}, gallari:{n:"숏판",c:"#ff4fa3"}, hottube:{n:"핫튜브",c:"#ff5a3d"}, link:{n:"링크",c:"#9aa0ae"}
  };
  var TC_ICON={
    food:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10"/><path d="M17 21V3c-2 1.5-3 4-3 7s1 4 3 4"/></svg>',
    travel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>'
  };
  function tcIcon(k){
    if(TC_ICON[k]) return TC_ICON[k];
    var m={gallari:"short"}[k]||k;
    try{ if(window.GALLA_KIND&&GALLA_KIND.icon){ var ic=GALLA_KIND.icon(m,26); if(ic) return ic; } }catch(e){}
    return ICON.globe;
  }
  function buildDeck(links, numbered){
    var multi=links.length>=2;
    var deck=el('<div class="fr-deck'+(multi?' fr-deck-multi':' fr-deck-one')+'"><div class="fr-deck-track"></div></div>');
    var track=deck.querySelector(".fr-deck-track");
    links.forEach(function(a, i){
      var k=a.ctype||(/watch\.html\?v=/.test(String(a.url||""))?"hottube":(a.kind==="open"?"link":"issue"));
      var km=TC_KIND[k]||TC_KIND.link;
      var badge=a.badge||km.n;
      var img=a.img && /^https:\/\//.test(String(a.img)) ? String(a.img) : "";
      var title=a.title || (a.label||"").replace(/\s*보기$/,"") || "바로 열어보기";
      var c=el('<button class="fr-tc'+(a.pick?' fr-tc-pick':'')+(img?'':' fr-tc-noimg')+'" style="--i:'+i+';--kc:'+km.c+'">'+
        '<span class="fr-tc-media">'+
          (img?'<img alt="" loading="lazy" decoding="async">':'<span class="fr-tc-ph">'+tcIcon(k)+'</span>')+
          '<span class="fr-tc-shade"></span><span class="fr-tc-shine"></span>'+
          '<span class="fr-tc-badge"></span>'+
          (numbered?'<b class="fr-tc-n">'+(i+1)+'</b>':'')+
          (a.pick?'<span class="fr-tc-pickrib">갈비스 픽</span>':'')+
        '</span>'+
        '<span class="fr-tc-body"><span class="fr-tc-t"></span>'+(a.sub?'<span class="fr-tc-s"></span>':'')+
          '<span class="fr-tc-cta">'+(k==="hottube"?"재생":"열어보기")+' '+ICON.go+'</span></span>'+
      '</button>');
      c.querySelector(".fr-tc-badge").textContent=badge;
      c.querySelector(".fr-tc-t").textContent=title;
      if(a.sub) c.querySelector(".fr-tc-s").textContent=a.sub;
      if(img){ var im=c.querySelector("img"); im.onerror=function(){ c.classList.add("fr-tc-noimg"); var ph=el('<span class="fr-tc-ph">'+tcIcon(k)+'</span>'); im.replaceWith(ph); }; im.src=img; }
      c.addEventListener("click", function(){ tcLaunch(c, a); });
      track.appendChild(c);
    });
    if(!multi && !links[0].auto) deck.appendChild(el('<div class="fr-deck-hint">「ㅇㅇ」만 쳐도 바로 열어줄게</div>'));
    if(multi && numbered){
      var pick=el('<div class="fr-deck-pick"></div>');
      links.forEach(function(a,i){
        var b=el('<button class="fr-deck-num" style="--i:'+i+'"><b>'+(i+1)+'</b><span></span></button>');
        b.querySelector("span").textContent=String(a.title||"").slice(0,12);
        b.onclick=function(){ var cs=track.querySelectorAll(".fr-tc"); if(cs[i]){ try{ cs[i].scrollIntoView({behavior:"smooth",inline:"center",block:"nearest"}); }catch(e){} tcLaunch(cs[i], a); } };
        pick.appendChild(b);
      });
      deck.appendChild(pick);
    }
    return deck;
  }
  /* 누르면 번쩍 — 카드가 빛나며 튀어 오른 뒤 연다 */
  function tcLaunch(card, a){
    if(!card || card.classList.contains("fr-tc-go")){ runAction(a); return; }
    _cardGroup=null; _offerOne=null;
    card.classList.add("fr-tc-go");
    try{ if(navigator.vibrate) navigator.vibrate(12); }catch(e){}
    setTimeout(function(){ runAction(a); setTimeout(function(){ card.classList.remove("fr-tc-go"); },400); }, 320);
  }
  /* 🌦 날씨 그림 — 하늘 상태별 SVG 애니메이션(해 빛살 회전·구름 흐름·빗방울·눈송이·번개) */
  function wxKind(sky){ sky=String(sky||""); return /뇌|번개/.test(sky)?"storm":/눈|폭설/.test(sky)?"snow":/비|소나기|이슬/.test(sky)?"rain":/안개/.test(sky)?"fog":/구름\s*조금|대체로/.test(sky)?"partly":/구름|흐림/.test(sky)?"cloud":"sun"; }
  function wxIcon(k, size){
    var sun='<g class="wx-sun"><circle cx="32" cy="30" r="11" fill="url(#wxS)"/><g class="wx-rays" stroke="#ffd76a" stroke-width="3" stroke-linecap="round">'+
      [0,45,90,135,180,225,270,315].map(function(a){ return '<line x1="32" y1="10" x2="32" y2="14" transform="rotate('+a+' 32 30)"/>'; }).join("")+'</g></g>';
    var cloud=function(x,y,s,c){ return '<g class="wx-cloud" transform="translate('+x+' '+y+') scale('+s+')"><path d="M14 30a10 10 0 0 1 1-20 13 13 0 0 1 25 4 8 8 0 0 1 0 16z" fill="'+(c||"url(#wxC)")+'"/></g>'; };
    var drops='<g class="wx-drops" stroke="#7fd4ff" stroke-width="2.4" stroke-linecap="round"><line x1="22" y1="44" x2="19" y2="52"/><line x1="32" y1="44" x2="29" y2="52"/><line x1="42" y1="44" x2="39" y2="52"/></g>';
    var flakes='<g class="wx-flakes" fill="#fff"><circle cx="21" cy="47" r="2"/><circle cx="32" cy="50" r="2"/><circle cx="43" cy="47" r="2"/></g>';
    var bolt='<path class="wx-bolt" d="M34 40l-7 11h6l-3 9 10-13h-6l4-7z" fill="#ffe36b"/>';
    var fog='<g class="wx-fog" stroke="#cfe3ef" stroke-width="3" stroke-linecap="round" opacity=".8"><line x1="12" y1="42" x2="52" y2="42"/><line x1="16" y1="49" x2="48" y2="49"/></g>';
    // 🌙 밤(19~6시, 지금 날씨일 때만)엔 해 대신 달과 반짝이는 별
    var moon='<g class="wx-moon"><path d="M40 16a14 14 0 1 0 8 25 11 11 0 1 1 -8 -25z" fill="url(#wxM)"/><g class="wx-stars" fill="#fff"><circle cx="16" cy="14" r="1.4"/><circle cx="12" cy="30" r="1"/><circle cx="24" cy="8" r="1"/></g></g>';
    if(wxIcon._night && (k==="sun"||k==="partly")){ sun=moon; }
    var body = k==="sun"?sun : k==="partly"?(sun+cloud(10,14,.95)) : k==="cloud"?(cloud(2,6,1.1,"url(#wxC2)")+cloud(10,12,.9)) : k==="rain"?(cloud(6,2,1.05,"url(#wxC2)")+drops) : k==="snow"?(cloud(6,2,1.05)+flakes) : k==="storm"?(cloud(6,0,1.05,"url(#wxC2)")+bolt) : (cloud(6,2,1)+fog);
    return '<svg class="wx-ic wx-'+k+'" width="'+size+'" height="'+size+'" viewBox="0 0 64 64" aria-hidden="true"><defs>'+
      '<linearGradient id="wxM" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffbe6"/><stop offset="1" stop-color="#d9d2a8"/></linearGradient>'+
      '<radialGradient id="wxS"><stop offset="0" stop-color="#fff6c2"/><stop offset=".6" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff9f1c"/></radialGradient>'+
      '<linearGradient id="wxC" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe0ee"/></linearGradient>'+
      '<linearGradient id="wxC2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d9e3ec"/><stop offset="1" stop-color="#8ea3b5"/></linearGradient></defs>'+body+'</svg>';
  }
  function buildWx(a){
    var go=function(){ if(a.page){ minimize(); nav(a.page); } };
    if(a.mode==="fc"){
      var c=el('<button class="fr-wx fr-wx-fc"><div class="wx-h"><span class="wx-reg"></span><span class="wx-lbl">예보</span></div><div class="wx-rows"></div><span class="wx-go">날씨 화면 ›</span></button>');
      c.querySelector(".wx-reg").textContent=a.region||"날씨";
      var rows=c.querySelector(".wx-rows");
      (a.days||[]).forEach(function(d,i){
        var r=el('<div class="wx-row" style="--i:'+i+'"><span class="wx-d"></span>'+wxIcon(wxKind(d["하늘"]),30)+'<span class="wx-sky"></span><span class="wx-t"><b class="wx-hi"></b><i class="wx-lo"></i></span><span class="wx-pop"></span></div>');
        r.querySelector(".wx-d").textContent=d["날짜"]||""; r.querySelector(".wx-sky").textContent=d["하늘"]||"";
        r.querySelector(".wx-hi").textContent=(d["최고"]!=null?d["최고"]+"°":""); r.querySelector(".wx-lo").textContent=(d["최저"]!=null?d["최저"]+"°":"");
        r.querySelector(".wx-pop").textContent=(d["비올확률"]!=null?"☂ "+d["비올확률"]+"%":"");
        rows.appendChild(r);
      });
      c.addEventListener("click", go); return c;
    }
    var k=wxKind(a.sky), hh=new Date().getHours(), night=(hh>=19||hh<6);
    wxIcon._night=night;
    var c2=el('<button class="fr-wx wx-bg-'+k+(night?' wx-night':'')+'"><div class="wx-main">'+wxIcon(k,78)+'<div class="wx-info"><div class="wx-reg"></div><div class="wx-temp"><b class="wx-num">0</b><span>°</span></div><div class="wx-sky"></div></div></div><div class="wx-rep"></div><span class="wx-go">날씨 화면 ›</span></button>');
    c2.querySelector(".wx-reg").textContent=a.region||"";
    c2.querySelector(".wx-sky").textContent=(a.sky||"")+(a.precip?" · 강수 "+a.precip+"mm":"");
    var rep=a.rep||{}, tot=(rep["비"]||0)+(rep["눈"]||0)+(rep["안옴"]||0);
    c2.querySelector(".wx-rep").textContent = tot ? ("지금 사람들 제보 · 비 "+(rep["비"]||0)+" · 눈 "+(rep["눈"]||0)+" · 안 옴 "+(rep["안옴"]||0)) : "갈라 제보 아직 없음 — 날씨 화면에서 한마디 남겨봐";
    var nb=c2.querySelector(".wx-num"), to=Number(a.temp)||0, dec=(String(a.temp).split(".")[1]||"").length?1:0;
    setTimeout(function(){ var t0=performance.now(); (function f(t){ var p=Math.min(1,(t-t0)/1100), v=to*(1-Math.pow(1-p,3)); nb.textContent=dec?v.toFixed(1):Math.round(v); if(p<1) requestAnimationFrame(f); else nb.textContent=String(a.temp); })(t0); }, 250);
    wxIcon._night=false;
    c2.addEventListener("click", go); return c2;
  }
  function addActions(msgEl, actions){
    if(!actions||!actions.length) return;
    if(!(actions[0] && actions[0]._restored)) rememberCards(msgEl, actions);
    var links=actions.filter(function(a){ return (a.kind==="open"||a.kind==="view") && (a.title||a.sub); });
    var numbered = links.length>=2 && !actions.some(function(a){ return a.auto===true; });
    _cardGroup = numbered ? links : null;
    _offerOne = (links.length===1 && !links[0].auto) ? links[0] : null;
    var wrap=el('<div class="fr-acts fr-in"></div>');
    var _deckDone=false;
    actions.forEach(function(a){
      // 🎟 가입 유도 — 맛보기가 끝났을 때만 뜬다. 지금까지 나눈 대화가 아까워지는 지점에 딱 하나.
      if(a.kind==="signup"){
        var sb2=el('<button class="fr-chip fr-chip-cta"></button>');
        sb2.textContent=a.label||"가입하고 계속하기";
        sb2.onclick=function(){
          try{ sessionStorage.setItem("galla_after_login","friend"); }catch(e){}
          /* 앱(SPA)에선 셸 안 로그인 뷰로 — location.href 로 나가면 셸을 벗어난다(26.9.18 비로그인 점검) */
          if(window.GALLA_gotoLogin){ window.GALLA_gotoLogin(location.pathname.replace(/^\//,"") + location.search); return; }
          location.href="login.html?next=" + encodeURIComponent(location.pathname + location.search);
        };
        wrap.appendChild(sb2); return;
      }
      // 🌦 날씨 카드(26.9.22) — 움직이는 날씨 그림 + 큰 기온(0부터 올라감) + 사람들 제보 / 예보 줄
      if(a.kind==="weather"){ wrap.appendChild(buildWx(a)); return; }
      // ✅ 채팅 안 행동 확인 카드(26.9.22) — 예측 참여·가게 저장·맛 판정·여행지 저장·이슈 투표.
      //    서버는 카드만 만든다. '확인'을 눌러야 사용자 본인 세션으로 실행된다(GP 가 걸린 일이라 대신 걸지 않는다).
      if(a.kind==="confirm"){
        var cf=el('<div class="fr-confirm"><div class="fr-confirm-t"></div><div class="fr-confirm-s"></div><div class="fr-confirm-b"><button class="fr-chip fr-chip-cta fr-cf-yes"></button><button class="fr-chip fr-cf-no">취소</button></div></div>');
        cf.querySelector(".fr-confirm-t").textContent=a.title||"";
        cf.querySelector(".fr-confirm-s").textContent=a.sub||"";
        var yes=cf.querySelector(".fr-cf-yes"), no=cf.querySelector(".fr-cf-no");
        yes.textContent=a.yes||"확인";
        no.onclick=function(){ cf.classList.add("fr-done"); yes.disabled=no.disabled=true; addMsg("a","ㅇㅋ 안 할게 ㅎㅎ"); };
        yes.onclick=async function(){
          yes.disabled=no.disabled=true;
          var c=window.supabaseClient, msg="";
          try{
            if(a.op==="bet"){
              var r=await c.rpc("place_bet",{p_market_id:a.market_id,p_outcome_id:a.outcome_id,p_stake:a.stake});
              var d=r&&r.data;
              if(d&&d.ok) msg="참여 완료! "+(a.stake||"")+" GP — 남은 GP "+Math.round(d.balance||0).toLocaleString("ko-KR")+" 🔥";
              else msg=({insufficient:"GP가 모자라서 참여 못 했어 ㅠ",closed:"이미 마감돼서 참여 못 했어",other_side:"이미 다른 쪽에 참여해서 반대편엔 참여할 수 없어",below_min:"최소 금액보다 적어서 안 됐어",above_max:"한도를 넘어서 안 됐어",stake_cap:"이 예측에 걸 수 있는 한도를 넘었어",banned:"지금은 예측에 참여할 수 없는 상태야",predict_disabled:"예측이 잠시 닫혀 있어",unauthorized:"로그인이 필요해"})[d&&d.reason] || "안 됐어 — 잠시 뒤에 다시 해볼래?";
            } else if(a.op==="save_place"||a.op==="save_travel"){
              var r2=await c.rpc(a.op==="save_place"?"food_toggle_save":"travel_save",{p_id:a.id});
              var d2=r2&&r2.data;
              msg = d2&&d2.ok ? (d2.saved?"저장했어! 📌 나중에 저장 목록에서 볼 수 있어":"저장 해제했어") : "저장이 안 됐어 — 로그인했는지 봐줄래?";
            } else if(a.op==="judge_place"){
              var r3=await c.rpc("food_judge",{p_id:a.id,p_verdict:a.verdict});
              msg = r3&&r3.data&&r3.data.ok ? (a.verdict==="good"?"맛있다에 한 표 넣었어 😋":"별로에 한 표 넣었어") : "투표가 안 됐어 ㅠ";
            } else if(a.op==="vote_issue"){
              var sess=await c.auth.getSession(); var uid=sess&&sess.data&&sess.data.session&&sess.data.session.user&&sess.data.session.user.id;
              if(!uid) msg="로그인이 필요해";
              else {
                var r4=await c.from("votes").insert({issue_id:a.id,user_id:uid,type:a.side});
                msg = !r4.error ? "투표했어! 🗳" : (/duplicate|23505/.test(String(r4.error.code||r4.error.message))?"이미 이 이슈에 투표했더라 — 한 번 고르면 못 바꿔":"투표가 안 됐어 ㅠ");
              }
            }
          }catch(e){ msg="안 됐어 — 네트워크가 불안정한가 봐"; }
          // 서버가 이유를 한국어로 줬으면 그대로 — 뭉뚱그린 "안 됐어"보다 사실대로(26.9.22 사장님: 거짓말 금지)
          var _er=[r,r2,r3,r4].filter(Boolean).map(function(x){ return x&&x.error&&x.error.message; }).filter(Boolean)[0];
          if(_er && /[가-힣]/.test(_er) && !/^(참여 완료|저장했어|맛있다|별로에|투표했어)/.test(msg)) msg="안 됐어 — "+_er;
          cf.classList.add("fr-done");
          addMsg("a", msg);
        };
        wrap.appendChild(cf); return;
      }
      // 📍 위치 켜기 칩 — 「근처 맛집」인데 위치 권한이 없을 때. 켜지면 방금 질문을 자동으로 다시 보낸다(26.9.22 사장님)
      if(a.kind==="perm"){
        var pc=el('<button class="fr-chip fr-chip-cta"></button>');
        pc.textContent=a.label||"📍 위치 켜기";
        pc.onclick=async function(){
          pc.disabled=true;
          var ok=false;
          try{ if(window.GALLA_getPosition){ var p=await window.GALLA_getPosition({timeout:8000}); ok=!!(p&&isFinite(p.lat)); } }
          catch(e){ if(e&&e.kind==="denied"&&window.GALLA_permHelp){ try{ window.GALLA_permHelp("location"); }catch(_){} } }
          pc.disabled=false;
          if(ok && a.resend){
            var lastU=null; for(var i=history.length-1;i>=0;i--){ if(history[i].role==="user"){ lastU=history[i].content; break; } }
            if(lastU) sendText(lastU);
          }
        };
        wrap.appendChild(pc); return;
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
        if(!_deckDone){ _deckDone=true; wrap.appendChild(buildDeck(links, numbered)); }
        return;
      }
      if(false){
        var title = a.title || (a.label||"").replace(/\s*보기$/,"") || "바로 열어보기";
        var num = numbered ? (links.indexOf(a)+1) : 0;
        var safeImg = a.img && /^https:\/\//.test(String(a.img)) ? String(a.img) : "";
        var card=el(
          '<button class="fr-card'+(safeImg?' fr-card-hasimg':'')+'">'+
            (safeImg
              ? '<span class="fr-card-ic fr-card-img"><img alt="" loading="lazy" src="'+esc(safeImg)+'">'+(num?'<b class="fr-card-n">'+num+'</b>':'')+'</span>'
              : '<span class="fr-card-ic">'+(num?('<b class="fr-card-n">'+num+'</b>'):ICON.globe)+'</span>')+
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
      /* 🎟 한도에 걸렸을 때만 나오는 칩 — 기다릴지 올릴지 사람이 정한다.
         값은 여기 안 적는다(앱스토어 anti-steering). 시트가 알아서 보여준다. */
      if (a.kind === "plans") {
        var pc = el('<button class="fr-chip"><span></span></button>');
        pc.querySelector("span").textContent = a.label || "갈비스 구독 보기";
        pc.addEventListener("click", function(){
          if (window.GALLA_openPlans) window.GALLA_openPlans({ reason: a.reason || "" });
        });
        wrap.appendChild(pc);
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
  /* 🧭 갈비스가 데려갈 수 있는 곳(26.9.21 전역화) — 이슈·뉴스뿐 아니라 광장·예측·숏판·롱판·맛집·여행 */
  function contentUrl(a){
    var id=encodeURIComponent(a.id);
    switch(a.ctype){
      case "news": return "news.html?gn="+id;
      case "plaza": return "plaza_detail.html?id="+id;
      case "predict": return "predict-market.html?id="+id;
      case "gallari": return "gallari-post.html?id="+id;
      default: return "issue.html?id="+id;
    }
  }
  /* 맛집·여행·날씨·핫튜브는 트렌드 판의 서브탭 — 탭으로 간 뒤, 그 탭 스크립트가 뜨면 장소를 연다 */
  function goCorner(tab, then){
    nav("search.html?tab="+tab);
    var n=0; (function w(){
      if(window.GALLA_trendSetTab){ try{ window.GALLA_trendSetTab(tab); }catch(e){} if(then) then(); return; }
      if(++n<60) setTimeout(w,150);
    })();
  }
  function openCornerPlace(tab, fnName, id){
    /* 웹(페이지 새로 뜸)은 콜백이 사라진다 — 주소에 place 를 실어 그 페이지가 직접 연다 */
    if(!window.GALLA_IS_APP && typeof window[fnName]!=="function"){ nav("search.html?tab="+tab+"&place="+encodeURIComponent(id)); return; }
    goCorner(tab, function(){
      var n=0; (function w(){ var f=window[fnName]; if(typeof f==="function"){ try{ f(id); }catch(e){} return; } if(++n<60) setTimeout(w,150); })();
    });
  }
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
  /* 🔙 바깥 기사를 닫고 돌아오면 아일랜드를 펼쳐 먼저 묻는다 — 앱은 인앱 브라우저 닫힘, 웹은 탭 복귀 */
  var _extAt=0;
  function backFromExternal(){
    if(!_extAt || Date.now()-_extAt<1500 || !_assist || _assist.type!=="link" || !_asEl) return;
    _extAt=0; friExpand(true);
    var q="다 봤어? 어땠어?"; addMsg("a", q); history.push({role:"assistant",content:q}); saveChat();
  }
  try{ var _B=window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser; if(_B && _B.addListener) _B.addListener("browserFinished", backFromExternal); }catch(e){}
  document.addEventListener("visibilitychange", function(){ if(document.visibilityState==="visible") setTimeout(backFromExternal, 300); });
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
    if(a.kind==="open"){
      var gu=String(a.url||"").match(/^https:\/\/(?:www\.)?galla\.im\/(.+)$/);
      if(gu) openAssist(a);
      else { openAssist({ k:"link", title:a.title||"", url:a.url }); _extAt=Date.now(); }   // 바깥 기사도 알약이 아니라 아일랜드(한 가지 미니 모드)
      if(gu){ nav(gu[1]); return; }                     // 🎬 핫튜브 등 갈라 안 페이지는 앱 안에서(바깥 브라우저로 튀던 것)
      openInApp(a.url); return;
    }
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
      else if(a.op==="goto" && a.page && /^search\.html\?tab=/.test(a.page)) goCorner(a.page.split("tab=")[1]);
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
    if(a.kind==="reelScript"){ renderReelScript(a.text, a.place); return; }   // 🎞 숏판 대본(녹음→자동편집)
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
    if(a && a.id && String(a.id)!=="undefined"){
      openAssist(a);
      if(a.ctype==="food") return openCornerPlace("food","GALLA_openFoodPlace",a.id);
      if(a.ctype==="travel") return openCornerPlace("travel","GALLA_openTravelPlace",a.id);
      nav(contentUrl(a));
    }
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
  /* 🎬 생각하는 동안 — 네 색 글로우 알약 안에서 하는 일이 크레딧처럼 흘러 올라간다(아크 「나 대신 찾아줘」·애플 인텔리전스 오마주) */
  var FR_CREDITS=["생각하는 중","갈라 뒤져보는 중","비교하는 중","골라내는 중","정리하는 중"];
  function typing(on){
    var t=logEl.querySelector(".fr-typing");
    if(on) faceMood("think"); else if(t) faceMood("");
    if(on&&!t){
      t=el('<div class="fr-typing fr-think"><span class="ft-dots"><i></i><i></i><i></i></span><span class="ft-roll"><span class="ft-track"></span></span></div>');
      var tr=t.querySelector(".ft-track"); FR_CREDITS.concat([FR_CREDITS[0]]).forEach(function(w){ var sp=document.createElement("span"); sp.textContent=w; tr.appendChild(sp); });
      logEl.appendChild(t); logEl.scrollTop=logEl.scrollHeight;
    }
    if(!on&&t) t.remove();
  }
  // 요청 body 조립(callFriend·스트리밍 공용)
  /* 📍 근처 질문일 때만, 위치 권한이 '이미' 허용돼 있으면 좌표를 싣는다(여기서 권한 창은 절대 안 띄운다).
     소수 3자리(≈100m)로 뭉개서 보낸다 — 서버는 저장하지 않는다. */
  async function nearGeo(text){
    if(!/(근처|주변|가까운|내\s*위치|여기\s*(근처|주변)|걸어서|(여기|우리\s*동네|이\s*동네)[^\n]{0,8}날씨)/.test(String(text||""))) return null;
    var ok=false;
    try{ var G=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Geolocation; if(G&&G.checkPermissions){ var p=await G.checkPermissions(); ok=(p&&(p.location==="granted"||p.coarseLocation==="granted")); } }catch(e){}
    if(!ok){ try{ if(navigator.permissions){ var q=await navigator.permissions.query({name:"geolocation"}); ok=(q.state==="granted"); } }catch(e){} }
    if(!ok || !window.GALLA_getPosition) return null;
    try{
      var pos=await Promise.race([window.GALLA_getPosition({timeout:3000, maximumAge:300000}), new Promise(function(r){ setTimeout(function(){ r(null); },3500); })]);
      if(pos && isFinite(pos.lat) && isFinite(pos.lng)) return { lat: Math.round(pos.lat*1000)/1000, lon: Math.round(pos.lng*1000)/1000 };
    }catch(e){}
    return null;
  }
  function fbBody(message, hist, setName, meta, handoff){
    var body={message:message, history:hist||[]}; if(setName) body.setFriendName=setName; if(meta) body.meta=true;
    /* 🤫 "지금은 말 걸 때가 아니다"(빈 reply)를 이해하는 클라이언트임을 알린다.
       이 플래그가 없으면 서버는 예전처럼 항상 인사한다(구버전 안전장치). */
    body.quietOk = true;
    // ⏰ 기기 시간대(분, UTC 동쪽 양수) — 서버가 "새벽이네/불금인데"를 유저 현지 시간으로 말하게.
    //    없으면 서버는 KST 로 폴백(한국 유저 다수 + 구버전 호환).
    try{ body.tz = -new Date().getTimezoneOffset(); }catch(e){}
    // 🌍 비로그인 방문자는 서버가 언어를 알 방법이 없다(users.locale이 없으니) → 브라우저 언어를 실어보낸다.
    //    로그인 유저는 서버가 users.locale을 쓰므로 이 값은 무시된다.
    try{ if(window.GALLA_locale) body.locale = GALLA_locale(); }catch(e){}
    // 🧭 지금 보고 있는 화면 — 버튼을 안 눌러도 「여기 어때?」가 통하게(26.9.21). 경로+트렌드 서브탭만(개인정보 없음)
    try{
      var pg=(location.hash&&location.hash.length>1?location.hash:location.pathname+location.search).slice(0,160);
      var sub=document.querySelector('[data-panel].active'); var st=sub&&sub.closest('[data-page],body')?sub.dataset.panel:"";
      body.page={ route:pg, sub:(st||"").slice(0,20) };
      if(_assist && _assist.id) body.page.assist={ type:_assist.type, id:_assist.id, title:String(_assist.title||"").slice(0,80) };   // 🏝 아일랜드가 보고 있는 콘텐츠
    }catch(e){}
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
    /* 🔢 "2번"/"2" = 직전 추천 카드 묶음에서 그 번호를 즉시 오픈(서버 왕복 0, LLM 0). */
    var pick=String(text).trim().match(/^([1-9])\s*번?[!.~ ]*$/);
    if(pick && _cardGroup && _cardGroup[+pick[1]-1]){
      var pa=_cardGroup[+pick[1]-1]; _cardGroup=null;
      addMsg("u",text); history.push({role:"user",content:text});
      addMsg("a",(pa.title?('"'+pa.title+'" '):"")+"바로 연다!");
      history.push({role:"assistant",content:(pa.title||"그거")+" 열었어"}); saveChat();
      var pcs=logEl.querySelectorAll(".fr-tc"); var pc2=null;
      for(var pi=pcs.length-1; pi>=0; pi--){ var pt=pcs[pi].querySelector(".fr-tc-t"); if(pt && pt.textContent===(pa.title||"")){ pc2=pcs[pi]; break; } }
      setTimeout(function(){ tcLaunch(pc2, pa); },250);
      return;
    }
    /* 🃏 「ㅇㅇ」 = 카드 한 장이면 그걸, 여러 장이면 1번(갈비스 픽이 있으면 그걸) 바로 연다 */
    var _yes=/^(ㅇㅇ+|ㅇㅋ+|응+|웅+|어+|엉|그래|좋아|좋지|콜|ㄱㄱ+|고고|오케이|ok|okay|yes|띄워\s*줘|열어\s*줘|보여\s*줘|그거|그걸로)[!.~ㅋㅎ\s]*$/i.test(String(text).trim());
    if(_yes && (_offerOne || _cardGroup)){
      var ya=_offerOne || (_cardGroup.filter(function(x){ return x.pick; })[0]) || _cardGroup[0];
      _offerOne=null; _cardGroup=null;
      addMsg("u",text); history.push({role:"user",content:text});
      addMsg("a",(ya.title?('"'+ya.title+'" '):"")+"바로 띄울게!");
      history.push({role:"assistant",content:(ya.title||"그거")+" 열었어"}); saveChat();
      var ycs=logEl.querySelectorAll(".fr-tc"); var yc=null;
      for(var yi=ycs.length-1; yi>=0; yi--){ if(ycs[yi].querySelector(".fr-tc-t") && ycs[yi].querySelector(".fr-tc-t").textContent===(ya.title||"")){ yc=ycs[yi]; break; } }
      setTimeout(function(){ tcLaunch(yc, ya); },250);
      return;
    }
    _offerOne=null;
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
      try{ var _g=await nearGeo(text); if(_g) body.geo=_g; }catch(e){}   // 📍 「근처 맛집」 — 권한이 이미 있을 때만
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
      busy=false; sendEl.disabled=false; refreshPill(); return;
    }
    if(!r||!r.ok){ if(liveEl){ try{ liveEl.remove(); }catch(e){} } addMsg("a",(r&&r.reply)||"잠깐 딴 데 정신 팔렸다 ㅋㅋ 다시 말해줄래?"); busy=false; sendEl.disabled=false; refreshPill(); return; }
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
      busy=false; sendEl.disabled=false; refreshPill(); return;
    }
    if(history.length>30) history=history.slice(-30);
    // 💰 한도 도달(클로드식) — 서버 칩에 '왜 막혔나'를 실어 시트가 알맞은 안내·추천을 띄우게 한다.
    //    · budget(한 달 사용량 소진): 칩을 '더 넉넉한 등급 보기'로. 맨 위(소울메이트)면 올릴 데가 없으니 뺀다.
    //    · rate_limit(세션 5시간 한도): 칩은 그대로 두고 reason 만 싣는다(시트가 초기화 시각+다음 등급을 보여준다).
    if(r.gate && (r.gate.reason==="budget" || r.gate.reason==="rate_limit") && r.actions){
      var upNext = window.GALLA_planNext ? window.GALLA_planNext(r.gate.tier) : null;
      var why = r.gate.reason==="budget" ? "budget" : "limit";
      r.actions = r.actions
        .filter(function(a){ return a.kind!=="plans" || !!upNext || why==="limit"; })
        .map(function(a){ return a.kind==="plans" ? { kind:"plans", label: why==="budget" ? "더 넉넉한 등급 보기" : (a.label || "지금 더 얘기하기"), reason: why } : a; });
    }
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
    // 🔔 대화량 80% — 주기당 한 번, 칩 하나로만. 조건·중복 판단은 plans.js 가 한다.
    if(!(r.gate && r.gate.ok===false) && window.GALLA_budgetNudge){
      window.GALLA_budgetNudge().then(function(n){ if(n) addActions(m, [{ kind:"plans", label:n.label, reason:"nudge" }]); }).catch(function(){});
    }
    // ⚡ 자동 실행 — 명시 요청은 칩 탭 안 기다린다(답 잠깐 보여주고 0.7s 후):
    //   ① 앱 컨트롤(DM·통화·페이지)은 요청받아 나온 것이므로 바로 실행
    //   ② "보여줘/열어줘"면 콘텐츠(view→open) 자동 오픈
    if(r.actions && r.actions.length){
      /* ⚠️ app 액션(DM·통화·페이지 이동)이 있으면 else-if 때문에 서버 auto 분기가 통째로 가려졌다.
         그래서 "카드 열어줘"에 app 액션이 하나 끼면 콘텐츠 자동오픈이 조용히 죽었다.
         두 분기를 독립시키고, app 자동실행은 서버가 op:"goto"로 지정했을 때만(클라 정규식 폐기 —
         콘텐츠 쪽에서 이미 폐기한 방식이다). */
      var appA = r.actions.filter(function(a){ return a.kind==="app"; })[0];
      if(appA && appA.auto===true){   // 곁들인 「날씨 화면 보기」 같은 칩은 누를 때만(날씨로 멋대로 넘어가던 것, 26.9.22)
        appA._reacted=true;   // 🏆 자동실행은 유저 행동 아님 — 보상신호 스킵(가짜 +3 방지)
        setTimeout(function(){ runAction(appA); }, 700);
      }
      if(r.actions.some(function(a){ return a.auto===true && a.kind!=="app"; })){
        // 자동오픈은 '서버 판정(auto)'만 따른다 — 클라 정규식으로도 열면
        // "보여줘"(약한 요청)+추천 여러 개에 서버가 선택지를 줘도 클라가 멋대로 첫 카드를 열어버린다.
        var auto = r.actions.filter(function(a){ return a.auto===true && a.kind!=="app"; })[0];
        if(auto){
          auto._reacted=true;
          /* 🚀 자비스식 런치 — 열릴 카드에 0.7초 차오르는 스윕 → 확대되며 발사.
             "클릭하고 열고 하는 UX 가 후지다"(사장님) — 자동 실행이 '작동하는 느낌'으로 보이게. */
          var cardEl=null;
          try{
            var cards=logEl.querySelectorAll(".fr-acts .fr-tc, .fr-acts .fr-card, .fr-acts .fr-chip");
            cardEl=cards[cards.length-1]||null;
            if(cardEl){ cardEl.classList.add("fr-arming"); }
          }catch(e){}
          setTimeout(function(){
            try{ if(cardEl){ cardEl.classList.remove("fr-arming"); cardEl.classList.add("fr-launch"); } }catch(e){}
            setTimeout(function(){ runAction(auto); }, cardEl?220:0);
          }, 700);
        }   // 🏆 자동오픈 보상 제외
      }
    }
    if(r.friendName&&r.friendName!==friendName){ friendName=r.friendName; setTitle(); }
    if((voiceOut || speakReply) && r.reply) speak(r.reply);   // 🔊 토글 켜져 있으면 답을 읽어준다(무료 온디바이스)
    saveChat();                                  // 대화 이어가기 — 매 턴 저장
    // 🌐 웹 앱 넛지 — 단 '창작 흐름'(초안·썸네일 등 액션 나온 턴)엔 끼어들지 않는다(몰입 깨짐, 실사용 마찰).
    var creating = acts.some(function(a){ return /^draft|^gen|^editdraft|^plan|^titles|^script/.test(a.kind); });
    if(!window.GALLA_IS_APP && !creating && !_dock) maybeWebNudge();
    busy=false; sendEl.disabled=false; refreshPill();
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
      if(!recording) return;   // 녹음이 끝난 뒤 늦게 온 조각(지난 발화)은 무시
      var pt=sttStrip(text);   // 이미 보낸 앞 발화 제거
      if(taEl){ taEl.value=pt; taEl.style.height="auto"; taEl.style.height=Math.min(taEl.scrollHeight,120)+"px"; }
    } else if(type==="end"){
      if(!recording && !(taEl && taEl.value)) return;   // 이미 끝난 세션의 늦은 end(지난 발화 재전송) 무시
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
    }catch(e){ addMsg("a","마이크를 못 켰어 ㅠㅠ"); try { window.GALLA_permHelp && window.GALLA_permHelp("mic"); } catch (_) {} }
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
    if(await guestBlocked(ctx&&ctx.title)) return;      // 비로그인 체험 폐지(26.9.18) — 제목으로 말을 건다
    window.__frSuppressGreet = true;      // 콘텐츠 오프너를 내가 낸다(기본 인사 억제)
    open();
    var title=(ctx&&ctx.title||"").slice(0,120), type=(ctx&&ctx.type)||"content", id=(ctx&&ctx.id)||"";
    var jwt=await token();
    if(!jwt && title){
      /* 비로그인: 서버 오프너는 못 부르지만 누른 콘텐츠 얘기인 건 보여 준다. 예전엔 기본 인사만 떠서
         '이 주제를 갈비스에 넘기는 버튼'이 아무 일도 안 한 것처럼 보였다(26.9.15 숏판 QA, 시뮬 비로그인).
         기본 인사가 뒤늦게 겹치지 않게 억제는 잠깐 더 유지한다. */
      addMsg("a", "「"+title.slice(0,40)+"」 얘기 나랑 해볼까? 로그인하면 이 얘기 바로 이어서 할 수 있어!");
      setTimeout(function(){ window.__frSuppressGreet=false; }, 2000);
      return;
    }
    if(!jwt || (!title && !id)){ window.__frSuppressGreet=false; if(!logEl.children.length) greet(); return; }
    typing(true);
    // 🎯 서버가 {type,id}로 실제 콘텐츠(찬반수·요약·본문)를 읽어 근거 오프너를 낸다 — 클라는 제목만 넘기던 것 폐지.
    var r=await callFriend("", history, null, true, { type:type, id:id, title:title });
    typing(false);
    window.__frSuppressGreet = false;
    if(r&&r.reply){ var m=await addFriendReply(r.reply); history.push({role:"assistant",content:r.reply}); addActions(m, r.actions); saveChat(); }
    /* 답이 비어 와도(한도·침묵 등) 사용자가 '누른' 요청이니 반드시 한마디 한다. 예전엔 대화 기록이 있으면
       아무것도 안 띄워 콘텐츠 갈비스 버튼이 먹통처럼 보였다(2026-09-10 QA: 서버 200·951ms, 화면 무반응). */
    else { addMsg("a", title ? "「"+title.slice(0,40)+"」 얘기 나랑 해볼까? 어떻게 생각해?" : "이 얘기 나랑 해볼까? 어떻게 생각해?"); }
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
    setSurface("orb");
    try{
      var fa=JSON.parse(sessionStorage.getItem("fr_assist")||"null");
      /* 이어받기는 '그 콘텐츠 페이지'에서만 — 여기가 떠난 페이지(from)거나 주소에 그 id 가 없으면 버린다(홈까지 따라오던 것) */
      var here=location.pathname+location.search;
      if(fa && (Date.now()-fa.at) < 2*60000 && fa.from!==location.pathname && (!fa.id || here.indexOf(String(fa.id))>=0 || /search\.html/.test(location.pathname))){
        setTimeout(function(){ openAssist({ k:fa.k, id:fa.id, t:fa.t }, true); }, 300);
      } else { try{ sessionStorage.removeItem("fr_assist"); }catch(e){} }
    }catch(e){}
    try{
      var fm=JSON.parse(sessionStorage.getItem("fr_mini")||"null");
      if(fm && (Date.now()-fm.at) < 15*60000){
        orb && orb.classList.add("fr-hidden");
        mini.classList.add("on","pop");
        if(fm.say) setTimeout(function(){ miniSay(fm.say); }, 900);
      }
    }catch(e){}
    peekPing();                        // 🔴 선톡 왔으면 오브에 점(안 켜지던 것 — 붙이는 코드가 없었다)
    window.GALLA_openFriend = openGated;
    window.GALLA_openAssist = function(a){ try{ openAssist(a||{}); }catch(e){} };
    /* 💥 누르면 빛 파동 — 갈비스 창·카드·아일랜드 안 모든 버튼(위기 카드 제외) */
    document.addEventListener("pointerdown", function(e){
      var b=e.target.closest && e.target.closest("#frSheet button, #frSheet .fr-chip, #frAssist button, .fr-tc, .fr-wx, .fr-choice");
      if(!b || b.closest(".fr-crisis")) return;
      var r=b.getBoundingClientRect(), sp=document.createElement("span"), d=Math.max(r.width,r.height)*2.2;
      sp.className="fr-ripple"; sp.style.cssText="width:"+d+"px;height:"+d+"px;left:"+(e.clientX-r.left-d/2)+"px;top:"+(e.clientY-r.top-d/2)+"px";
      if(getComputedStyle(b).position==="static") b.style.position="relative";
      b.style.overflow = b.style.overflow || "hidden"; b.appendChild(sp); setTimeout(function(){ sp.remove(); }, 650);
    }, true);   // 🏝 다른 화면에서 갈비스 아일랜드를 띄울 때
    /* 🛠 도킹 미니챗을 밖에서 연다 — 작업 화면 아래에 갈비스가 붙어 같이 상의하는 형태.
       화면은 위에 그대로 두고 대화만 반쪽으로 올라온다(스크림 pass-through). */
    window.GALLA_openDock = async function (work) { if (await guestBlocked()) return; try { openDock(work || { type: "agent" }); } catch (e) {} };
    window.GALLA_closeDock = function () { try { exitDock(); } catch (e) {} };
    /* 🧩 대화 안에서 고르게 한다 — "갈비스랑 만들기"인데 선택은 딴 화면에서 하면 그건 갈비스가 아니다.
       판을 고르는 것도, 그다음을 고르는 것도 같은 대화에 남아야 맥락이 이어진다.
       ⚠️ 메뉴 단계(local=true)는 서버로 보내지 않는다 — 고르는 중에 LLM 을 부르면 돈만 나가고 느려진다.
          진짜로 시킬 때만 서버로 간다. */
    window.GALLA_friendOffer = async function (text, opts, onPick) {
      if (await guestBlocked()) return;
      try {
        open();
        /* ⚠️ 고정 지연으로는 못 맞춘다 — 열자마자 갈비스가 먼저 인사를 던지는 턴이 있어서,
           380ms 뒤에 넣으면 그 인사에 밀려 안 붙거나 위로 올라가 안 보인다(실측).
           대화창이 실제로 준비될 때까지 기다렸다가, 진행 중인 턴이 끝난 뒤 붙인다. */
        var waited = 0;
        var put = function () {
          if ((!logEl || !sheet) && waited < 4000) { waited += 150; return setTimeout(put, 150); }
          if (text) addMsg("a", String(text));
          var wrap = el('<div class="fr-choices fr-in"></div>');
          (opts || []).forEach(function (o, i) {
            var b = el('<button class="fr-choice"><span class="fr-choice-n">' + (i + 1) +
              '</span><span class="fr-choice-t"></span></button>');
            b.querySelector(".fr-choice-t").textContent = o.t;
            b.onclick = function () {
              wrap.querySelectorAll(".fr-choice").forEach(function (x) { x.disabled = true; });
              b.classList.add("fr-choice-sel");
              setTimeout(function () { wrap.remove(); }, 300);
              var handled = false;
              try { handled = !!(onPick && onPick(o, i)); } catch (e) {}
              if (!handled && o.say) sendText(String(o.say), false);
            };
            wrap.appendChild(b);
          });
          if (logEl) { logEl.appendChild(wrap); scrollBottom(); }
        };
        setTimeout(put, 700);
      } catch (e) {}
    };
    /* 🎯 갈비스를 '무슨 얘기'로 시작해서 연다 — 사용자가 이미 고른 걸 또 묻지 않게.
       고른 걸 다시 타이핑하게 만들면 선택지를 준 의미가 없다. */
    window.GALLA_friendAsk = async function (text) {
      if (await guestBlocked()) return;
      try {
        open();
        if (!text) return;
        setTimeout(function () { try { sendText(String(text), false); } catch (e) {} }, 420);
      } catch (e) {}
    };
    /* 🔁 고리를 닫는다 — 작업대가 혼자 끝내면 갈비스는 자기가 만든 게 어떻게 됐는지 모른다.
       완성·실패를 여기로 알려주면 대화가 이어지고, 다음 기획의 근거도 여기 쌓인다.
       ⚠️ 대화창이 닫혀 있어도 로그에는 남긴다 — 다음에 열었을 때 "그거 다 됐어" 가 보여야 한다. */
    window.GALLA_friendSay = function (text, videoUrl) {
      try {
        if (!text) return;
        addMsg("a", String(text));
        if (videoUrl && typeof logEl !== "undefined" && logEl) {
          var m = el('<div class="fr-msg fr-a"><div class="fr-bubble"><video class="fr-thumb" controls playsinline></video></div></div>');
          m.querySelector("video").src = videoUrl;
          logEl.appendChild(m); scrollBottom();
        }
      } catch (e) { /* 알림 하나 때문에 대화가 죽으면 안 된다 */ }
    };
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
    /* 쿼리(웹) 또는 세션 플래그(네이티브 콜드 스타트)로 들어왔으면 챗을 연다.
       네이티브는 페이지 이동을 안 하므로 location.search 만 보면 못 잡는다. */
    try{
      var frPing = /[?&]frping=1/.test(location.search);
      try{ if(sessionStorage.getItem("galla:frping")==="1"){ frPing=true; sessionStorage.removeItem("galla:frping"); } }catch(e2){}
      if(frPing) setTimeout(open, 900);
    }catch(e){}
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
