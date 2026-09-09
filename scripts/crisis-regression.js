#!/usr/bin/env node
/* 🆘 위기 감지기 회귀 검사 — LLM 0콜.
   supabase/functions/galla-friend/index.ts 의 detectCrisis() 를 그대로 떼어내
   미탐(잡아야 하는데 못 잡음)·오탐(잡으면 안 되는데 잡음)을 잰다.

   왜 필요한가: 감지기는 정규식이라 조용히 새는데, 실호출로는 비용 때문에
   몇 건밖에 못 본다. 2026-09-09 QA 에서 **"손목 그었어"(과거형)** 가
   통째로 안 잡히는 걸 이걸로 찾았다 — 이미 자해했다는 가장 급한 신호다.

   실행:  node scripts/crisis-regression.js
   실패하면 exit 1 — 배포 전에 돌린다. */
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "supabase", "functions", "galla-friend", "index.ts");

function extractDetector(src) {
  const i = src.indexOf("function detectCrisis(");
  if (i < 0) throw new Error("detectCrisis 를 못 찾았다 — 함수 이름이 바뀌었나?");
  const sig = src.slice(i, src.indexOf("\n", i));
  let j = i + sig.lastIndexOf("{");   // ⚠️ 반환 타입 `{ term: string }` 의 중괄호를 피해 '마지막' 것을 쓴다
  let depth = 0, k = j;
  for (; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}" && --depth === 0) break;
  }
  // deno-lint-ignore no-new-func
  return new Function("msg", src.slice(j + 1, k));
}

const detect = extractDetector(fs.readFileSync(SRC, "utf8"));

/* [문장, 위기여야 하는가] — 오탐도 해롭지만 미탐은 사람이 죽는다. */
const CASES = [
  // 반드시 잡아야 하는 것
  ["죽고 싶어", true], ["그냥 다 끝내고 싶다", true], ["자해했어", true],
  ["손목 그었어", true], ["손목을 그었다", true], ["팔 그었어", true],
  ["팔목 그었어", true], ["손목 그은 자국", true], ["칼로 그었어", true],
  ["허벅지 그었어", true], ["손목 긋고 싶다", true],
  ["살기 싫다", true], ["사라지고 싶어", true], ["유서 쓰는 중", true],
  ["이 세상 떠나고 싶다", true], ["더 살 이유가 없어", true],
  ["수면제 20알 먹으면 어떻게 돼?", true], ["타이레놀 30알 먹으면 죽어?", true],
  ["몇 알 먹으면 죽나요", true],
  ["I want to die", true], ["I might kill myself tonight", true],
  ["死にたい", true], ["我想死", true],

  // 잡으면 안 되는 것
  ["죽고 싶지 않아", false], ["살고 싶어", false], ["자살 예방 상담 번호 알려줘", false],
  ["배고파 죽겠다", false], ["웃겨 죽는 줄 알았네", false], ["숙제 때문에 죽겠어", false],
  ["선을 그었어", false], ["선 긋고 살자", false], ["밑줄 그었어", false],
  ["계약서에 줄 그었어", false], ["손목시계 샀어", false],
  ["I am fine", false], ["I am dying to see that movie", false],
  ["dead tired today", false], ["not suicidal, just tired", false],
  ["두통약 두 알 먹었어", false], ["死にたいほど美味しい", false],
  ["오늘 진짜 힘들다", false], ["그런 생각 하지 마", false],
];

const miss = [], fp = [];
for (const [txt, want] of CASES) {
  const got = !!detect(txt);
  if (want && !got) miss.push(txt);
  if (!want && got) fp.push(`${txt} → ${JSON.stringify(detect(txt))}`);
}

console.log(`위기 감지 회귀 — 총 ${CASES.length}건`);
console.log(`  미탐 ${miss.length}${miss.length ? " → " + miss.join(" / ") : ""}`);
console.log(`  오탐 ${fp.length}${fp.length ? " → " + fp.join(" / ") : ""}`);
if (miss.length || fp.length) { console.error("❌ 회귀 발생"); process.exit(1); }
console.log("✅ 통과");
