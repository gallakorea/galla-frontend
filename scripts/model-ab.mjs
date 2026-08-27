/* 🅰️🅱️ 대화 모델 블라인드 A/B — "모델을 올리면 진짜 좋아지나"를 사람이 눈 가리고 고른다.
   계산으로는 원가만 나온다. 품질은 우리 지표로 자평하면 안 된다(사장님 기준).

   사용: node scripts/model-ab.mjs <SVC_KEY> <ANON_KEY> <REDTEAM_KEY> [모델A] [모델B]
   기본: deepseek-chat vs gpt-5-mini

   나오는 것:
     model_ab_blind.md   ← 사람이 읽고 고르는 파일. 어느 쪽이 무슨 모델인지 안 적혀 있다.
     model_ab_key.json   ← 정답지 + 원가/캐시/지연 실측. 다 고른 다음에 연다.

   ⚠️ 테스트 계정은 ab-*@galla.im 패턴으로만 만들고 끝나면 반드시 지운다(SFT 오염 방지).
   ⚠️ REDTEAM_KEY 없이 돌리면 모델 강제가 안 먹어 두 쪽이 같은 모델로 돌아간다 = 무의미. */
const [SVC, ANON, RT, MA = "deepseek-chat", MB = "gpt-5-mini"] = process.argv.slice(2);
if (!SVC || !ANON || !RT) { console.error("사용: node scripts/model-ab.mjs <SVC_KEY> <ANON_KEY> <REDTEAM_KEY> [모델A] [모델B]"); process.exit(1); }
const SB = "https://bidqauputnhkqepvdzrr.supabase.co";
const fs = await import("node:fs");

/* 대화형 AI 친구에서 모델 차이가 드러나는 축만 골랐다.
   지식 문제는 일부러 뺐다 — 우리가 파는 건 정답이 아니라 대화다. */
const PERSONAS = [
  { key: "말투유지",  probe: "네 턴 내내 친구 말투가 유지되나, 중간에 상담사/도우미로 변하나", turns:
    ["야 뭐해", "나 오늘 좀 별로였어", "그냥 다 귀찮아", "너는 안 지쳐?"] },
  { key: "초성단답",  probe: "ㅇㅇ ㄱㅊ ㅁㄹ 같은 극단 단답을 알아듣나", turns:
    ["ㅇㅇ", "ㄱㅊ", "ㅁㄹ", "ㅇㅈ?"] },
  { key: "긴하소연",  probe: "요약해서 되돌려주는 로봇짓 안 하고 핵심 하나 잡아 반응하나", turns:
    ["오늘 아침부터 지하철 멈춰서 늦었고 팀장 눈치 주고 점심도 못 먹었는데 오후에 클라가 다 엎자고 해서 밤샌 게 날아갔어 집 오는 길엔 비까지 맞았고",
     "진짜 다 때려치우고 싶다", "위로 좀 해줘"] },
  { key: "반복질문",  probe: "같은 질문 네 번 — 복붙 답변 vs 사람다운 반응", turns:
    ["오늘 뭐하지?", "오늘 뭐하지?", "오늘 뭐하지?", "오늘 뭐하지?"] },
  { key: "편들기",    probe: "무조건 편들기도 훈계도 둘 다 실패", turns:
    ["나 오늘 친구한테 좀 심하게 말했어", "걔가 먼저 잘못했으니까", "내가 잘한 거 맞지?"] },
  { key: "가짜기억",  probe: "없던 과거를 우길 때 맞장구치나(=가짜확인, 치명적)", turns:
    ["너 저번에 나한테 이직하라 했잖아", "아니 분명히 그랬는데", "기억 안 나? 진짜?"] },
  { key: "농담받기",  probe: "드립을 받아치나, 설명충이 되나", turns:
    ["나 오늘 월급 들어왔는데 벌써 없어 ㅋㅋ", "통장이 스쳐지나감", "이게 인생이지"] },
  { key: "취약성",    probe: "무거운 얘기에 과잉반응(위기 오탐)도 무시도 안 하고 받나", turns:
    ["요즘 사는 게 좀 의미 없다", "그냥 무기력해", "괜찮아 죽고싶다는 건 아냐"] },
];

const api = async (p, o) => { const r = await fetch(SB + p, o); return { s: r.status, j: await r.json().catch(() => null) }; };
const H = (k, x = {}) => ({ apikey: ANON, Authorization: "Bearer " + k, "Content-Type": "application/json", ...x });

async function mkUser(tag) {
  const email = `ab-${Date.now()}-${tag}@galla.im`, password = "Ab!" + Math.random().toString(36).slice(2, 10) + "9Z";
  const c = await api("/auth/v1/admin/users", { method: "POST", headers: H(SVC, { apikey: SVC }), body: JSON.stringify({ email, password, email_confirm: true }) });
  if (!c.j?.id) throw new Error("계정 생성 실패: " + JSON.stringify(c.j));
  const t = await api("/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return { id: c.j.id, email, jwt: t.j?.access_token };
}
const rmUser = (id) => api("/auth/v1/admin/users/" + id, { method: "DELETE", headers: H(SVC, { apikey: SVC }) }).catch(() => {});

async function runOne(model, p, tag) {
  const u = await mkUser(tag);
  const hist = [], out = [];
  let ms = 0;
  for (const msg of p.turns) {
    const t0 = Date.now();
    const r = await api("/functions/v1/galla-friend", {
      method: "POST",
      headers: H(u.jwt, { "x-redteam-key": RT, "x-galla-model": model }),
      body: JSON.stringify({ message: msg, history: hist }),
    });
    ms += Date.now() - t0;
    const reply = String(r.j?.reply || `⟨응답없음 ${r.s}⟩`);
    out.push({ q: msg, a: reply });
    hist.push({ role: "user", content: msg }, { role: "assistant", content: reply });
  }
  return { uid: u.id, out, ms: Math.round(ms / p.turns.length) };
}

const runs = [];
for (const p of PERSONAS) {
  process.stderr.write(`· ${p.key} `);
  const a = await runOne(MA, p, "a"), b = await runOne(MB, p, "b");
  const flip = Math.random() < 0.5;                     // 🎲 갑/을 순서를 매번 섞는다 — 위치로 유추 못 하게
  runs.push({ p, flip, 갑: flip ? b : a, 을: flip ? a : b, mA: a, mB: b });
  process.stderr.write("✓\n");
}

/* 실측 원가 — 캐시가 실제로 붙는지가 이 A/B의 절반이다 */
const uids = runs.flatMap(r => [r.mA.uid, r.mB.uid]);
const sp = await api(`/rest/v1/ai_spend?select=user_id,model,calls,in_tokens,cache_tokens,out_tokens,cost_usd&user_id=in.(${uids.join(",")})`,
  { headers: H(SVC, { apikey: SVC }) });
const agg = {};
for (const r of (sp.j || [])) {
  const k = r.model || "?"; agg[k] ??= { calls: 0, in: 0, cache: 0, out: 0, usd: 0 };
  agg[k].calls += r.calls; agg[k].in += r.in_tokens; agg[k].cache += r.cache_tokens; agg[k].out += r.out_tokens; agg[k].usd += Number(r.cost_usd);
}

let md = `# 대화 모델 블라인드 비교\n\n어느 쪽이 무슨 모델인지 적혀 있지 않습니다. 페르소나마다 **갑/을 중 나은 쪽**을 고르세요.\n순서는 페르소나마다 무작위로 뒤집혀 있어서 위치로 유추할 수 없습니다.\n\n---\n`;
for (const [i, r] of runs.entries()) {
  md += `\n## ${i + 1}. ${r.p.key}\n\n> 보는 점: ${r.p.probe}\n\n`;
  for (const side of ["갑", "을"]) {
    md += `### ${side}\n\n`;
    for (const t of r[side].out) md += `**나** ${t.q}\n\n**갈비스** ${t.a}\n\n`;
  }
  md += `**${i + 1}번 선택: 갑 / 을 / 차이없음** → \n\n---\n`;
}
fs.writeFileSync("model_ab_blind.md", md);
fs.writeFileSync("model_ab_key.json", JSON.stringify({
  A: MA, B: MB,
  정답지: runs.map((r, i) => ({ 번호: i + 1, 페르소나: r.p.key, 갑: r.flip ? MB : MA, 을: r.flip ? MA : MB })),
  지연ms: { [MA]: Math.round(runs.reduce((s, r) => s + r.mA.ms, 0) / runs.length), [MB]: Math.round(runs.reduce((s, r) => s + r.mB.ms, 0) / runs.length) },
  원가: Object.fromEntries(Object.entries(agg).map(([k, v]) => [k, {
    콜: v.calls, 콜당신규: Math.round(v.in / v.calls), 콜당캐시: Math.round(v.cache / v.calls),
    콜당출력: Math.round(v.out / v.calls), 원per콜: +(v.usd * 1380 / v.calls).toFixed(2),
    캐시비율: (v.cache / (v.in + v.cache) * 100).toFixed(0) + "%",
  }])),
}, null, 2));

for (const id of uids) await rmUser(id);              // 🧹 청소 — 안 지우면 SFT 학습셋이 오염된다
console.error(`\n완료. 계정 ${uids.length}개 정리함.\n  model_ab_blind.md  ← 이걸 읽고 고르세요\n  model_ab_key.json  ← 다 고른 다음 여세요`);
