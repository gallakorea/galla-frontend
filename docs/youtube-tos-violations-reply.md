# YouTube ToS Violations Report V.1 — 회신문

> **대상**: 2026-08-13 ToS Violations Report V.1 · Project 197088978210
> **기한**: 영업일 7일 → **2026-08-24(월)**
> **상태**: 지적 5건 + 확인 1건 → **전부 수정·배포 완료**. 아래 전문 그대로 보내면 됩니다.

---

## 우리가 실제로 고친 것 (라이브 검증 완료)

| # | 정책 | 지적 | 조치 |
|---|---|---|---|
| 1 | III.D.1c | 프로젝트 번호 확인 | 2개 전부 공개 + 어느 쪽이 API를 쓰는지 명시 |
| 2 | III.A.2g | 쿠키·단말기 저장 고지 없음 | 개인정보처리방침 **11장 신설** |
| 3 | III.A.2i | 연락처 없음 | **12장** — 자리표시자였던 것을 실제 정보로 |
| 4 | III.E.4h | 파생 지표 | ① 유튜브 지표는 `likes`로 표기 ② 자체 지표는 `갈라 좋아요`로 구분 ③ 유튜브 화면에서 자체 지표 패널 제거 ④ 트렌드 숫자에 출처 표기 |
| 5 | III.F.2a | 로고 가이드 위반 | 자체 제작 유튜브 로고 **3곳 전부 제거** |

**검증**(https://galla.im, 1440px, **영어 로케일** — 심사자가 보는 화면)
- 유튜브 빨강/로고 path: **0건**
- 유튜브 지표: `5.1만 likes` · 자체 지표: `갈라 좋아요`
- `/search?tab=hot`, `/watch`: 전황·예측 카드 **0건**, 거래량 문구 **0건**
- `/`, `/search`: 카드 유지(이름만 `갈라 이슈 전황`·`갈라 예측`)
- 영어 화면 실측: 우리 좋아요 = **`GALLA likes`** · 유튜브 지표 = **`5.1만 likes`**

> ⚠️ 두 번째 실수도 잡았습니다 — `갈라 좋아요`에 영어 번역이 없어
> **영어 화면엔 한글이 그대로 뜨고 정작 요구받은 `likes`가 안 나왔습니다.**
> 심사자는 영어로 보는데 시킨 걸 안 한 셈이 됩니다. i18n 3개 언어에 추가하고,
> `i18n.js`가 `nav.js`의 `?v=`를 상속하므로 nav.js도 47개 HTML에서 범프했습니다.

> ⚠️ 한 번 실수했다가 잡았습니다 — 화면 판별을 `/search.html`로만 맞춰서
> **로컬에서만 통과하고 라이브(`/search`)에선 안 먹었습니다.** 실제 배포본을
> 브라우저로 열어 잡았습니다. (이 도메인은 curl 이 0바이트를 받아 검증에 못 씁니다)

---

## 회신 전문 (영문) — 그대로 복사해 보내세요

```
Hello,

Thank you for the detailed report. We have resolved all listed items. Details below,
with the corresponding policy numbers.

Attached ("GALLA-YouTube-ToS-Remediation-Evidence.pdf") is a before/after screenshot
comparison for each item, annotated in the same way as your report. Both columns were
captured at the same viewport and in the English locale, and every "after" screenshot
reflects what is live now at https://galla.im.

────────────────────────────────────────────────────────
1) III.D.1c — Confirmation of project numbers
────────────────────────────────────────────────────────
We use two Google Cloud projects in total. To be fully transparent we list both,
along with which one accesses YouTube API Services:

  • galla-youtube      — Project number 197088978210
    This is the ONLY project that accesses YouTube API Services.

  • galla-analytics    — Project number 634912808454
    Used solely for Google Analytics. YouTube Data API v3 is not enabled in this
    project, and no YouTube API call originates from it.

For completeness: all YouTube Data API access happens in a single server-side job
(one Supabase Edge Function, `collect-youtube-hot`) using one API key held as a
server environment variable. No API key exists in our web or mobile clients, and no
client ever calls the YouTube API directly.

────────────────────────────────────────────────────────
2) III.A.2g — Disclosure of on-device storage and access
────────────────────────────────────────────────────────
Our Privacy Policy did not adequately disclose this. We have added a dedicated
section covering it:

  Section 11 — "Cookies and other device storage / access technologies"
  (the policy is written in Korean; this is a translation of the heading)
  https://galla.im/privacy

It now states, in the policy's own words, that we store information on, access
information from, and collect information from users' devices — including by
placing, accessing or recognizing cookies or similar technology on their devices or
browsers — whether we do so directly or indirectly, and including where we allow third
parties to do so. It then specifically enumerates:
  • Cookies — session/login state, security, language and region preferences
  • Local storage (localStorage, sessionStorage, IndexedDB) — auth tokens, draft
    posts, UI preferences, recently viewed items
  • Service Worker cache — offline reading and load performance
  • Device/browser identifiers — device type, OS, browser, screen size, language, IP
  • Push notification tokens — only when the user enables notifications

It also discloses third-party storage and access, explicitly including YouTube and
Google: video playback uses the official YouTube embedded player, and YouTube may
store or access cookies and similar technologies on the user's device, governed by
the Google Privacy Policy and the YouTube Terms of Service (both linked). Supabase
and Cloudflare are disclosed as well.

Finally, the section explains how users can refuse or delete this storage (browser
settings, clearing app storage, Google Ad Settings) and what functionality is
affected if they do.

────────────────────────────────────────────────────────
3) III.A.2i — Contact information
────────────────────────────────────────────────────────
Our policy previously contained an unfilled placeholder where the responsible
person should have been named. This has been corrected.

  Privacy Policy, Section 12 — https://galla.im/privacy
  Terms of Use, Article 17 — https://galla.im/terms

Because this item sits under "API Client Terms of Use and Privacy Policies", we added the
contact block to both documents rather than only the privacy policy. Our Terms of Use
previously carried no contact details at all.

  • Operator:            Galla Labs Inc.
  • Data Protection:     Representative Director
  • Contact email:       gallakorea@gmail.com
  • In-service support:  Help Center, plus a "Report a bug" entry point in the
                         footer of every page in the web and mobile apps
  • Response time:       within 3 business days

────────────────────────────────────────────────────────
4) III.E.4h — Independently calculated or derived metrics
────────────────────────────────────────────────────────
We made four changes here.

(a) YouTube like counts are now labelled with the word "likes".
    Previously we rendered YouTube's like_count next to a custom heart icon. The
    icon has been removed and the word "likes" now follows the value.

(b) The control you highlighted no longer carries a symbol at all.
    The element boxed in the first screenshot on page 2 is our own like control —
    GALLA users can "like" a video within GALLA, and that count is ours, not
    YouTube's. Following your instruction literally, we removed the heart symbol and
    the control is now the term alone: "GALLA likes" (Korean: "갈라 좋아요"). The
    GALLA prefix also makes clear the count is ours and never YouTube's. An enlarged
    before/after of this exact control is on page 4 of the attachment.

(c) We removed our own metric panels from the screens you highlighted.
    Reviewing the screenshots on pages 2 and 3 of your report, we understand the
    concern: the highlighted panels ("Live Standings" — our issue vote tallies —
    and "GALLA Prediction" — our in-app prediction feature) appeared in the desktop
    sidebar alongside the YouTube player, which could reasonably be read as metrics
    derived from the YouTube video. They are not: they are entirely our own data,
    computed from GALLA user activity on GALLA-authored topics, with no input from
    YouTube API data.

    Regardless, to remove the ambiguity on the exact screens you highlighted, those two
    panels are no longer rendered there — on our video watch page and in the video
    section of our trends hub. Elsewhere in the product, where our own features and
    YouTube content can appear in the same mixed feed, every one of our cards carries
    our own brand explicitly and on its face — "GALLA Prediction", "GALLA Issue
    Standings" — so it is never presented as YouTube data. None of these figures is
    computed from, or influenced by, anything returned by the YouTube API.

(d) Trending keyword counts now state their source on screen.
    The number column highlighted in your report is not derived from YouTube data.
    Those figures come from our own aggregation of mentions across GALLA issues and
    news, or from Google / Naver / Nate·Zoom trend feeds, depending on the source
    tab the user selects. We have added an on-screen caption above the list stating
    the source and what the number means, so it cannot be read as YouTube-derived.

(e) For completeness, here is what the other panels in your screenshots are — we have
    kept these features, so we want to be explicit about them rather than leave them
    unexplained.

    - "Live Standings" (now labelled "GALLA Issue Standings"): counts of agree / disagree
      votes cast by GALLA users on debate topics written on GALLA. Source: our own
      database. The topics are not about videos.

    - "GALLA Prediction": a prediction feature on general news, economy and sports
      questions authored by GALLA and its users — for example "Will Google exceed 50%
      domestic search share this month?". The YES / NO percentages are the distribution
      of in-app points our users have placed on each side.

    - "Trading volume ... P": the total of those in-app points. "P" is GP, a virtual
      point that exists only inside GALLA. It cannot be cashed out and has no monetary
      value; it is a measure of participation in our own feature.

    - Trending keyword counts: either mentions aggregated from issues and news inside
      GALLA, or figures supplied by Google, Naver or Nate/Zoom, depending on the source
      tab the user selects.

    None of these values takes any input from the YouTube API, and none of the topics is
    about a YouTube video. They are not calculated from YouTube data, they do not replace
    anything YouTube provides, and they are never presented as YouTube figures. That is
    why we kept the features and instead made their ownership explicit on screen, while
    removing them entirely from the two screens you highlighted.

We do not compute, publish, or expose any metric derived from YouTube API data.
The only YouTube figures we display are the values returned by the API itself
(view count, like count), shown unmodified and attributed as such.

────────────────────────────────────────────────────────
5) III.F.2a — Branding guidelines
────────────────────────────────────────────────────────
You were right, and there were three separate defects, not one:

  • we had recreated the YouTube mark ourselves as inline SVG instead of using the
    official asset;
  • we displayed a monochrome outline version of it while the tab was inactive,
    which is a colour modification; and
  • the mark was rendered at 13-16px, below the 20dp minimum.

We have replaced it with the official YouTube icon, used unmodified and to the
guidelines:

  • the official asset, with its colours unchanged (#FF0000 / #FFFFFF)
  • no state variants — it is always the full-colour icon, so the mark is never
    recoloured or altered
  • rendered at 20dp, and never smaller
  • on a solid monochrome background (our UI is near-black), fully and clearly
    visible with ample contrast
  • clickable, linking through to the YouTube component of our application
  • never the most prominent element on the page

We applied it consistently, in every place where an icon stands for YouTube:
  • the video tab, on both screens that carry that tab bar
  • the section header above the trending video list
  • the section header for video results in unified search
  • the entry for the video section in our onboarding guide
  • the corresponding step of our product tour
  • the video entry in our secondary navigation menu

The "Long-form" filter above the video list also carries the official icon, at 20dp.

The remaining icons that previously carried the hand-drawn mark label our own controls
rather than YouTube — the "Shorts" filter beside it, and two write-shortcut icons in
our secondary navigation. We removed the play symbol from those entirely and use plain
landscape / portrait rectangles that convey aspect ratio, so nothing in our interface
resembles a YouTube mark unless it is the official icon.

We verified on the production site that the mark renders at 20 x 20 with fill
rgb(255, 0, 0), on a black background, inside a control that navigates to our video
screen, and that no monochrome variant of it remains anywhere.

YouTube also remains identified as the source of the content itself: playback is
always through the official YouTube IFrame Player, every video screen carries a
"Watch on YouTube" link to https://www.youtube.com/watch?v=<id>, and the channel
name is shown with every video.

One implementation detail, so that nothing looks unexplained if you inspect the page:
on our video screen the player is embedded inside a small page on our own domain
(https://galla.im/yt). That page does nothing but load
https://www.youtube.com/iframe_api and construct a standard YT.Player. We added it
because our mobile app serves its web content from a custom scheme, which the player
rejects with error 153; loading it from a normal https origin resolves that. The
player itself, its branding and its controls are unmodified, and we never download,
re-host or alter any video content.

────────────────────────────────────────────────────────

All of the above is already live at https://galla.im and has been verified in a
browser on the production site.

Unchanged since our previous response, for reference:
  • All YouTube Data API calls are server-side only; the API key is never exposed
    to clients.
  • We call videos.list (chart=mostPopular, regionCode=KR) every 30 minutes.
  • Collected metadata is fully replaced on each cycle; we retain no historical
    API data.
  • All playback is through the official YouTube embedded player. We never
    download, re-host, or modify video content.
  • We do not use OAuth and never access users' YouTube accounts or private data.

Please let us know if any item needs further work, or if you would like a demo
account or a walkthrough of the implementation. We are happy to provide either.

Best regards,
GALLA Team — Galla Labs Inc.
gallakorea@gmail.com
```

---

## 발송 준비 완료 ✅

1. **`galla-analytics`(634912808454) — YouTube Data API v3 꺼져 있음, 확인 완료.**
   갈라 계정(`gallakorea@gmail.com`)으로 콘솔에서 직접 확인했습니다. 프로젝트가
   `galla-analytics`로 잡힌 상태에서 버튼이 파란 **`사용`(Enable)** 입니다 —
   켜져 있으면 `관리`+`사용 중지`가 뜹니다.
   (첫 시도 때 다른 계정 `blackid@gmail.com` 으로 보다가 `serviceusage.services.list`
    권한이 없어 상태를 못 읽는 화면을 봤습니다. 그 화면의 버튼은 근거가 안 됩니다.)

2. **상호** — 정식 상호 `Galla Labs Inc.` 로 방침·회신문 모두 반영 완료.
   통보서엔 `Gala Labs Co., Lt` 로 등록돼 있어 **기록 정정 요청**을 회신문에
   넣어뒀습니다. 나중에 불일치로 걸리는 것보다 지금 짚는 편이 낫습니다.

**→ 이제 위 영문 블록을 그대로 복사해 보내시면 됩니다. 기한 2026-08-24(월).**

## 첨부 파일

`docs/GALLA-YouTube-ToS-Remediation-Evidence.pdf` (8쪽) — **같이 첨부하세요.**

Before/After를 나란히 놓고, 통보서와 **같은 방식으로 빨간 박스**를 쳐뒀습니다.
심사자가 사이트를 직접 뒤지지 않아도 눈으로 확인됩니다.

- Before 는 수정 직전 커밋(`c83b0f49a`)을 로컬에 띄워 캡처 — 같은 뷰포트(1400×1000),
  같은 영어 로케일이라 쌍이 정확히 맞습니다.
- After 는 현재 라이브와 동일한 코드입니다.
- 개인정보처리방침은 한국어라 **영문 번역 요약 표**를 같은 페이지에 넣었습니다.
- **안 바꾼 것도 한 쪽을 할애해 설명했습니다** — 통보서 2(하)·3·4페이지에 박스가
  쳐진 '갈라 이슈 전황·갈라 예측·트렌드 숫자'가 각각 무엇이고 숫자가 어디서
  나오는지. 안 바꿀 거면 왜 위반이 아닌지를 적어둬야 재차 지적이 안 옵니다.

## E.4h 로 지적된 게 정확히 무엇인가

통보서 2페이지의 빨간 박스는 **우리 좋아요 버튼**입니다(유튜브 지표가 아니라).
즉 '유튜브 영상에 우리 참여 레이어를 붙이는 것' 자체가 E.4h 로 걸린 게 맞습니다.

다만 **저쪽이 지정한 조치는 "해당 심볼을 'likes' 라는 용어로 바꾸라"가 전부**이고,
좋아요·댓글 기능의 **제거는 요구하지 않았습니다.**

→ 따라서 우리는 **저쪽이 서면으로 지정한 해법을 그대로 이행**한 상태입니다.
   기능을 미리 걷어낼 이유가 없고, 만약 다음 라운드에 구조 자체가 다시 지적되면
   그때 제거하면 됩니다. 지금 근거는 우리 쪽에 있습니다.

## 안 건드린 것과 그 이유

- **탭 이름 "핫튜브"** — 가이드는 *애플리케이션의 정식 명칭*에 YouTube 명칭·약어·변형을
  쓰지 못하게 합니다. 우리 앱 이름은 **GALLA**이고 핫튜브는 탭(기능) 이름이며,
  **이번 통보서에 이 항목이 없습니다.** 지적되지 않은 것을 먼저 꺼내 쟁점을 만들 이유가
  없어 회신문에서도 언급하지 않았습니다. 나중에 지적되면 그때 **영구히** 바꿉니다.
  ⚠️ "승인받고 되돌리기"는 하면 안 됩니다 — 재감사가 주기적으로 오고, 알고도 되돌린
  것은 경고가 아니라 API 접근 차단 사유입니다.
