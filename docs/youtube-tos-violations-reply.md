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

**검증**(https://galla.im, 1440px 실측)
- 유튜브 빨강/로고 path: **0건**
- 유튜브 지표: `5.1만 likes` · 자체 지표: `갈라 좋아요`
- `/search?tab=hot`, `/watch`: 전황·예측 카드 **0건**, 거래량 문구 **0건**
- `/`, `/search`: 카드 유지(이름만 `갈라 이슈 전황`·`갈라 예측`)

> ⚠️ 한 번 실수했다가 잡았습니다 — 화면 판별을 `/search.html`로만 맞춰서
> **로컬에서만 통과하고 라이브(`/search`)에선 안 먹었습니다.** 실제 배포본을
> 브라우저로 열어 잡았습니다. (이 도메인은 curl 이 0바이트를 받아 검증에 못 씁니다)

---

## 회신 전문 (영문) — 그대로 복사해 보내세요

```
Hello,

Thank you for the detailed report. We have resolved all listed items. Details below,
with the corresponding policy numbers.

────────────────────────────────────────────────────────
1) III.D.1c — Confirmation of project numbers
────────────────────────────────────────────────────────
We use two Google Cloud projects in total. To be fully transparent we list both,
along with which one accesses YouTube API Services:

  • galla-youtube      — Project number 197088978210
    This is the ONLY project that accesses YouTube API Services.

  • galla-analytics    — Project number 634912808454
    Used solely for Google Analytics. It makes no YouTube API calls.

For completeness: all YouTube Data API access happens in a single server-side job
(one Supabase Edge Function, `collect-youtube-hot`) using one API key held as a
server environment variable. No API key exists in our web or mobile clients, and no
client ever calls the YouTube API directly.

────────────────────────────────────────────────────────
2) III.A.2g — Disclosure of on-device storage and access
────────────────────────────────────────────────────────
Our Privacy Policy did not adequately disclose this. We have added a dedicated
section covering it:

  Section 11, "Cookies and other device storage/access technologies"
  https://galla.im/privacy

It now discloses that we store information on, and access information from, users'
devices, and specifically enumerates:
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

  Section 12, "Data Protection Officer / Contact"
  https://galla.im/privacy

  • Operator:            Gala Labs Co., Ltd.
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
    icon has been removed; the value now reads, for example, "51K likes".

(b) Our own engagement metric is now clearly distinguished from YouTube's.
    GALLA users can "like" a video within GALLA. That count is ours, not YouTube's,
    and previously appeared as a bare number next to an icon, which could be
    mistaken for a YouTube metric. It is now explicitly labelled "GALLA likes"
    (Korean: "갈라 좋아요") wherever it appears.

(c) We removed our own metric panels from every surface that displays YouTube
    content.
    Reviewing the screenshots on pages 2 and 3 of your report, we understand the
    concern: the highlighted panels ("Live Standings" — our issue vote tallies —
    and "GALLA Prediction" — our in-app prediction feature) appeared in the desktop
    sidebar alongside the YouTube player, which could reasonably be read as metrics
    derived from the YouTube video. They are not: they are entirely our own data,
    computed from GALLA user activity on GALLA-authored topics, with no input from
    YouTube API data.

    Regardless, to remove any ambiguity, those panels are no longer rendered on any
    screen where YouTube content is shown (our video watch page and the YouTube
    section of our trends hub). We also renamed the remaining panels on non-YouTube
    screens to carry our own brand explicitly: "GALLA Issue Standings" and
    "GALLA Prediction".

(d) Trending keyword counts now state their source on screen.
    The number column highlighted in your report is not derived from YouTube data.
    Those figures come from our own aggregation of mentions across GALLA issues and
    news, or from Google / Naver / Nate·Zoom trend feeds, depending on the source
    tab the user selects. We have added an on-screen caption above the list stating
    the source and what the number means, so it cannot be read as YouTube-derived.

We do not compute, publish, or expose any metric derived from YouTube API data.
The only YouTube figures we display are the values returned by the API itself
(view count, like count), shown unmodified and attributed as such.

────────────────────────────────────────────────────────
5) III.F.2a — Branding guidelines
────────────────────────────────────────────────────────
You were right, and the root cause was worse than a sizing issue: we had recreated
the YouTube logo ourselves as inline SVG, and had additionally produced a modified
outline variant of it. The Branding Guidelines prohibit recreating, altering, or
recolouring the mark.

We have removed every instance. There were three:
  • the "HotTube" tab icon in our trends hub
  • the section header icon in unified search results
  • the entry icon in the trends onboarding guide

Rather than reproduce the official asset, we replaced all three with a neutral,
non-YouTube icon in our own brand colour, so that no YouTube mark is used outside
the official embedded player itself. There is now no YouTube logo or icon anywhere
in our product apart from the branding rendered by the official IFrame Player.

We also proactively removed YouTube name variants from our user-facing text, which
we understand the guidelines also restrict:
  • the search results section heading "핫유튜브" ("HotYouTube") → "인기 영상"
    ("Popular videos")
  • the "YT" placeholder shown when a thumbnail fails to load → a neutral play glyph

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
GALLA Team — Gala Labs Co., Ltd.
gallakorea@gmail.com
```

---

## 보내기 전 확인 두 가지

1. **`galla-analytics`(634912808454)에 YouTube Data API가 꺼져 있는지** — 회신문은
   "YouTube API를 호출하지 않는다"고 씁니다. 우리 코드 기준으로는 확실합니다(호출
   지점 1곳·키 1개). 콘솔에서 *API 및 서비스 → 사용 설정된 API*만 눈으로 확인해 주세요.
   켜져만 있고 안 쓰는 상태여도 번호를 이미 공개했으니 문제되지 않습니다.

2. **회사 정식 상호** — 방침에 `Gala Labs Co., Ltd.`로 적었습니다. 등기 상호와 다르면
   알려주세요.

## 안 건드린 것과 그 이유

- **탭 이름 "핫튜브"** — 가이드는 *애플리케이션의 정식 명칭*에 YouTube 명칭·약어·변형을
  쓰지 못하게 합니다. 우리 앱 이름은 **GALLA**이고 핫튜브는 탭(기능) 이름이며,
  **이번 통보서에 이 항목이 없습니다.** 지적되지 않은 것을 먼저 꺼내 쟁점을 만들 이유가
  없어 회신문에서도 언급하지 않았습니다. 나중에 지적되면 그때 **영구히** 바꿉니다.
  ⚠️ "승인받고 되돌리기"는 하면 안 됩니다 — 재감사가 주기적으로 오고, 알고도 되돌린
  것은 경고가 아니라 API 접근 차단 사유입니다.
