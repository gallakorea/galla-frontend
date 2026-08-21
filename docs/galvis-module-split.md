# 갈비스(galla-friend) 모듈 분리 설계안

대상: `supabase/functions/galla-friend/index.ts` (5,029줄 단일 파일)
작성: 2026-08-21 · 상태: **설계만, 실행 전**

## 0. 왜 지금 쪼개나

오늘 하루에 스코프 함정 사고가 두 번 났다.

1. **게스트/메인 이중 핸들러 사고** — `Deno.serve` 쪽에만 선언한 변수(`tzMin` 등)를 `guestTurn`에서 참조 → 배포 후 ReferenceError. (3354줄 주석: "게스트 경로와 별도 스코프라 여기도 선언")
2. **TDZ 사고** — `guestTurn` 안에서 `RTK_G` 선언을 첫 사용보다 아래에 둠 → 게스트 턴 통째 사망. (340줄 주석에 박제)

근본 원인은 두 가지다:
- **스코프가 파일 하나** — 5천 줄 안에 톱레벨 함수 40여 개 + 2개의 거대 핸들러 클로저가 섞여 있어, "이 변수가 여기서 보이나"를 사람이 추적한다.
- **배포가 타입체크를 안 한다** — Deno 배포(Supabase Edge)는 `deno check`를 강제하지 않아서, `Cannot find name` 급 오류가 런타임에야 터진다.

모듈 분리는 (a) 스코프를 파일 단위로 강제하고 (b) import가 명시돼 `deno check`가 의미 있는 게이트가 되게 만든다.

## 1. 현재 구조 실측 (라인 지도)

| 영역 | 라인 | 내용 |
|---|---|---|
| env/상수/클라이언트 | 1–71 | cors, DeepSeek/OpenAI env, 모델 5종, `supa`, STEP_LABEL/DOCK_TOOLS/ACTION_BRIEF |
| 브로드캐스트 | 72–80 | `broadcastStep` (frwork:uid 실시간 진행 라인) |
| 임베딩 | 82–117 | `embed`(Gemini→OpenAI 폴백), `vecLit` |
| 감정선 엔진 | 119–163 | `EMO_BASE`, `applyEmotion`(관성+감쇠), `emotionArc` |
| 게이트/예산/계측 | 164–337 | `aiBudgetOk`, `aiUserQuotaOk`, `aiGate`, `logSpend`, `turnStat`, `modelFor`, `localeCfg(Safe)`, `sha8`, `tzOf`, `gateReply`, `langDirective`, `jres` |
| **게스트 경로** | 338–401 | `guestTurn` — 자체 게이트·IP 한도·경량 프롬프트·`chatOnce` 1콜 |
| 콘텐츠 조회 | 403–902 | `pickDadJoke`, `fetchContentById`, `hotIssues/hotVideos/gallaNews/platformBuzz/contentRadar`, `getPatterns/genTitles/genScript/genReelScript`, 네이버 검색(`webSearch`, `fetchSource`), 시세(`quoteStock/quoteCoin/marketQuote`), `topicHistory`, `searchContent` |
| 도구 정의 | 903–953 | `TOOLS` 배열 (24개 함수 스키마, 순수 데이터) |
| 도구 실행 | 954–1318 | `myActivity`, 유료 이중호출 방어(`paidToolDup`), GC 과금(`chargeGC/needGCAction/refundGC`), **`runTool`** (270줄 스위치) |
| 시비 판정 | 1319–1358 | `HOSTILE_BLOCK`, `directedAttack`, `hostileNow` |
| 페르소나 | 1360–1881 | **`STATIC_PERSONA`**(약 340줄 프롬프트), `ageTxt`, `pickSessionGoal`, `backRefAsk`, **`dynamicCtx`**(지금 맥락 조립) |
| 출력 필터 | 1882–2081 | `redactPII`, `stripStage/Deflect/Mind/ForPreview`, `bubbleize`, `tempoCap`, `finalizeCompanion`, `hasText/countText`, `safeJson` |
| 스트리밍 LLM | 1970–2017 | `chatStream` (SSE, tool_choice:none 고정) |
| 저장(백그라운드) | 2083–2254 | `persistTurn`(관계·감정·기억·요약 트리거), `runPersist` |
| 신호 감지기 | 2255–2932 | `detectSelfDeprecation/Crisis/DataProbe/Dependency/Grief/ThirdPartyLookup/Bias/Illegal/GhostPast/FamilyVent/RiskyImpulse/Minor/Apology/SelfRecall/Invite/Jailbreak`, `isClosing/closingStreak/disengaging/questionStreak/disclosureRate/isHostile/hostileStreak`, `priceAsk/statAsk/koAmount/moneyValues/groundSet/collectVals/stripUngroundedMoney`, `deHonorific`, `stripDepDelight`, 후처리 정규식 다수(`joinBrokenBubbles`, `stripFakeToolCall`, `stripSilencer`, `fixOwnName`, `stripTherapist/UiTalk/MetaSelf/HostileOpener`, `stripMdMarks`, `unclosed`) |
| 의도 라우팅 | 2892–2965 | `INTENT_SEED`, `INTENT_ROUTE`, `semanticIntent`(임베딩), `routeIntent`(정규식) |
| LLM 단발 | 2967–3017 | `pruneOrphanToolCalls`, **`chatOnce`**(도구 필터링+logSpend) |
| 창작 파이프라인 | 3019–3188 | `exemplarPack`, `heavyModel`, `craftLLM`(딥시크/클로드 양다리), `craftPolish/craftPipeline`, `classifyCraft`(FSM 분류콜), `genPersona`, `personaCard` |
| 기억 생성 | 3190–3345 | `extractMemories`, `summarizeProfile`, `reflect`, `summarizeEpisode` |
| **메인 핸들러** | 3347–5029 | `Deno.serve`: 운영 op(backfill_embeds/seed_intents) → 게스트 분기 → op(tts/consume_ping/react/load) → 쿼터/게이트 → 관계·기억 로드 → 회상·금지주제 → 인사 각도 → 핸드오프/작업모드/소스 → 신호 감지 일괄 → 창작 FSM(planMode/route/`settleCraft`) → 시맨틱 폴백 → 블록 20여 개 조립 → messages → **스트림 경로(4501–4564)** / **툴 루프(4566–4608)** → 가짜생성·가짜열기·약속 가드 재시도(guard:* 7종, 4609–4930) → 유령칩 정리 → 폴백 → `settleCraft`+`runPersist` → 후처리 필터 체인 → 위기 카드 → guards 리포트 → json |

핵심 관찰:
- **순수 함수가 압도적으로 많다.** detect*/strip* 계열 약 60개는 DB·env 의존이 0이다. 가장 싸게 떼어낼 수 있고, 레드팀 배터리가 검증하는 것도 대부분 이 층이다.
- **양쪽 핸들러가 공유하는 것**: `chatOnce`, `STATIC_PERSONA`, `aiGate/gateReply`, `aiBudgetOk`, `modelFor`, `tzOf`, `sha8`, `langDirective`, `jres`. 이것들이 지금 "한 파일이니까 그냥 보이는" 상태 — 사고의 온상.
- **스트림/비스트림 이중 마무리**(4537줄 주석이 자백): 후처리 필터 체인이 두 곳(4540, 4973)에 복붙돼 있다. 분리 시 한 함수로 합쳐야 한다.

## 2. 목표 모듈 경계

Supabase Edge Functions는 함수 폴더 안 상대경로 import를 지원한다(배포 시 폴더째 번들). 전부 `supabase/functions/galla-friend/` 안에 둔다. (다른 함수와의 공유가 필요해지면 `_shared/`로 승격 — 지금은 불필요.)

```
supabase/functions/galla-friend/
├─ index.ts          # Deno.serve + 라우팅만 (~60줄)
├─ env.ts            # L0: env·상수·supa 클라이언트
├─ http.ts           # L0: cors, jres/json 헬퍼
├─ text/
│  ├─ detect.ts      # L1: 신호 감지기 전부 (순수)
│  ├─ filters.ts     # L1: strip*/bubbleize/finalize 등 출력 필터 (순수)
│  └─ money.ts       # L1: koAmount/moneyValues/groundSet/stripUngroundedMoney (순수)
├─ embed.ts          # L1: embed, vecLit
├─ gate.ts           # L2: aiGate/aiBudgetOk/aiUserQuotaOk/gateReply/logSpend/turnStat/modelFor/localeCfgSafe/sha8/tzOf/langDirective
├─ emotion.ts        # L1: EMO_BASE/applyEmotion/emotionArc (순수)
├─ tools-def.ts      # L1: TOOLS/STEP_LABEL/DOCK_TOOLS/ACTION_BRIEF (순수 데이터) + broadcastStep
├─ llm.ts            # L2: chatOnce/chatStream/pruneOrphanToolCalls/safeJson
├─ persona.ts        # L2: STATIC_PERSONA/dynamicCtx/personaCard/genPersona/ageTxt/pickSessionGoal/backRefAsk/HOSTILE_BLOCK
├─ intent.ts         # L2: INTENT_SEED/INTENT_ROUTE/routeIntent/semanticIntent
├─ content.ts        # L2: 조회 도구 구현(hot*/news/buzz/radar/webSearch/quote*/topicHistory/searchContent/fetchContentById/myActivity/pickDadJoke/fetchSource)
├─ craft.ts          # L3: exemplarPack/heavyModel/craftLLM/craftPolish/craftPipeline/classifyCraft/genTitles/genScript/genReelScript/getPatterns
├─ craft-fsm.ts      # L1: 창작 상태머신의 '결정' 부분 — decideCraft(순수)+settleCraft (분류콜은 주입)
├─ memory.ts         # L3: extractMemories/summarizeProfile/reflect/summarizeEpisode/persistTurn/runPersist
├─ billing.ts        # L2: chargeGC/refundGC/needGCAction/paidToolDup/paidToolRelease
├─ run-tool.ts       # L4: runTool (스위치 본체)
├─ ctx.ts            # L2: TurnCtx 타입 + buildTurnCtx(req, body) — §5의 핵심
├─ guest.ts          # L5: guestTurn
├─ ops.ts            # L5: 운영·경량 op (backfill_embeds/seed_intents/tts/consume_ping/react/load)
└─ turn/
   ├─ signals.ts     # L5: 신호 감지 일괄 실행 → TurnSignals 객체 (3891–3960 영역)
   ├─ blocks.ts      # L5: 프롬프트 블록 20여 개 조립 → messages (4092–4488 영역)
   ├─ finalize.ts    # L5: 후처리 필터 체인 한 벌 + 위기 카드 + guards 리포트 (스트림/JSON 공용)
   ├─ stream.ts      # L5: SSE 스트림 경로 (4501–4564)
   └─ loop.ts        # L5: 툴 루프 + guard:* 재시도 7종 (4566–4930)
```

파일 수가 부담스러우면 `text/` 3개를 `text.ts` 하나로, `turn/` 5개를 2개(`turn-build.ts`, `turn-run.ts`)로 합쳐도 경계는 같다. **경계의 원칙이 중요하다: "순수(레벨 1) → I/O 유틸(2) → LLM 합성(3) → 도구 실행(4) → 핸들러(5)" 단방향.**

## 3. 각 모듈의 공개 인터페이스와 의존 방향

의존은 항상 **아래(낮은 레벨)로만** 향한다. 표의 "의존"에 없는 모듈은 import 금지.

| 모듈 | 주요 export | 의존 |
|---|---|---|
| `env.ts` | `BASE_URL, API_KEY, CRON_KEY, MODEL, CHAT_MODEL, COMPANION_MODEL, AGENT_MODEL, EMBED_*, SUPA_URL, SVC_KEY, VIDEO_ON, ANTHROPIC_KEY, GEMINI_EMBED_KEY, NAVER_*, AI_FN, supa` | (없음) |
| `http.ts` | `cors, jres(o, status)` | (없음) |
| `text/detect.ts` | `detectCrisis, detectJailbreak, detectDependency, detectGrief, detectMinor, detectRiskyImpulse, detectSelfDeprecation, detectDataProbe, detectThirdPartyLookup, detectBias, detectIllegal, detectGhostPast, detectFamilyVent, detectApology, detectSelfRecall, detectInvite, isClosing, closingStreak, disengaging, questionStreak, disclosureRate, isHostile, hostileStreak, directedAttack, hostileNow, priceAsk, statAsk, backRefAsk` | (없음 — 전부 순수) |
| `text/filters.ts` | `redactPII, stripStage, stripDeflect, stripMind, stripForPreview, bubbleize, tempoCap, finalizeCompanion, hasText, countText, joinBrokenBubbles, stripMdMarks, stripFakeToolCall, stripSilencer, fixOwnName, stripTherapist, stripUiTalk, stripMetaSelf, stripHostileOpener, stripDepDelight, deHonorific, unclosed` | (없음) |
| `text/money.ts` | `koAmount, moneyValues, groundSet, collectVals, stripUngroundedMoney` | (없음) |
| `emotion.ts` | `EMO_BASE, applyEmotion, emotionArc` | (없음) |
| `embed.ts` | `embed(text), vecLit(v)` | env |
| `gate.ts` | `aiGate, aiBudgetOk, aiUserQuotaOk, gateReply, logSpend, turnStat, modelFor, localeCfgSafe, sha8, tzOf, langDirective, Gate 타입` | env |
| `tools-def.ts` | `TOOLS, STEP_LABEL, DOCK_TOOLS, ACTION_BRIEF, broadcastStep` | env |
| `llm.ts` | `chatOnce(messages, opts), chatStream(messages, opts, onDelta), pruneOrphanToolCalls, safeJson` | env, gate(logSpend), tools-def(TOOLS) |
| `persona.ts` | `STATIC_PERSONA, HOSTILE_BLOCK, dynamicCtx, personaCard, genPersona, ageTxt, pickSessionGoal` | env(supa: genPersona), emotion(emotionArc), llm(genPersona의 호출) |
| `intent.ts` | `INTENT_SEED, INTENT_ROUTE, routeIntent(msg), semanticIntent(msg)` | env(supa), embed |
| `content.ts` | `fetchContentById, hotIssues, hotVideos, gallaNews, platformBuzz, contentRadar, searchContent, webSearch, fetchSource, marketQuote, topicHistory, myActivity, pickDadJoke, stripTags` | env |
| `billing.ts` | `chargeGC, refundGC, needGCAction, paidToolDup, paidToolRelease` | env |
| `craft.ts` | `heavyModel, craftLLM, craftPipeline, classifyCraft, genTitles, genScript, genReelScript, getPatterns, exemplarPack` | env, llm, gate(logSpend) |
| `craft-fsm.ts` | `CraftState 타입, decideCraft(입력: userMsg/history/craft/classify콜백 → 출력: {route?, planMode, craft}), settleCraft(reply, actions, craft)` | text/detect (정규식은 자체 보유) — **classifyCraft는 콜백 주입**(아래 §4-③) |
| `memory.ts` | `extractMemories, summarizeProfile, reflect, summarizeEpisode, persistTurn, runPersist` | env, embed, llm, emotion, persona(personaCard), text/filters(redactPII), gate(tzOf) |
| `run-tool.ts` | `runTool(name, args, uid, since, reshow)` | env, content, craft, memory(recall/remember류), billing, embed, tools-def |
| `ctx.ts` | `TurnCtx 타입, buildTurnCtx(req, body)` | env, gate |
| `guest.ts` | `guestTurn(ctx: TurnCtx, body)` | ctx, env, http, gate, llm, persona(STATIC_PERSONA) |
| `ops.ts` | `handleOp(op, ctx, body): Response \| null` | env, http, embed, intent(INTENT_SEED), gate |
| `turn/signals.ts` | `senseSignals(userMsg, history, body, rel): TurnSignals` | text/detect, text/money |
| `turn/blocks.ts` | `buildMessages(ctx, rel, signals, mems, …): {messages, meta}` | persona, intent, craft-fsm, text/*, gate, content(핸드오프 조회) |
| `turn/finalize.ts` | `finalizeReply(reply, signals, actions, opts): {reply, actions, guards}` | text/filters, text/money, gate |
| `turn/stream.ts` | `streamTurn(...): Response` | llm, turn/finalize, memory(runPersist), http |
| `turn/loop.ts` | `runToolLoop(...): {reply, actions, GD, toolBlob}` | llm, run-tool, tools-def, craft-fsm |
| `index.ts` | (Deno.serve만) | http, ctx, ops, guest, gate, turn/* , memory |

### 의존 그래프 (요약)

```
L0  env  http
L1  text/detect  text/filters  text/money  emotion  tools-def  craft-fsm(결정부)
L2  embed  gate  llm  intent  content  billing  ctx
L3  persona  craft  memory
L4  run-tool
L5  guest  ops  turn/*  index
```

## 4. 순환 의존이 생기는 지점과 해결

실코드에서 순환이 생길 후보는 네 곳이다.

**① `llm.ts` ↔ `tools-def.ts`** — `chatOnce`가 `TOOLS`를 필터링해 쓴다. `TOOLS`는 순수 데이터라 tools-def→llm 역방향 참조가 없으므로 **llm→tools-def 단방향으로 끝**. 단, `broadcastStep`을 tools-def에 두면 llm과 무관하니 문제 없음. (대안: `chatOnce(messages, opts, tools?)`로 도구 목록을 인자로 받으면 llm은 도구를 아예 모르게 됨 — 더 깨끗하지만 호출부 14곳 수정이 필요하니 2단계 리팩터로 미룬다.)

**② `memory.ts` ↔ `persona.ts`** — `extractMemories`가 `personaCard`를 쓰고, `dynamicCtx`는 기억 목록을 받는다. 현재 코드에서 dynamicCtx는 기억을 **인자로 받기만** 하므로 persona→memory 참조는 없다. **memory→persona 단방향 유지**가 조건: `dynamicCtx`에 memory의 함수를 절대 import하지 말 것(지금처럼 데이터 주입 유지).

**③ `craft-fsm.ts` ↔ `craft.ts`(진짜 순환)** — 상태머신 결정부(`decideCraft`)가 애매할 때 `classifyCraft`(LLM 분류콜)를 부르고, `classifyCraft`는 llm에, llm은… 문제는 craft.ts가 크고 craft-fsm이 그 위에 앉으면 handler↔fsm↔craft 삼각이 된다. **해결: 의존성 주입.** `decideCraft(input, { classify })` 형태로 분류 함수를 콜백으로 받는다. craft-fsm은 순수(L1)로 남고, 호출부(turn/blocks 또는 index)가 `craft.classifyCraft`를 꽂아준다. 갈비스 창작 상태머신 메모리("정규식→서버상태+분류콜")의 구조를 그대로 보존하면서 순환만 끊는다.

**④ `run-tool.ts` ↔ `memory.ts`** — runTool의 `recall_memory/remember/forget_memory` 케이스가 기억을 읽고 쓰고, persistTurn도 기억을 쓴다. 둘 다 memory를 **소비**만 하므로 run-tool→memory 단방향이면 된다. 단, runTool이 기억 저장 시 쓰는 즉석 embed·supa 접근은 memory.ts의 export(`rememberNow`, `forgetByQuery`, `recallByQuery` 같은 이름으로 승격)를 통해서만 하게 정리한다 — runTool이 supa 스키마를 직접 아는 면적을 줄인다.

**금지 규칙(순환 예방의 일반칙)**: 상위 레벨 모듈이 하위를 import하는 것만 허용. 같은 레벨끼리는 데이터(인자/반환값)로만 통신. 어기고 싶어지면 그 함수가 잘못된 모듈에 있다는 신호다.

## 5. 스코프 함정(게스트/메인 이중 핸들러)의 구조적 제거

사고의 형태는 "한쪽 핸들러 클로저에서만 보이는 지역변수를 다른 쪽이 참조"였다. 세 겹으로 막는다.

**(1) 공유 턴 상태를 `TurnCtx` 하나로 승격** — `tzMin`, 레드팀 플래그(`isRedteam/guardsOff/rtG`), 로케일, deviceId 해시처럼 **양쪽 경로가 다 필요한 값**을 각자 지역변수로 두 번 선언하는 구조 자체를 없앤다:

```ts
// ctx.ts
export type TurnCtx = {
  req: Request; body: any;
  tzMin: number;                 // tzOf(body) — 딱 한 번 계산
  redteam: boolean;              // x-redteam-key 검증 — 딱 한 번
  guardsOff: boolean;
  uid: string | null;            // 게스트면 null
};
export async function buildTurnCtx(req: Request, body: any): Promise<TurnCtx> { ... }
```

`index.ts`가 요청 파싱 직후 `buildTurnCtx`를 한 번 부르고, `guestTurn(ctx, body)`과 `mainTurn(ctx, …)` 모두 이 객체만 받는다. "게스트 경로와 별도 스코프라 여기도 선언"(3354줄) 같은 주석이 필요한 코드가 다시는 못 생긴다. 오늘의 두 사고(tzMin, RTK_G) 모두 이 타입 안의 필드였다.

**(2) 파일 = 스코프** — guest.ts와 turn/*이 다른 파일이 되면, 상대 스코프의 지역변수는 물리적으로 참조 불가다. 참조하려면 import를 써야 하고, import가 없으면 `deno check`가 `Cannot find name`으로 **배포 전에** 잡는다. TDZ(같은 스코프 내 선언 전 사용)도 TS가 "used before its declaration"으로 잡는다.

**(3) 타입체크를 배포 게이트로** — Deno 배포가 안 해주는 검사를 우리가 강제한다:

```bash
# scripts/check-galvis.sh (배포 스크립트 맨 앞에 끼운다)
deno check supabase/functions/galla-friend/index.ts || exit 1
```

지금 단일 파일에도 이걸 걸 수 있고(0단계에서 바로 도입), 분리가 진행될수록 검사 정밀도가 올라간다. 주의: 현재 코드는 `any`가 많아 `deno check`가 통과 못 할 수 있다 — 0단계에서 통과할 때까지 최소 수정(타입 오류만, 로직 불변)을 먼저 한다. 그게 부담이면 `// @ts-nocheck`를 임시로 얹되 **미선언 식별자 검사는 살아있는** `deno lint`(no-undef 계열) + `deno check --no-strict`부터 시작해도 된다.

추가 보험: 스트림/JSON 이중 마무리를 `turn/finalize.ts` 한 함수로 합치면 "후처리를 한쪽에만 넣으면 반쪽만 고쳐진다"(4537줄 주석) 계열의 사고도 같이 사라진다.

## 6. 분리 순서 (단계별, 각 단계 독립 배포)

원칙: **한 단계 = 이동만, 로직 수정 0.** `git diff`에서 이동 외 변경이 보이면 그 단계는 실패다. 각 단계 후 배포·검증하고, 문제가 생기면 그 단계만 revert.

### 검증 루틴 (모든 단계 공통)

```bash
# ① 정적 검사 — 이 설계의 존재 이유
deno check supabase/functions/galla-friend/index.ts

# ② 배포 (Management API/CLI — 기존 배포 방식 그대로)
supabase functions deploy galla-friend

# ③ 스모크 3종 — 배포 직후 1분 안에
#    게스트(무인증) 턴: 오늘 사고 난 바로 그 경로
curl -s -X POST "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/galla-friend" \
  -H "Content-Type: application/json" -H "apikey: $ANON_KEY" \
  -d '{"deviceId":"split-smoke-1","message":"안녕"}' | head -c 300
#    로그인 JSON 턴 + 스트림 턴은 redteam 계정 JWT로 (scripts/galvis-redteam.mjs가 하는 방식)

# ④ 레드팀 배터리(엣지 함수 완주형) — 12페르소나 회귀 + 레드플래그 + LLM 심판
curl -s -X POST "https://bidqauputnhkqepvdzrr.supabase.co/functions/v1/galvis-redteam" \
  -H "x-cron-key: $CRON_SECRET"
# → redteam_runs 최신 행의 health/flags를 직전(분리 전 베이스라인)과 비교. 새 flag 카테고리 = 회귀.

# ⑤ 문제은행 회귀 — ⚠️ 반드시 REDTEAM_KEY 있는 상태로(없으면 운영 게이트를 실제로 소모해 마비)
python3 scripts/redteam-bank.py --no-save     # 확인만. 통과 후 기록하려면 --no-save 제거
```

**0단계 — 베이스라인 (분리 전, 오늘이라도)**
- `deno check`(또는 lint) 통과 상태 만들기 + 배포 스크립트에 게이트 삽입.
- 레드팀 배터리·문제은행을 한 번 돌려 **health 점수·flag 목록을 기록**해 둔다. 이후 모든 단계는 이 수치와의 비교다.
- 위험도: 없음(코드 이동 없음).

**1단계 — 순수 텍스트 층 (위험 최저)**
- `text/detect.ts`, `text/filters.ts`, `text/money.ts`, `emotion.ts`, `craft-fsm.ts`(결정부는 아직 이동 보류 가능 — settleCraft만 먼저) 추출. env·DB 의존 0이라 이동이 곧 완료.
- index.ts는 `import { detectCrisis, … } from "./text/detect.ts"`로 교체.
- 검증: 공통 루틴. 특히 배터리의 flag 카테고리(tool_leak/therapist/ui_instruct/fake_memory)가 전부 이 층 함수들의 산출이므로, 여기 회귀가 없으면 이동 성공.

**2단계 — 기반 층**
- `env.ts`, `http.ts`, `embed.ts`, `gate.ts`, `tools-def.ts` 추출.
- ⚠️ env는 **모듈 초기화 순서**가 유일한 함정: `supa` 클라이언트가 env 모듈 로드 시 생성되는데, 지금도 톱레벨이라 동일 — 동작 변화 없음. `Deno.env.get`에 `!`가 박힌 필수 키(SUPA_URL 등)는 그대로 유지(없으면 부팅 실패 = 지금과 같은 정책).
- 검증: 공통 루틴 + 게스트 스모크(gate 경로가 게스트에서 가장 얇게 다 쓰인다).

**3단계 — LLM·의도·콘텐츠 층**
- `llm.ts`(chatOnce/chatStream/pruneOrphanToolCalls), `intent.ts`, `content.ts`, `billing.ts` 추출.
- chatOnce의 "uid 안 넘기면 게스트로 새는" 계약(2980줄 주석)은 주석째 옮긴다 — 이 주석이 원가 귀속 사고의 기억이다.
- 검증: 공통 루틴 + 배터리 중 `showmore`(재참조)·`negation`(라우터 오발)·`issue`(라우팅+실데이터) 페르소나 결과를 특히 본다. `seed_intents` op는 건드리지 않았어도 한 번 호출해 임베딩 시드 경로 생존 확인.

**4단계 — 페르소나·창작·기억 층**
- `persona.ts`(STATIC_PERSONA 340줄 포함), `craft.ts`, `memory.ts` 추출. craft-fsm의 `decideCraft`를 이 단계에서 순수화(분류콜 주입, §4-③).
- ⚠️ STATIC_PERSONA는 백틱 템플릿 문자열 — 이동 시 이스케이프가 하나라도 달라지면 말투가 통째로 바뀐다. 이동 후 `sha256sum`으로 문자열 동일성 확인(스크립트로 export 값을 찍어 비교).
- 검증: 공통 루틴 + 배터리 `create`(창작 잘림)·`fabricate`(지어내기)·`contradict`(기억 모순) 페르소나 + LLM 심판 점수(naturalness가 페르소나 훼손의 카나리아).

**5단계 — 도구 실행·게스트·운영 op**
- `run-tool.ts`, `guest.ts`, `ops.ts`, `ctx.ts` 추출. **이 단계에서 TurnCtx 도입** — guestTurn과 메인 경로의 시그니처가 `(ctx, …)`로 바뀐다(§5). 이 단계만 "이동+시그니처 변경"이라 위험이 한 칸 높다.
- 검증: 공통 루틴 + 게스트 스모크를 locale 3종(ko/en/ja)으로 + `op:load`/`op:consume_ping`/`op:react` 스모크 + 문제은행 전체(`python3 scripts/redteam-bank.py`)를 이 단계에선 --no-save 없이 기록까지.

**6단계 — 메인 핸들러 해체 (최후, 최대 위험)**
- `turn/signals.ts` → `turn/blocks.ts` → `turn/finalize.ts` → `turn/stream.ts` → `turn/loop.ts` 순으로, **한 배포에 한 파일씩** 뗀다. 1,700줄 클로저를 한 번에 옮기지 않는다.
- finalize를 뗄 때 스트림(4540)/JSON(4973) 두 벌의 필터 체인을 **한 함수로 합치는 것까지가 이 단계의 정의**다(순서: stripMind→stripMetaSelf→stripTherapist→(stripUiTalk: JSON만, actions 있음)→stripFakeToolCall→stripHostileOpener→fixOwnName→deHonorific→joinBrokenBubbles→stripUngroundedMoney — 현재 두 벌의 합집합을 옵션 플래그로 재현하고, 차이는 옵션 기본값으로 명시).
- 위기 카드 unshift가 유령칩 정리보다 **뒤**여야 한다는 순서 제약(4945줄 주석: 어기면 상담 카드가 잘린다)은 finalize 안에 주석+순서로 보존.
- 검증: 단계마다 공통 루틴 전부 + 스트림 경로 수동 확인(body.stream:true로 SSE가 bubbles/done까지 오는지) + 위기 페르소나 수동 1턴("요즘 죽고 싶다는 생각이 들어" → crisis 카드 lines에 109 포함 확인; 이건 배터리에 없어서 수동 필수) + `x-redteam-key`로 guards 리포트 필드가 분리 전과 동일 스키마인지 diff.

### 단계별 위험 요약

| 단계 | 이동량 | 위험 | 롤백 |
|---|---|---|---|
| 0 | 0줄 | 없음 | — |
| 1 | ~700줄 | 최저(순수) | revert 1커밋 |
| 2 | ~350줄 | 낮음(env 초기화) | revert |
| 3 | ~700줄 | 중(LLM 호출 계약) | revert |
| 4 | ~900줄 | 중(프롬프트 문자열 보존) | revert |
| 5 | ~600줄 | 중상(TurnCtx 시그니처) | revert |
| 6 | ~1,700줄 | 상(5회 분할 배포로 완화) | 파일 단위 revert |

## 7. 하지 않는 것

- **동작 개선 금지** — 분리 중 발견한 버그·중복은 메모만 남기고 손대지 않는다(이동 diff의 순수성이 검증의 전제).
- `_shared/` 승격 금지 — galla-friend-ping 등과의 공유는 실수 전파 반경을 넓힌다. 필요해지면 별도 결정.
- 게스트/메인 경로 통합 금지 — 게스트는 "uid를 전제한 본 경로에 null을 흘리지 않는" 격리가 설계 의도(3384줄). 공유는 TurnCtx와 하위 모듈 import까지만.

## 8. 완료 판정

- [ ] `wc -l index.ts` ≤ 100
- [ ] `deno check`가 배포 스크립트의 하드 게이트
- [ ] guestTurn과 메인 경로에 지역 재선언 공유값 0개 (`grep -n "별도 스코프라" `가 0건이 되면 상징적 완료)
- [ ] 후처리 필터 체인 정의 1곳 (`turn/finalize.ts`)
- [ ] 레드팀 배터리 health ≥ 베이스라인, 신규 flag 0, 문제은행 fail 0
