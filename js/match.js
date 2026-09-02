/* ============================================================
   갈라 궁합(/match) — 12문항 → 16유형 → 친구와 '같은 편일 확률'
   ⚠️ 인라인 <script> 금지: SPA 뷰 로더가 script[src] 만 걷어간다.
   ============================================================ */
(function () {
  "use strict";

  function init(givenParams) {

  /* ══════════════════════════════════════════════════════════════
     유형 표 — ⚠️ functions/share/[[path]].js 의 MATCH_TYPES 와 반드시 동기화할 것.
     키 = 온도(H열혈/C냉정) + 스타일(A공격/D수비) + 신념(P확신/E균형) + 대세(M추종/U역행)
     ══════════════════════════════════════════════════════════════ */
  var TYPES = {
    HAPM: { em: "📣", name: "광화문 확성기", line: "옳다고 믿는 쪽에 서서 제일 크게 소리치는 사람",
            desc: "대세가 옳다고 판단되면 망설임이 없습니다. 남들이 눈치 볼 때 제일 먼저 깃발을 들고, 제일 큰 목소리로 상대 진영을 두들깁니다. 여론이 당신 편일 때 가장 강하지만, 여론이 뒤집히면 가장 크게 흔들립니다." },
    HAPU: { em: "💥", name: "혼자 싸우는 반란군", line: "전부가 반대해도 혼자 돌격하는 사람",
            desc: "다수가 무섭지 않습니다. 오히려 다수라서 의심합니다. 혼자여도 확신만 있으면 그대로 밀고 들어가고, 그 모습에 사람들이 뒤늦게 따라붙습니다. 대신 아무도 안 따라오면 혼자 다 뒤집어씁니다." },
    HAEM: { em: "🎪", name: "판 키우는 흥행사", line: "누가 이기든 상관없다, 판이 커지면 그만",
            desc: "옳고 그름보다 재미와 열기가 먼저입니다. 조용한 논쟁에 기름을 붓고, 양쪽을 다 자극해서 판을 키웁니다. 정작 본인은 어느 편에도 완전히 갇히지 않습니다. 사람은 몰리는데 미움도 같이 몰립니다." },
    HAEU: { em: "🃏", name: "청개구리 트롤러",  line: "분위기가 한쪽으로 쏠리는 순간 반대편에 서는 사람",
            desc: "만장일치를 못 견딥니다. 모두가 '당연하지'라고 할 때 손을 들고 '그런가?'를 던집니다. 진심으로 반대해서가 아니라 쏠림 자체가 위험하다고 보기 때문입니다. 덕분에 논의는 깊어지고, 당신은 자주 오해받습니다." },
    HDPM: { em: "🛡️", name: "우리 편 방패",     line: "내 편이 맞으면 몸으로 막는 사람",
            desc: "먼저 때리진 않습니다. 대신 우리 편이 맞고 있으면 반드시 앞에 섭니다. 논리보다 의리가 먼저 움직이고, 그래서 같은 편에겐 세상 든든하고 상대 편에겐 답답합니다." },
    HDPU: { em: "⛰️", name: "고집불통 요새",     line: "세상이 다 바뀌어도 자리를 안 옮기는 사람",
            desc: "유행도 여론도 당신을 못 움직입니다. 한번 정한 자리에서 버티고, 시간이 지나 사람들이 돌아왔을 때 여전히 거기 있습니다. 옳을 땐 존경받고, 틀렸을 땐 아무도 못 말립니다." },
    HDEM: { em: "🤝", name: "열혈 중재자",       line: "싸움판에 뛰어들어 말리는 사람",
            desc: "논쟁을 피하지 않습니다. 다만 이기려고 들어가는 게 아니라 정리하려고 들어갑니다. 양쪽 말을 다 듣고 뜨겁게 조율합니다. 그러다 양쪽에서 다 욕먹는 날도 있습니다." },
    HDEU: { em: "🕊️", name: "소수의견 변호인",   line: "지고 있는 쪽에 자동으로 마음이 가는 사람",
            desc: "다수가 옳아 보여도 밀리는 쪽 이야기를 끝까지 듣습니다. 이기려는 게 아니라 남겨두려는 겁니다. 세상이 놓친 말을 자주 주워오지만, 매번 소수라 자주 피곤합니다." },
    CAPM: { em: "🎯", name: "냉혈 저격수",       line: "감정 없이 급소만 정확히 찌르는 사람",
            desc: "흥분하지 않습니다. 상대가 뜨거워질수록 더 차가워지고, 말이 길어질 때까지 기다렸다가 딱 한 문장으로 끝냅니다. 그 한 문장이 캡처돼 돌아다닙니다." },
    CAPU: { em: "🐍", name: "여론 암살자",       line: "대세를 조용히 무너뜨리는 사람",
            desc: "정면으로 붙지 않습니다. 모두가 믿는 전제를 조용히 흔들어 밑동부터 무너뜨립니다. 사람들은 언제 판이 뒤집혔는지도 모릅니다. 무섭다는 말을 자주 듣습니다." },
    CAEM: { em: "📊", name: "팩트 폭격기",       line: "감정 대신 근거를 쏟아붓는 사람",
            desc: "편을 먼저 정하지 않습니다. 자료를 먼저 봅니다. 그래서 어제 편들던 쪽을 오늘 두들기기도 합니다. 논쟁을 정리하는 데 최고지만, 사람들은 가끔 당신을 차갑다고 합니다." },
    CAEU: { em: "🔬", name: "악마의 변호인",     line: "이긴 쪽 논리를 끝까지 해부하는 사람",
            desc: "결론이 난 뒤에 진짜 일을 시작합니다. 승자의 논리에서 구멍을 찾아내 조용히 내밉니다. 밉지만 필요하고, 필요하지만 밉습니다." },
    CDPM: { em: "🧊", name: "침착한 방패",       line: "흔들리지 않고 자기 자리를 지키는 사람",
            desc: "도발에 반응하지 않습니다. 감정을 태우지 않고 근거만 다져둔 채 그대로 서 있습니다. 상대는 혼자 지쳐 떨어집니다." },
    CDPU: { em: "🗿", name: "침묵의 바위",       line: "말은 안 하지만 절대 안 바뀌는 사람",
            desc: "굳이 설득하려 들지 않습니다. 논쟁을 지켜보고, 속으로 이미 결론을 냈고, 그 결론은 안 바뀝니다. 아무도 당신 생각을 모르지만 아무도 당신을 못 움직입니다." },
    CDEM: { em: "🧘", name: "강 건너 불구경",     line: "싸움을 구경하되 절대 안 들어가는 사람",
            desc: "누가 맞는지 대충 알지만 굳이 말하지 않습니다. 감정 소모가 세상에서 제일 아깝습니다. 덕분에 적이 없고, 대신 아무도 당신을 자기 편이라 생각하지 않습니다." },
    CDEU: { em: "👻", name: "관전만 하는 유령",   line: "다 보고 다 알지만 흔적을 안 남기는 사람",
            desc: "스크롤은 끝까지 내리고 좋아요는 안 누릅니다. 유행도 대세도 남 일이고, 판단은 이미 끝났지만 공개하지 않습니다. 존재감 0, 정보량 100." }
  };

  /* 4축 정의: [키, 왼쪽폴, 오른쪽폴, 왼쪽라벨, 오른쪽라벨] */
  var AXES = [
    { key: "temp",  a: "H", b: "C", la: "🔥 열혈", lb: "🧊 냉정", name: "논쟁 온도" },
    { key: "style", a: "A", b: "D", la: "⚔️ 공격", lb: "🛡️ 수비", name: "전투 스타일" },
    { key: "faith", a: "P", b: "E", la: "🎯 확신", lb: "⚖️ 균형", name: "신념 강도" },
    { key: "tide",  a: "M", b: "U", la: "🌊 대세", lb: "🦅 역행", name: "여론 관계" }
  ];

  /* 문항 — 축당 3개, 가중치 [40,34,26] 이라 점수가 0·26·34·40·60·66·74·100 로 갈린다.
     생활 논쟁 위주로 고른다(정치 편식은 시딩 금지사항이자 확산에 독). */
  var W = [40, 34, 26];
  var QS = [
    { ax: 0, w: 0, q: "단톡방에서 누가 명백히 틀린 소리를 했다.", a: "지금 바로 잡는다", b: "그냥 둔다. 내 인생 아님" },
    { ax: 1, w: 0, q: "논쟁이 붙으면 내가 제일 먼저 하는 일은?", a: "상대 논리의 구멍부터 찾는다", b: "내 근거부터 다져둔다" },
    { ax: 2, w: 0, q: "\"둘 다 일리 있다\"는 말을 들었다.", a: "그건 그냥 회피다", b: "대부분은 실제로 그렇다" },
    { ax: 3, w: 0, q: "투표하려는데 이미 찬성 82%다.", a: "역시 찬성이 맞구나", b: "…뭔가 수상한데?" },
    { ax: 0, w: 1, q: "댓글창에서 나를 저격한 글을 발견했다.", a: "손이 먼저 나간다", b: "캡처만 해두고 닫는다" },
    { ax: 1, w: 1, q: "우리 편이 밀리고 있다.", a: "상대 진영으로 쳐들어간다", b: "우리 편 글에 힘을 보탠다" },
    { ax: 2, w: 1, q: "내 의견이 소수라는 걸 알게 됐다.", a: "그래도 내가 맞다", b: "다시 한번 생각해본다" },
    { ax: 3, w: 1, q: "모두가 극찬하는 작품이 있다.", a: "이유가 있겠지, 일단 본다", b: "과대평가부터 의심한다" },
    { ax: 0, w: 2, q: "논쟁 중인 내 상태는?", a: "심장이 뛴다. 솔직히 재밌다", b: "피곤하다. 결론만 말해라" },
    { ax: 1, w: 2, q: "말싸움은 언제 끝나는가?", a: "내가 이겨야 끝난다", b: "안 지면 그걸로 됐다" },
    { ax: 2, w: 2, q: "세상 대부분의 논쟁은 결국?", a: "옳고 그름이 분명히 있다", b: "그냥 입장 차이일 뿐이다" },
    { ax: 3, w: 2, q: "요즘 유행하는 말투와 밈, 나는?", a: "일단 써본다", b: "유행이라서 안 쓴다" }
  ];

  /* ── 궁합 등급 ── */
  var TIERS = [
    { min: 85, key: "soul",  ttl: "한 몸 같은 전우",   grad: "linear-gradient(150deg,#1b3a6b,#0d1b33)",
      sub: "같은 판을 보면 같은 편에 섭니다. 편들어줄 사람이 필요하면 이 사람을 부르세요. 대신 둘 다 틀렸을 때 말려줄 사람이 없습니다." },
    { min: 70, key: "ally",  ttl: "든든한 아군",       grad: "linear-gradient(150deg,#1d3d55,#0d1a26)",
      sub: "대체로 같은 편입니다. 세부에선 갈리지만 큰 싸움에선 등을 맡길 수 있습니다. 가장 오래 가는 조합입니다." },
    { min: 52, key: "half",  ttl: "애매한 동맹",       grad: "linear-gradient(150deg,#3a3560,#161428)",
      sub: "같은 편일 때도 있고 아닐 때도 있습니다. 주제 하나만 잘못 걸리면 그날 저녁이 통째로 날아갑니다." },
    { min: 34, key: "ice",   ttl: "살얼음판",          grad: "linear-gradient(150deg,#5c3a2a,#241512)",
      sub: "웬만하면 안 건드리는 게 좋습니다. 평소엔 멀쩡한데 한 문장에서 시작해 끝을 봅니다. 술자리 주제 선정에 각별히 주의하세요." },
    { min: 0,  key: "enemy", ttl: "철천지 원수",       grad: "linear-gradient(150deg,#6b1e2c,#280b12)",
      sub: "구조적으로 같은 편이 될 수 없습니다. 세상 거의 모든 논쟁에서 반대편에 섭니다. 이 조합은 화해가 아니라 휴전이 답입니다." }
  ];

  /* 축별 충돌 코멘트 — 같은 축이라도 '둘 다 왼쪽'과 '둘 다 오른쪽'은 전혀 다른 관계다.
     sameA=둘 다 왼쪽 폴, sameB=둘 다 오른쪽 폴, diff=갈림 */
  var CLASH = [
    { u: "🔥",
      sameA: "둘 다 열혈입니다. 붙으면 같이 타오릅니다. 신나게 싸우고 신나게 화해하지만, 주변 사람이 피곤합니다.",
      sameB: "둘 다 냉정합니다. 애초에 크게 안 붙습니다. 조용하고 편한 대신, 서로 속마음은 끝까지 모릅니다.",
      diff: "한쪽은 불붙었는데 한쪽은 이미 식었습니다. \"왜 그렇게까지 해\" vs \"왜 아무 말도 안 해\"가 반복됩니다." },
    { u: "⚔️",
      sameA: "둘 다 공격형입니다. 대화가 곧 전면전입니다. 한 번 시작하면 누가 이겼는지도 모른 채 끝납니다.",
      sameB: "둘 다 수비형입니다. 아무도 먼저 안 꺼내서 겉으론 평온한데, 안 꺼낸 게 계속 쌓입니다.",
      diff: "한쪽이 찌르고 한쪽이 막습니다. 의외로 이 조합이 제일 오래 갑니다. 균형이 맞거든요." },
    { u: "🎯",
      sameA: "둘 다 확신형입니다. 같은 편일 땐 세상 무적이고, 갈리는 순간 아무도 안 물러섭니다.",
      sameB: "둘 다 균형형입니다. 서로 존중하다가 결론이 안 납니다. 뭐 먹을지도 30분 걸립니다.",
      diff: "한쪽은 결론을 냈고 한쪽은 아직 열어뒀습니다. 한쪽은 답답하고 한쪽은 숨 막힙니다." },
    { u: "🌊",
      sameA: "둘 다 대세를 믿습니다. 같은 뉴스에 같이 고개를 끄덕입니다. 편하지만 둘 다 놓치는 게 생깁니다.",
      sameB: "둘 다 대세를 의심합니다. 세상이 다 맞다고 해도 둘이서 \"진짜?\"를 합니다. 세상에 맞서는 2인조.",
      diff: "한쪽은 대세를 믿고 한쪽은 대세를 의심합니다. 같은 뉴스를 보고 정반대 결론이 나옵니다. 궁합을 가장 크게 깎는 축입니다." }
  ];

  /* ══════════════ 인코딩 — 결과를 URL에 담는다(서버 저장 0) ══════════════
     code = B62[유형index] + B62[온도] + B62[스타일] + B62[신념] + B62[대세] + base64url(닉)
     점수는 0..100 을 0..61 로 눌러 1글자씩. 오차 ±1%p 는 표시에 영향 없다. */
  var B62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  var KEYS = Object.keys(TYPES);

  function b64u(s) {
    var bin = new TextEncoder().encode(s), t = "";
    for (var i = 0; i < bin.length; i++) t += String.fromCharCode(bin[i]);
    return btoa(t).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64u(s) {
    try {
      var t = s.replace(/-/g, "+").replace(/_/g, "/");
      while (t.length % 4) t += "=";
      var bin = atob(t), arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(arr);
    } catch (e) { return ""; }
  }
  function encode(res) {
    var s = B62[Math.max(0, KEYS.indexOf(res.key))];
    for (var i = 0; i < 4; i++) s += B62[Math.round(res.scores[i] * 0.61)];
    return s + (res.nick ? b64u(res.nick.slice(0, 8)) : "");
  }
  function decode(code) {
    if (!code || code.length < 5) return null;
    var key = KEYS[B62.indexOf(code[0])];
    if (!key) return null;
    var scores = [];
    for (var i = 1; i <= 4; i++) {
      var v = B62.indexOf(code[i]);
      if (v < 0) return null;
      scores.push(Math.round(v / 0.61));
    }
    return { key: key, scores: scores, nick: code.length > 5 ? unb64u(code.slice(5)).slice(0, 8) : "" };
  }

  /* ══════════════ 계산 ══════════════ */
  function computeResult(answers, nick) {
    var scores = [0, 0, 0, 0]; // 각 축의 '왼쪽 폴' 점수 0..100
    for (var i = 0; i < QS.length; i++) {
      if (answers[i] === 0) scores[QS[i].ax] += W[QS[i].w];
    }
    var key = "";
    for (var a = 0; a < 4; a++) key += scores[a] >= 50 ? AXES[a].a : AXES[a].b;
    return { key: key, scores: scores, nick: nick || "" };
  }

  /* 궁합: 축별 거리에 가중 감점 + 조합 특수 감점.
     대세(축4)가 가장 크게 갈린다 — 같은 뉴스로 정반대 결론이 나오는 축이라서. */
  function compat(x, y) {
    var d = [0, 1, 2, 3].map(function (i) { return Math.abs(x.scores[i] - y.scores[i]); });
    var pen = d[0] * 0.30 + d[1] * 0.10 + d[2] * 0.16 + d[3] * 0.36;
    if (x.scores[1] > 60 && y.scores[1] > 60) pen += 14;               // 공격형 둘 → 전면전
    if (x.scores[2] > 60 && y.scores[2] > 60 && d[3] > 40) pen += 12;  // 확신 둘 + 대세관 반대 → 화해 불가
    if (x.scores[0] < 40 && y.scores[0] < 40) pen -= 6;                // 둘 다 냉정 → 애초에 안 싸움
    var v = Math.round(100 - pen);
    return Math.max(3, Math.min(99, v));
  }
  function tierOf(p) {
    for (var i = 0; i < TIERS.length; i++) if (p >= TIERS[i].min) return TIERS[i];
    return TIERS[TIERS.length - 1];
  }
  /* 상성: 축 3개 이상 같으면 천생연분, 3개 이상 반대면 원수 */
  function bestWorst(key) {
    var best = null, worst = null, bs = -1, ws = 999;
    KEYS.forEach(function (k) {
      var same = 0;
      for (var i = 0; i < 4; i++) if (k[i] === key[i]) same++;
      if (k === key) return;
      if (same > bs) { bs = same; best = k; }
      if (same < ws) { ws = same; worst = k; }
    });
    return { best: best, worst: worst };
  }

  /* ══════════════ 카드 렌더 (절차적 문장 — AI 생성 없음, 비용 0) ══════════════ */
  function drawCard(cv, res) {
    var g = cv.getContext("2d"), W0 = cv.width, H0 = cv.height;
    var t = TYPES[res.key], s = res.scores;
    var hot = s[0] >= 50;
    var c1 = hot ? "#ff5a6e" : "#4d8dff", c2 = hot ? "#ff9d3d" : "#6ff0ff";

    g.clearRect(0, 0, W0, H0);
    var bg = g.createLinearGradient(0, 0, W0, H0);
    bg.addColorStop(0, "#0e0f15"); bg.addColorStop(1, "#07070a");
    g.fillStyle = bg; g.fillRect(0, 0, W0, H0);

    // 후광
    var halo = g.createRadialGradient(W0 / 2, 470, 20, W0 / 2, 470, 520);
    halo.addColorStop(0, hot ? "rgba(255,90,110,.30)" : "rgba(77,141,255,.30)");
    halo.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = halo; g.fillRect(0, 0, W0, 1000);

    // 격자
    g.strokeStyle = "rgba(255,255,255,.035)"; g.lineWidth = 1;
    for (var x = 0; x < W0; x += 60) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H0); g.stroke(); }
    for (var y = 0; y < H0; y += 60) { g.beginPath(); g.moveTo(0, y); g.lineTo(W0, y); g.stroke(); }

    // 상단 라벨
    g.textAlign = "center";
    g.fillStyle = "rgba(255,255,255,.42)";
    g.font = "800 30px -apple-system,'Apple SD Gothic Neo',sans-serif";
    g.fillText("G A L L A   궁 합", W0 / 2, 92);

    /* ── 문장(crest): 4축이 형태를 결정한다 ── */
    var cx = W0 / 2, cy = 470, R = 240;
    var spikes = 6 + Math.round(s[1] / 12);           // 공격 → 가시 수
    var sharp = 0.16 + (s[1] / 100) * 0.34;           // 공격 → 가시 길이
    g.save();
    g.translate(cx, cy);
    var rg = g.createLinearGradient(-R, -R, R, R);
    rg.addColorStop(0, c1); rg.addColorStop(1, c2);
    g.beginPath();
    for (var i = 0; i < spikes * 2; i++) {
      var ang = (Math.PI / spikes) * i - Math.PI / 2;
      var rr = i % 2 ? R * (1 - sharp) : R;
      g[i ? "lineTo" : "moveTo"](Math.cos(ang) * rr, Math.sin(ang) * rr);
    }
    g.closePath();
    g.fillStyle = "rgba(255,255,255,.035)"; g.fill();
    g.strokeStyle = rg; g.lineWidth = 7; g.stroke();

    // 신념: 확신=두꺼운 단일 링 / 균형=얇은 이중 링
    g.strokeStyle = rg;
    if (s[2] >= 50) { g.lineWidth = 14; g.beginPath(); g.arc(0, 0, R * 0.66, 0, Math.PI * 2); g.stroke(); }
    else {
      g.lineWidth = 4;
      [0.72, 0.58].forEach(function (k) { g.beginPath(); g.arc(0, 0, R * k, 0, Math.PI * 2); g.stroke(); });
    }
    // 대세: 추종=꽉 찬 원 / 역행=역방향 화살촉 링
    if (s[3] >= 50) {
      g.beginPath(); g.arc(0, 0, R * 0.4, 0, Math.PI * 2);
      g.fillStyle = "rgba(255,255,255,.09)"; g.fill();
    } else {
      /* 이모지(반지름 ≈95px)를 파고들지 않도록 0.6R~0.46R 구간에만 그린다 */
      g.lineWidth = 6;
      for (var k = 0; k < 8; k++) {
        var a0 = (Math.PI / 4) * k;
        g.beginPath();
        g.moveTo(Math.cos(a0) * R * 0.6, Math.sin(a0) * R * 0.6);
        g.lineTo(Math.cos(a0 + 0.26) * R * 0.46, Math.sin(a0 + 0.26) * R * 0.46);
        g.stroke();
      }
    }
    // 온도: 열혈=이글거리는 외곽 점 / 냉정=정적인 얇은 외곽선
    g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,.16)";
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, Math.PI * 2); g.stroke();
    if (hot) {
      g.fillStyle = c2;
      for (var d = 0; d < 12; d++) {
        var ad = (Math.PI / 6) * d;
        g.beginPath(); g.arc(Math.cos(ad) * R * 1.1, Math.sin(ad) * R * 1.1, 6, 0, Math.PI * 2); g.fill();
      }
    }
    g.restore();

    // 이모지
    g.font = "190px -apple-system,'Apple Color Emoji',sans-serif";
    g.textBaseline = "middle";
    g.fillText(t.em, cx, cy + 8);
    g.textBaseline = "alphabetic";

    // 이름/한줄
    g.fillStyle = "#ffffff";
    g.font = "900 76px -apple-system,'Apple SD Gothic Neo',sans-serif";
    g.fillText(t.name, cx, 836);
    g.fillStyle = "rgba(255,255,255,.55)";
    g.font = "800 32px -apple-system,'Apple SD Gothic Neo',sans-serif";
    wrap(g, t.line, cx, 894, 900, 44);

    // 코드 배지
    g.fillStyle = c1;
    g.font = "900 30px ui-monospace,Menlo,monospace";
    g.fillText(res.key, cx, 962);

    // 게이지 4개
    var gy = 1024;
    for (var a = 0; a < 4; a++) {
      var ax = AXES[a], v = s[a];
      g.textAlign = "left";
      g.fillStyle = v >= 50 ? "#fff" : "rgba(255,255,255,.4)";
      g.font = "800 25px -apple-system,'Apple SD Gothic Neo',sans-serif";
      g.fillText(ax.la, 96, gy - 14);
      g.textAlign = "right";
      g.fillStyle = v < 50 ? "#fff" : "rgba(255,255,255,.4)";
      g.fillText(ax.lb, W0 - 96, gy - 14);
      g.fillStyle = "rgba(255,255,255,.09)";
      rrect(g, 96, gy, W0 - 192, 12, 6); g.fill();
      var bw = Math.max(14, (W0 - 192) * (v / 100));
      var bgr = g.createLinearGradient(96, 0, 96 + bw, 0);
      bgr.addColorStop(0, c1); bgr.addColorStop(1, c2);
      g.fillStyle = bgr; rrect(g, 96, gy, bw, 12, 6); g.fill();
      gy += 68;
    }

    // 하단 닉 + 도메인
    g.textAlign = "center";
    if (res.nick) {
      g.fillStyle = "rgba(255,255,255,.8)";
      g.font = "900 34px -apple-system,'Apple SD Gothic Neo',sans-serif";
      g.fillText(res.nick + " 님의 갈라 유형", cx, 1300);
    } else {
      g.fillStyle = "rgba(255,255,255,.34)";
      g.font = "800 30px -apple-system,'Apple SD Gothic Neo',sans-serif";
      g.fillText("galla.im — 여론이 에너지가 되는 곳", cx, 1300);
    }
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function wrap(g, text, x, y, max, lh) {
    var words = String(text).split(" "), line = "", lines = [];
    words.forEach(function (w) {
      var test = line ? line + " " + w : w;
      if (g.measureText(test).width > max && line) { lines.push(line); line = w; }
      else line = test;
    });
    if (line) lines.push(line);
    lines.forEach(function (l, i) { g.fillText(l, x, y + i * lh); });
  }

  /* ══════════════ 화면 ══════════════ */
  var $ = function (id) { return document.getElementById(id); };
  var params = (function () {
    if (givenParams) {
      var sp = new URLSearchParams();
      Object.keys(givenParams).forEach(function (k) { sp.set(k, givenParams[k]); });
      return sp;
    }
    return new URLSearchParams(location.search);
  })();
  /* 초대코드 캡처 — 이 페이지는 js/supabase.js 부트스트랩을 안 태우므로 직접 저장한다.
     (형식·키·중단조건은 js/supabase.js 와 동일. 실제 적용은 첫 로그인 세션에서 일어난다.) */
  try {
    var rp = params.get("ref");
    if (rp && /^[A-Z0-9]{4,12}$/i.test(rp) && !localStorage.getItem("galla_ref_done")) {
      localStorage.setItem("galla_ref", rp.toUpperCase());
    }
  } catch (e) { /* 사파리 프라이빗 모드 등 — 캡처 실패해도 테스트는 돌아가야 한다 */ }

  var oppo = decode(params.get("vs") || "");
  var view = decode(params.get("r") || "");
  var answers = [], qi = 0, me = null;

  function scene(id) {
    ["sIntro", "sQuiz", "sResult", "sVs"].forEach(function (s) { $(s).classList.toggle("on", s === id); });
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    var t = $("toast"); t.textContent = msg; t.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("on"); }, 1900);
  }
  /* 초대코드·utm 은 갈라로 넘어갈 때까지 유지한다(공유 크레딧 유실 방지). */
  function keep(dest) {
    var sp = new URLSearchParams();
    ["ref", "utm_source", "utm_medium", "utm_campaign"].forEach(function (k) {
      var v = params.get(k); if (v) sp.set(k, v);
    });
    var q = sp.toString();
    return q ? dest + (dest.indexOf("?") >= 0 ? "&" : "?") + q : dest;
  }

  /* ── 인트로 ── */
  if (oppo) {
    var ot = TYPES[oppo.key];
    $("chal").hidden = false;
    $("chalT").textContent = (oppo.nick ? oppo.nick + "님" : "친구") + "이 궁합 도전장을 보냈습니다";
    $("chalS").textContent = "상대 유형: " + ot.em + " " + ot.name + " — 테스트를 마치면 둘의 '같은 편일 확률'이 바로 계산됩니다.";
  }
  if (view && !oppo) {
    // 남의 결과 카드 보기 → 나도 하기(=그 사람과 궁합)
    showResult(view, true);
  }

  $("goStart").onclick = function () { qi = 0; answers = []; scene("sQuiz"); renderQ(); };

  /* ── 퀴즈 ── */
  function renderQ() {
    var q = QS[qi];
    $("qbar").style.width = (qi / QS.length * 100) + "%";
    $("qnum").textContent = "Q" + (qi + 1) + " / " + QS.length;
    $("qaxis").textContent = AXES[q.ax].name;
    $("qtag").textContent = AXES[q.ax].la + "  ·  " + AXES[q.ax].lb;
    $("qtext").textContent = q.q;
    var opts = document.querySelectorAll(".opt");
    opts[0].querySelector("span").textContent = q.a;
    opts[1].querySelector("span").textContent = q.b;
    opts.forEach(function (o) { o.classList.remove("hit"); });
    $("qback").style.visibility = qi ? "visible" : "hidden";
  }
  document.querySelectorAll(".opt").forEach(function (btn) {
    btn.onclick = function () {
      btn.classList.add("hit");
      answers[qi] = Number(btn.dataset.i);
      setTimeout(function () {
        if (qi < QS.length - 1) { qi++; renderQ(); }
        else finish();
      }, 165);
    };
  });
  $("qback").onclick = function () { if (qi) { qi--; renderQ(); } };

  function finish() {
    $("qbar").style.width = "100%";
    me = computeResult(answers, "");
    if (oppo) showVs(me, oppo);
    else showResult(me, false);
  }

  /* ── 내 결과 ── */
  function showResult(res, isOther) {
    me = res;
    var t = TYPES[res.key];
    $("rWho").textContent = isOther
      ? (res.nick ? res.nick + "님의 갈라 유형" : "친구의 갈라 유형")
      : "당신의 갈라 유형";
    drawCard($("cvs"), res);
    $("rDesc").textContent = t.desc;
    var bw = bestWorst(res.key);
    $("rBest").textContent = TYPES[bw.best].em + " " + TYPES[bw.best].name;
    $("rWorst").textContent = TYPES[bw.worst].em + " " + TYPES[bw.worst].name;

    if (isOther) {
      $("plugT").textContent = "당신은 이 사람과 몇 % 같은 편일까?";
      $("goShare").textContent = "나도 테스트하고 궁합 보기";
      $("nick").parentElement.style.display = "none";
      $("goShare").onclick = function () {
        location.href = keep("/match?vs=" + encodeURIComponent(params.get("r")));
      };
    } else {
      $("goShare").onclick = doShare;
    }
    $("goGalla").href = keep("index.html");
    $("goFun").href = keep("/fun.html");
    scene("sResult");
  }

  $("goSave").onclick = function () {
    var cv = $("cvs");
    try {
      cv.toBlob(function (blob) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "galla-" + (me ? me.key : "type") + ".png";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast("결과 카드를 저장했습니다");
      }, "image/png");
    } catch (e) { toast("저장에 실패했습니다. 화면을 캡처해 주세요"); }
  };
  $("goAgain").onclick = function () { location.href = keep("/match.html"); };

  /* 공유 링크 = 초대 링크. 로그인 유저면 share-sheet.js 가 캐시해둔 본인 초대코드를 붙여
     궁합이 퍼질 때마다 초대 크레딧(+1,000 GP)이 붙게 한다. utm_source 로 GA 채널도 분리. */
  function buildShareUrl(res) {
    var o = location.origin;
    /* ⚠️ 네이티브 앱은 location.origin 이 capacitor:// 라 외부에서 안 열린다(공유링크 고질 버그).
       http(s)가 아니거나 갈라 도메인이 아니면 https://galla.im 으로 강제한다. */
    if (!/^https?:/.test(o) || !/(galla\.im|localhost|127\.0\.0\.1)/.test(location.hostname)) o = "https://galla.im";
    var myRef = "";
    try { myRef = localStorage.getItem("galla_my_ref") || ""; } catch (e) { myRef = ""; }
    var q = new URLSearchParams({ utm_source: "match" });
    if (myRef) q.set("ref", myRef);
    return o + "/share/match/" + encode(res) + "?" + q.toString();
  }
  function shareUrl() {
    var nick = ($("nick").value || "").trim().slice(0, 8);
    if (me) me.nick = nick;
    return buildShareUrl(me);
  }
  function doShare() {
    var url = shareUrl(), t = TYPES[me.key];
    var text = (me.nick ? me.nick + "님은 " : "나는 ") + t.em + " " + t.name +
               ". 너랑 나 같은 편일 확률 몇 %인지 확인해봐 👀";
    if (navigator.share) {
      navigator.share({ title: "갈라 궁합", text: text, url: url }).catch(function () {});
    } else {
      copy(url + "\n" + text);
    }
  }
  function copy(s) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(s).then(function () { toast("링크를 복사했습니다"); },
        function () { showLink(s); });
    } else {
      var ta = document.createElement("textarea");
      ta.value = s; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("링크를 복사했습니다"); }
      catch (e) { showLink(s); }
      ta.remove();
    }
  }
  /* 복사가 막혔을 때(권한 거부·구형 웹뷰·제스처 밖 호출) 예전엔 "주소창을 복사해 주세요" 라고 안내했다.
     그런데 **주소창엔 이 링크가 없다** — 공유 URL 은 /share/match/<결과> 인데 주소는 /match 그대로다.
     안내대로 하면 결과가 빠진 맨 링크가 나간다(2026-09-02 실측: 복사 실패 토스트 + 주소창 /match).
     → 링크 자체를 화면에 꺼내 보여주고 선택해 둔다. 길게 눌러 복사하면 된다. */
  function showLink(s) {
    var url = String(s).split("\n")[0];
    var box = $("linkfall");
    if (!box) {
      box = document.createElement("div");
      box.id = "linkfall";
      box.style.cssText = "margin:10px 0;display:flex;gap:6px;align-items:center";
      box.innerHTML = '<input readonly style="flex:1;min-width:0;font-size:13px;padding:9px 10px;' +
        'border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:inherit">';
      var anchor = $("nick");
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
      else document.body.appendChild(box);
    }
    var inp = box.querySelector("input");
    inp.value = url;
    try { inp.focus(); inp.select(); inp.setSelectionRange(0, url.length); } catch (e) {}
    toast("길게 눌러 링크를 복사해 주세요");
  }

  /* ── 궁합 결과 ── */
  function showVs(x, y) {
    var p = compat(x, y), tier = tierOf(p);
    var tx = TYPES[x.key], ty = TYPES[y.key];
    $("verdict").style.background = tier.grad;
    $("vPct").innerHTML = p + "<s>%</s>";
    $("vTtl").textContent = tier.ttl;
    $("vSub").textContent = tier.sub;
    $("vEmA").textContent = tx.em; $("vNmA").textContent = tx.name; $("vWhA").textContent = "나";
    $("vEmB").textContent = ty.em; $("vNmB").textContent = ty.name;
    $("vWhB").textContent = y.nick ? y.nick + "님" : "상대";

    var cl = $("clash"); cl.innerHTML = "";
    [0, 1, 2, 3].forEach(function (i) {
      var la = x.scores[i] >= 50, lb = y.scores[i] >= 50;
      var txt = la !== lb ? CLASH[i].diff : (la ? CLASH[i].sameA : CLASH[i].sameB);
      var d = document.createElement("div");
      d.className = "ci";
      d.innerHTML = '<u>' + CLASH[i].u + '</u><span><b>' + AXES[i].name + '</b> — ' + txt + '</span>';
      cl.appendChild(d);
    });

    $("vGalla").href = keep("index.html");
    $("vShare").onclick = function () {
      var url = buildShareUrl(x);
      var text = "우리 둘 같은 편일 확률 " + p + "% (" + tier.ttl + "). 너도 해봐 👀";
      if (navigator.share) navigator.share({ title: "갈라 궁합", text: text, url: url }).catch(function () {});
      else copy(url + "\n" + text);
    };
    $("vMine").onclick = function () { oppo = null; showResult(x, false); };
    scene("sVs");
  }

  }  /* init 끝 */

  /* SPA(네이티브 앱)는 js/spa/views/match.js 어댑터가 mount로 부른다.
     MPA(웹 단독 페이지)는 여기서 바로 1회 실행. */
  window.GALLA_PAGE_MATCH = { mount: init };
  if (!document.body || document.body.dataset.page !== "spa") init();
})();
