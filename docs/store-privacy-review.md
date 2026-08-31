# 앱스토어·플레이스토어 제출 자료 — 개인정보 라벨 · 연령등급 · 심사 메모

> 코드와 DB 실측 기준(2026-08-31). 값을 지어내지 않았다 —
> `user_profiles` 33명 기준 실명 0 · CI/DI 0 · 전화 5 · 생년월일 8 · 마케팅동의 4.
> **아직 도입 안 한 것은 라벨에 넣지 않는다.** 본인인증(실명·CI/DI)은 컬럼만 있고 미사용이므로 제외.
> 결제를 켜는 시점에 "구매 항목"을 추가해야 한다.

---

## 1. App Store — App Privacy (Nutrition Label)

각 항목의 답은 **연결됨(Linked to You)** / **추적(Tracking)** 여부까지 함께 적었다.
갈라는 **광고 네트워크·데이터 브로커에 데이터를 넘기지 않으므로 Tracking 은 전부 아니오**다.
→ App Store Connect 의 "Do you or your third-party partners use data for tracking?" = **No**
→ 따라서 ATT(App Tracking Transparency) 권한 요청도 하지 않는다.

### Contact Info
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| Email Address | 예 | 앱 기능(계정 생성·로그인·공지) | 예 | 아니오 |
| Phone Number | 예(선택) | 앱 기능(계정 복구) — 33명 중 5명 | 예 | 아니오 |
| Name | **아니오** | 실명은 수집하지 않음(닉네임은 User Content 로 분류) | — | — |

### User Content
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| Photos or Videos | 예 | 앱 기능(숏판·롱판·이슈·광장·DM 업로드) | 예 | 아니오 |
| Audio Data | 예 | 앱 기능(음성 메시지, 음성 인식) | 예 | 아니오 |
| Customer Support | 예 | 앱 기능(문의·버그 신고) | 예 | 아니오 |
| Other User Content | 예 | 앱 기능(댓글·게시글·AI 친구 대화·닉네임·프로필 사진·자기소개) | 예 | 아니오 |

### Identifiers
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| User ID | 예 | 앱 기능(계정 식별), 분석 | 예 | 아니오 |
| Device ID | **아니오** | 광고 식별자를 쓰지 않음 | — | — |

### Usage Data
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| Product Interaction | 예 | 분석(어떤 화면·콘텐츠를 보는지), 앱 기능(추천) | 예 | 아니오 |

### Diagnostics
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| Crash Data | 예 | 앱 기능(오류 수정) — 자체 `client_errors` 수집 | 예 | 아니오 |
| Performance Data | 예 | 앱 기능(오류 수정) | 예 | 아니오 |

### Location
| 데이터 | 수집 | 목적 | 연결됨 | 추적 |
|---|---|---|---|---|
| Coarse Location | 예(선택) | 앱 기능(동네 날씨) — 이용자가 권한을 허용한 경우에만 | 예 | 아니오 |
| Precise Location | **아니오** | 시·군·구 단위만 사용 | — | — |

### Sensitive Info / Financial / Health / Browsing History / Contacts / Search History
전부 **수집하지 않음**.
- 결제를 켜면 **Purchases** 를 추가해야 한다(현재 결제 비활성).
- 검색어는 서버에 개인과 연결해 저장하지 않는다.

---

## 2. Google Play — Data safety

App Store 라벨과 같은 내용이며, Play 는 아래 항목을 추가로 묻는다.

| 질문 | 답 |
|---|---|
| 데이터가 전송 중 암호화되는가 | **예** (전 구간 HTTPS) |
| 이용자가 데이터 삭제를 요청할 수 있는가 | **예** — 앱 내 `설정 → 계정 삭제`, 웹 `/settings` |
| 데이터 삭제 요청 URL | https://galla.im/settings |
| 제3자와 데이터를 공유하는가 | **예** — 처리 위탁(수탁자 7곳, 개인정보처리방침 §6에 명시) |
| 광고·마케팅 목적 공유 | **아니오** |
| 데이터 수집이 필수인가 | 계정 정보는 필수, 사진·위치·전화번호는 **선택** |

---

## 3. 연령등급

### App Store (Age Rating 설문)
| 항목 | 답 | 근거 |
|---|---|---|
| Cartoon or Fantasy Violence | None | — |
| Realistic Violence | None | '전투·격파'는 **댓글 점수 게임**이며 폭력 묘사가 없다 |
| Profanity or Crude Humor | Infrequent/Mild | 이용자 게시물에 비속어가 섞일 수 있어 신고·필터로 관리 |
| Mature/Suggestive Themes | Infrequent/Mild | 19금 카테고리를 별도 구분하고 성인 인증 후 노출 |
| Horror/Fear Themes | None | — |
| Medical/Treatment Info | None | — |
| Alcohol, Tobacco, or Drug Use | None | — |
| **Simulated Gambling** | **None** | ⚠️ 예측·베팅은 **현금 가치가 없는 게임 내 포인트(GP)** 로만 이루어지고, 현금 환전이 불가능하다. 상세는 아래 심사 메모. |
| Contests | None | — |
| **Unrestricted Web Access** | **아니오** | 외부 링크는 시스템 브라우저로 열고 앱 내 임의 브라우징을 제공하지 않는다 |
| **User Generated Content** | **예** | 신고·차단·삭제·이용정지를 모두 제공(아래 UGC 항목) |

**결과 등급: 17+** (UGC + 19금 카테고리 존재)

### Google Play (IARC 설문)
- 폭력: 없음 / 성적 콘텐츠: 성인 카테고리 분리·인증 / 도박: 현금 가치 없음 / UGC: 있음
- **예상 등급: 청소년 이용불가 또는 15세 이상** (IARC 결과에 따름)

---

## 4. 심사 메모 (App Review Notes)

아래 영문을 App Store Connect 의 "Notes" 에 붙여넣는다.

```
GALLA is a Korean opinion and short-form content platform. Users pick a side on
trending issues, debate in comments, upload short/long videos, and make predictions.

1) IN-APP PURCHASES / PAYMENTS
   Paid features are currently DISABLED in this build. The app contains no
   purchase flow, no prices, and no links to external payment pages. Screens that
   will later host purchases show "coming soon" and are inert.

2) "PREDICTION" FEATURE IS NOT GAMBLING
   The prediction market uses GP, a free in-app point with NO monetary value.
   - GP cannot be bought.
   - GP cannot be converted to money or transferred to other users.
   - GP is granted for free through daily activity.
   There is no wager of real money and no cash payout, so this is not
   real-money gaming under Guideline 5.3.

3) USER GENERATED CONTENT (Guideline 1.2)
   - Users must agree to terms that prohibit objectionable content at sign-up.
   - Every post and comment has a Report action (⋯ menu → Report).
   - Users can block other users; blocked users' content is hidden immediately.
   - Reported content is reviewed and removed, and repeat offenders are suspended.
   - Contact for content complaints: gallakorea@gmail.com

4) ACCOUNT DELETION (Guideline 5.1.1(v))
   Settings → Delete Account. This permanently deletes the account and its data
   in-app, without contacting support.

5) ADULT CATEGORY
   A "19+" category exists. It is separated from the main feed and requires
   adult verification before content is shown.

6) SIGN IN WITH APPLE
   Third-party sign-in (Google, Naver, Kakao) is offered alongside email sign-up.
   Sign in with Apple is provided as required by Guideline 4.8.

7) YOUTUBE CONTENT
   The "HotTube" tab shows YouTube videos through the official YouTube embedded
   player (IFrame Player API). We never download or re-host video. Each video
   links back to YouTube and shows channel attribution. We operate under the
   YouTube API Services Terms of Service (project 197088978210).

8) TEST ACCOUNT
   Email:    appreview@galla.im
   Password: (App Store Connect 의 "Sign-in required" 칸에 직접 입력)
   This account has GP pre-loaded so the prediction and item features can be
   exercised without waiting for daily rewards.

9) PERMISSIONS
   - Camera / Photo Library: only when the user attaches media to a post.
   - Microphone / Speech: only for voice messages and voice input.
   - Location: only for the local weather tab; district-level, never precise.
   - Notifications: optional; the app works fully without them.
   Each permission is requested at the moment the feature is used, with an
   in-app explanation shown first.
```

⚠️ **비밀번호는 이 파일에 적지 않는다.** App Store Connect 에 직접 입력한다.

---

## 5. 사장님이 채워야 하는 것

| 항목 | 현재 | 필요 |
|---|---|---|
| 통신판매업 신고번호 | "준비 중"으로 표시 중 | 관할 구청 신고 후 번호 기입(결제 오픈 전 필수) |
| 심사용 테스트 계정 비밀번호 | — | App Store Connect · Play Console 에 직접 입력 |
| Sign in with Apple | 미구현 | 소셜 로그인을 켤 경우 Guideline 4.8 로 **필수** |
| 성인 인증 수단 | 미도입(컬럼만 존재) | 19금 카테고리를 여는 시점에 본인확인기관 연동 |
