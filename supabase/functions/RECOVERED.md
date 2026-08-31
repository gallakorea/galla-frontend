# 배포본에서 되찾은 함수 (2026-08-31)

Supabase 에 **배포는 돼 있는데 저장소엔 없는** 함수가 16개였다. 소스가 없으니
고칠 수도, 감사할 수도 없는 코드가 프로덕션에서 돌고 있던 셈이다.
`supabase functions download <slug>` 로 15개를 되찾았다(1개는 이름이 하이픈으로
시작해 다운로드 불가 — `-cf-stream-upload`, 그 자체가 잘못된 배포다).

## 되찾아 저장소에 남긴 것 — 아직 쓰이거나 판단 보류

| 함수 | 상태 |
|---|---|
| `ai-write-helper` | **사용 중** — `js/write.ai.js` 가 호출 |
| `plaza-vote` | 대체됨(`vote_plaza_post` RPC). 인증은 있어 급하지 않아 보류 |
| `backfill-issue-thumbnails` | 일회성 백필 도구 |
| `generate-ai-news` · `generate-arguments-from-news` | 뉴스 파이프라인 구버전 |
| `generate-issue-clusters` · `match-article-to-cluster` · `match-article-to-issue` | 클러스터링 구버전 |

## 배포를 내린 것 — 인증 없이 열려 있었다

| 함수 | 왜 |
|---|---|
| **`get-video-upload-url`** | ⚠️ **로그아웃 상태에서 Cloudflare Stream 업로드 URL 을 발급했다.** 누구나 우리 계정으로 영상을 올릴 수 있었고 그대로 과금된다. 실측으로 응답 확인. |
| `get-image-upload-url` | 같은 계열 |
| `cf-direct-upload` | 같은 계열 |
| **`ai-polish`** | 인증 없이 임의 텍스트를 받아 AI 호출 — 원가를 태울 수 있다 |
| `content-moderation` · `ai-moderation-check` | 인증 없음, 호출자 없음 |
| `compute_trend_scores` | 호출자 없음 |

현재 업로드는 전부 `upload-media`(인증·확장자·용량·Content-Type 검증)를 지난다.

## 재발 방지

`scripts/edge-fn-drift.py` — 배포 목록과 저장소를 대조한다.
배포됐는데 소스가 없거나, 소스가 있는데 미배포면 잡는다.
