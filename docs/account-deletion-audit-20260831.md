# 계정 삭제 감사 (2026-08-31)

> 계정 생성은 제 제약이라 신규 계정을 만들어 지우는 방식은 쓰지 않았다.
> 대신 **삭제 로직을 유저 데이터 보유 테이블 전수와 대조**했다 — 단발 테스트는
> "그때 데이터가 있던 테이블"만 잡지만, 전수 대조는 빠뜨린 곳까지 잡는다.
> 실제 삭제는 기존 테스트 계정 데이터로 **트랜잭션 롤백** 시뮬을 돌려 확인했다.

## 구조

```
설정 → 계정 삭제
  → edge fn delete-account
      → rpc anonymize_account(uid)     ← 앱 데이터 정리
      → auth.admin.deleteUser(uid)     ← auth 행 삭제 → FK CASCADE
```

## 발견 — CASCADE 에 기댔는데 FK 가 없었다

유저 식별 컬럼(`user_id`·`sender_id`·`author_id`·`created_by`·`challenger`·`opponent`) **135개**를
FK 삭제규칙과 대조했다.

| 규칙 | 개수 | 의미 |
|---|---|---|
| CASCADE | 63 | auth 행 삭제 시 함께 삭제 — 정상 |
| SET NULL | 9 | 식별자만 끊김 — 정상 |
| NO ACTION | 5 | `public.users` 참조. 그 행은 마스킹만 하고 남기므로 발동 안 함 — 의도된 설계 |
| **FK 없음** | **58** | **아무 일도 안 일어난다** |

가장 심각한 것은 **`dm_messages.sender_id`** (729행). 사신(私信)이 탈퇴 후에도 실제 user_id 를
달고 남는다. 개인정보처리방침은 "회원 탈퇴 시 지체 없이 파기"라고 약속하고 있어 어긋난다.

## 조치 — `anonymize_account` 를 성격별로 확장

| 분류 | 처리 | 대상 |
|---|---|---|
| 사적 대화·설정 | **삭제** | `dm_messages` `dm_settings` `dm_blocks` `dm_hidden` `dm_favs` `dm_thread_prefs` `dm_poll_votes` + `dm_threads` 미리보기 흔적 |
| 세션·기기 흔적 | **삭제** | `webauthn_challenges` `presence` `activity_pings` `login_logs` |
| 문의·제보 | **삭제** | `support_tickets` `tips` |
| 통계 로그 | 식별자만 제거 | `content_daily_views` (nullable) |
| 원가·번역 로그 | **삭제** | `ai_spend` `translation_usage` — 집계본이 따로 있다(`ai_budget_usage` 185 · `ai_month_usage` 19) |
| 금전 기록 | **일부러 보존** | `gc_ledger` `gc_charges` `gc_refunds` `gc_clawbacks` `gp_charges` `withdrawals` — 전자상거래법 §6 상 5년 |

### ⚠️ 밟은 함정: NOT NULL 컬럼

처음엔 로그류를 전부 `set user_id = null` 로 짰다. `ai_spend.user_id` 가 **NOT NULL** 이라
`23502` 로 함수 전체가 죽었다 — **계정 삭제가 통째로 실패**한다(앱스토어 5.1.1(v) 필수 기능).
널 허용 여부를 보고 nullable 은 익명화, NOT NULL 은 삭제로 갈랐다.

## 검증 (전부 롤백)

```
DM 1→0 · ai_spend 3→0 · webauthn 0 · login_logs 0 · user_profiles 0
닉네임=탈퇴한회원 · 이메일=null · deleted_at=설정됨
gc_ledger 2건 보존(법정)
```

롤백 후 테스트 계정 정상 확인: 닉네임 `갈라심사` · 이메일 · 프로필 1 · 원가로그 3 그대로.

## 남은 것 — 사장님 판단

- **작성 콘텐츠는 남는다.** 댓글·글·이슈는 `public.users` 의 마스킹된 행(`탈퇴한회원`)을
  가리킨 채 유지된다. 커뮤니티 맥락 보존을 위한 설계로 보이나, 방침에 명시하는 편이 안전하다.
- **`auth.admin.deleteUser` 실패 시 롤백이 없다.** `anonymize_account` 가 먼저 커밋되므로,
  auth 삭제가 실패하면 데이터만 지워지고 계정은 남는 어정쩡한 상태가 된다.
  edge fn 이 500 을 반환하긴 하지만 재시도 안내가 없다.
- **실제 앱 동선 미검증.** 파괴적이라 실행하지 않았다. 사장님이 더미 계정으로 한 번
  눌러보시면 edge fn → RPC → auth 삭제 전 구간이 확인된다.
