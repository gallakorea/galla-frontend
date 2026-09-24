# App Store 재심사 대응 — Guideline 1.2 (User-Generated Content)
_26.9.24 · 앱: 갈라 GALLA (iOS 1.0, build 14 → 신규 빌드) · Galla Labs Inc._

## 결정 요약
- **익명(가명) 커뮤니티 유지** — 블라인드(19+)·주도(15+) 등 동종 익명 커뮤니티와 동일 성격.
- **연령등급 18+ 수용** (앱). 웹은 별도. 성인 카테고리(19금) 존재 → 18+ 가 정직한 등급.
- Apple 요구 8개 안전장치 완비 후, 아래 회신문 + 리뷰어 테스트 가이드 제출.

---

## Apple Resolution Center 회신문 (영문, 붙여넣기용)

Thank you for the review. GALLA is an anonymous/pseudonymous civic community (similar in nature to Blind, rated 19+, and 주도, both anonymous Korean communities). We have implemented all precautions required under Guideline 1.2:

1. **Age rating 18+** — We have set the app's age rating to 18+. Our EULA also states the app is for users 18 and older.
2. **EULA with zero-tolerance** — On sign-up, users must agree to our Terms, which now include a dedicated clause (Article 6-2) stating a zero-tolerance policy for objectionable content and abusive users. (Terms → "제6조의2 (불쾌한 콘텐츠에 대한 무관용 및 신고·조치)")
3. **Filtering objectionable content** — Submitted content passes an automated moderation filter (Korean rule-based + OpenAI moderation) plus profanity masking; disallowed content is blocked before posting.
4. **Flag/report content** — Every user-generated item (issues, plaza posts, comments across all surfaces incl. video, travel and food comments, DMs) has a "⋯ → Report" action.
5. **Block abusive users** — Every item has a "⋯ → Block user" action. Anonymous authors are also blockable (server resolves the hidden author server-side without exposing identity).
6. **Immediately remove own posts** — Authors can delete their own posts/comments instantly via "⋯ → Delete".
7. **24-hour moderation** — New reports trigger an immediate admin alert; an SLA monitor escalates any report open past 24h. Our admin console removes content and bans the offending user. This 24h commitment is written into the EULA (Article 6-2).
8. **In-app contact** — Contact is available in-app: Settings → Customer Support (문의) and a global shake-to-report bug tool; contact email gallakorea@gmail.com is published in the app and Terms.

A step-by-step test guide is attached below.

---

## 리뷰어 테스트 가이드 (App Review Notes 에 넣기)

Demo account: (제출 시 admin@galla.im 데모 또는 리뷰용 계정 기입 — 비번은 App Review 노트 전용)

1. Open any issue or plaza post → tap "⋯" on a comment you did not write → **Report** / **Block user**.
2. Tap "⋯" on your own comment → **Edit** / **Delete** (immediate removal).
3. Post a comment containing profanity → it is masked/blocked by the filter.
4. Sign-up flow → Terms acceptance is mandatory; Article 6-2 shows the zero-tolerance + 24h policy + 18+.
5. Report → the report is logged and an admin alert is created; our team removes content and bans the user within 24 hours (admin console).
6. In-app contact: Settings → 고객센터(Customer Support), and shake the device to open the bug/report tool.

---

## 체크리스트 (내부)
- [x] EULA 제6조의2 (무관용·신고·24h·18+) — terms.html
- [x] content_reports 신고 즉시 관리자 알림 + 24h SLA 크론 — 20260924_content_reports_sla.sql
- [x] 익명 작성자 차단 RPC(block_comment_author) — 20260924_block_comment_author.sql
- [ ] 신고·차단 누락 4곳(유튜브·인기영상·여행·맛집 댓글) — 진행 중
- [ ] 익명 댓글 차단 버튼 클라이언트 연결(comment-actions.js → block_comment_author)
- [ ] 필터 하드블록 + 댓글 경로
- [ ] 가입 연령 정책(18+ 앱) 정합성 — 결정 대기(가입 하한 18 vs 14 유지+스토어게이팅)
- [ ] App Store Connect 연령등급 18+ 설문 재작성
- [ ] 신규 빌드 업로드 + 재제출
