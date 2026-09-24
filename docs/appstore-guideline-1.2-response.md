# App Store 재심사 대응 — Guideline 1.2 (User-Generated Content)
_26.9.24 · 앱: 갈라 GALLA (iOS 1.0) · Galla Labs Inc._

## 전략 요약 (재리젝 0 목표)
- **익명(가명) 커뮤니티 유지** — 주도(15+)·블라인드(19+) 등 동종 익명 커뮤니티와 동일 성격.
- **연령등급: 정직하게 15+(한국)/16+(글로벌)** — 애플 공식 정의상 18+ 유발 요소(노골적 성적 콘텐츠·사실적 폭력·실제 도박)가 갈라엔 없음. UGC·소셜·익명은 18+ 유발 안 함(주도 15+가 실증).
  - ⚠️ 도박 선언 금지 — 갈라예측 참여 기능은 GP 환전 불가라 "사행성 아님"으로 설계(약관 제13조). 도박 선언 시 이 구조가 붕괴.
- **핵심 무기 = 능동적 모더레이션을 전면에 강조.** 리젝의 진짜 원인은 안전장치 부실이었고, 이제 전 표면 완비 + 관제 상시 운영.

---

## Apple Resolution Center 회신문 (영문, 붙여넣기용)

Thank you for the review. GALLA is an anonymous/pseudonymous civic community, similar in nature to other Korean anonymous communities on the App Store (e.g. "주도", rated 15+, and "Blind"). We have implemented **comprehensive, actively-operated moderation** covering every precaution under Guideline 1.2:

**Active moderation (operated continuously):**
- Automated content filtering removes objectionable material before it is posted (rule-based + OpenAI moderation + profanity masking).
- Every report triggers an **immediate admin alert**; an automated **24-hour SLA monitor** escalates any report left unresolved past 24 hours.
- Our **admin console** removes content and bans/ejects offending users; banned users are blocked from posting at the database level.
- This 24-hour commitment and zero-tolerance policy are written into our EULA (Terms Article 6-2).

**User controls on every user-generated item (issues, plaza posts, all comments incl. video/travel/food, DMs):**
- **Report** objectionable content.
- **Block** abusive users — including anonymous authors (the server blocks the hidden author without exposing identity).
- **Delete** your own content immediately.

**Other precautions:**
- EULA with zero-tolerance for objectionable content and abusive users, agreed to at sign-up (Terms Article 6-2).
- In-app contact: Settings → Customer Support, a global shake-to-report tool, and published email gallakorea@gmail.com.

Because GALLA contains no explicit sexual content, realistic violence, or real-money gambling, its honest age rating under Apple's own definitions is 15+/16+ (mature/suggestive themes + user-generated content). A step-by-step test guide is below.

---

## 리뷰어 테스트 가이드 (App Review Notes)
데모 계정: (리뷰용 계정/비번은 App Review 노트에 별도 기입)

1. Open any issue or plaza post → tap "⋯" on a comment you did not write → **Report** / **Block user** (works for anonymous authors too).
2. Tap "⋯" on your own comment → **Edit** / **Delete** (immediate removal).
3. Post a comment with profanity → masked/blocked by the filter.
4. Sign-up → Terms acceptance is mandatory; Article 6-2 shows the zero-tolerance + active moderation + 24h policy.
5. A report creates an immediate admin alert; our team removes content and bans the user within 24h via the admin console.
6. In-app contact: Settings → 고객센터(Customer Support); shake the device to open the report/bug tool.

---

## 체크리스트 (내부)
- [x] EULA 제6조의2 — 무관용 + 능동 모더레이션 + 24h + 익명 차단 (terms.html)
- [x] content_reports 신고 즉시 관리자 알림 + 24h SLA 크론
- [x] 익명 작성자 차단 RPC(block_comment_author) + 클라 연결(comment-actions)
- [x] 신고·차단 4곳(유튜브·인기영상·여행·맛집 댓글) + food/travel/video RLS
- [x] 가입 연령 만 14세로 복구, "18세" 문구 제거(15/16+ 정합)
- [ ] App Store Connect 연령설문 정직히 재작성 → 15/16+ (도박·성적콘텐츠 '없음'/성숙테마 '빈번')
- [ ] 신규 빌드 업로드 + 재제출(회신문·테스트가이드 첨부)
