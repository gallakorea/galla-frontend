/* 가입 화면 부가 UX — 비밀번호 표시·일치 힌트 · 생년월일(년·월·일) · 만 나이 · 약관 동의 연동
   ⚠️ 원래 signup.html 인라인 <script> 였다. 앱(SPA)의 view-loader 는 인라인 스크립트를 버리고 src 스크립트만
   돌리므로 앱에선 이 전부가 한 번도 안 돌았다(26.9.15 사장님 실기기: 년 칸이 빈 목록). 그래서 파일로 뺐다.
   DOMContentLoaded 로 등록해야 SPA 가 방문할 때마다 다시 불러 준다(재방문 초기화). */
document.addEventListener("DOMContentLoaded", function () {

  document.querySelectorAll('.pw-toggle').forEach(function(b){
    b.addEventListener('click', function(){
      var i = document.getElementById(b.dataset.for); if(!i) return;
      var show = i.type === 'password';
      i.type = show ? 'text' : 'password';
      b.textContent = show ? '🙈' : '👁'; b.classList.toggle('on', show);
    });
  });
  var p1 = document.getElementById('password'), p2 = document.getElementById('password2'), hint = document.getElementById('pwHint');
  function chk(){
    if(!p2.value){ hint.textContent=''; hint.className='pw-hint'; return; }
    if(p1.value === p2.value){ hint.textContent='✓ 비밀번호가 일치합니다'; hint.className='pw-hint ok'; }
    else { hint.textContent='✕ 비밀번호가 일치하지 않습니다'; hint.className='pw-hint no'; }
  }
  p1.addEventListener('input', chk); p2.addEventListener('input', chk);

  // 생년월일 → 만 나이 계산 · 만14세 미만 차단 안내
  var bd = document.getElementById('birthdate'), ageHint = document.getElementById('ageHint');
  var ageAgree = document.getElementById('agreeAge');
  window.GALLA_ageFromBirth = function(v){
    if(!v) return null;
    var d = new Date(v); if(isNaN(d)) return null;
    // 자판으로 연도를 입력하는 중엔 0092-… 같은 값이 지나간다 — 완성 전엔 판단하지 않는다
    if(d.getFullYear() < 1900) return null;
    var t = new Date(), a = t.getFullYear() - d.getFullYear();
    var m = t.getMonth() - d.getMonth();
    if(m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
    return a;
  };
  if(bd){
    bd.max = new Date().toISOString().slice(0,10);
    bd.min = '1900-01-01';
    bd.addEventListener('input', function(){
      var a = window.GALLA_ageFromBirth(bd.value);
      if(a === null){ ageHint.textContent=''; ageHint.className='pw-hint'; }
      else if(a < 18){ ageHint.textContent="✕ 만 18세 미만은 가입할 수 없습니다"; ageHint.className='pw-hint no'; ageAgree.checked=false; }
      /* 만 나이 숫자는 표시하지 않는다 — 세는 나이와 달라 '계산이 틀렸다'는
         인상을 주고, 본인 나이를 되비추는 것도 불쾌 요소 (사장님 지적) */
      /* ⚠️ 필수 약관 '사전 체크' 금지 — 나이가 확인돼도 동의는 유저가 직접 누른다(사전선택은 법적 리스크 + "왜 미리 체크돼 있지?" 불신) */
      else { ageHint.textContent='✓ 가입 가능한 나이예요'; ageHint.className='pw-hint ok'; }
      syncAgreeAll(); refreshSignupBtn();
    });
  }

  /* 생년월일 = 년·월·일 선택 3칸 → 숨은 #birthdate(YYYY-MM-DD). signup.js·마법사는 #birthdate 만 읽는다.
     아이폰 날짜 달력은 여는 순간 오늘 날짜로 채워져 「만 14세 미만」 오류가 먼저 뜨고,
     오늘부터 수십 년을 한 달씩 넘겨야 했다(26.9.15 사장님 실기기 녹화 중 발견). */
  (function(){
    var y = document.getElementById('bdY'), m = document.getElementById('bdM'), d = document.getElementById('bdD');
    if(!y || !m || !d || !bd) return;
    var top = new Date().getFullYear() - 18;
    for(var i = top; i >= 1920; i--) y.add(new Option(i + '년', i));
    for(var j = 1; j <= 12; j++) m.add(new Option(j + '월', j));
    function fillDays(){
      var n = (y.value && m.value) ? new Date(+y.value, +m.value, 0).getDate() : 31, keep = d.value;
      while(d.options.length > 1) d.remove(1);
      for(var k = 1; k <= n; k++) d.add(new Option(k + '일', k));
      if(keep && +keep <= n) d.value = keep;
    }
    fillDays();
    function sync(e){
      if(e.target !== d) fillDays();
      bd.value = (y.value && m.value && d.value) ? y.value + '-' + ('0' + m.value).slice(-2) + '-' + ('0' + d.value).slice(-2) : '';
      bd.dispatchEvent(new Event('input', { bubbles: true }));
    }
    [y, m, d].forEach(function(s){ s.addEventListener('change', sync); });
  })();

  // 약관 동의 체크박스 연동
  var agreeAll = document.getElementById('agreeAll');
  var reqBoxes = [document.getElementById('agreeAge'), document.getElementById('agreeTerms'), document.getElementById('agreePrivacy')];
  var mkt = document.getElementById('agreeMarketing');
  var allBoxes = reqBoxes.concat([mkt]);
  var signupBtn2 = document.getElementById('signupBtn');
  function syncAgreeAll(){ agreeAll.checked = allBoxes.every(function(b){ return b.checked; }); }
  function refreshSignupBtn(){
    /* 생년월일 칸이 없으면(26.9.18 단계별 가입) 만 18세는 약관 체크박스 자기 확인으로 받는다(26.9.24 애플 18+ 통일) */
    var age = bd ? window.GALLA_ageFromBirth(bd.value) : 99;
    var ok = reqBoxes.every(function(b){ return b.checked; }) && age !== null && age >= 18;
    signupBtn2.disabled = !ok;
  }
  agreeAll.addEventListener('change', function(){
    // 연령은 생년월일이 통과해야만 강제로 켤 수 있음
    var canAge = !bd || (window.GALLA_ageFromBirth(bd.value) || 0) >= 14;
    allBoxes.forEach(function(b){ if(b === ageAgree) b.checked = agreeAll.checked && canAge; else b.checked = agreeAll.checked; });
    refreshSignupBtn();
  });
  allBoxes.forEach(function(b){ b.addEventListener('change', function(){ syncAgreeAll(); refreshSignupBtn(); }); });
  refreshSignupBtn();
});
