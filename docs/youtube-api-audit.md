# YouTube Data API — Audit & Quota Extension 제출용 답변 초안 (GALLA)

> 사용법: https://console.cloud.google.com → 해당 프로젝트 → APIs & Services → YouTube Data API v3 → Quotas
> → "YouTube API Services - Audit and Quota Extension Form" 링크 → 아래 영문 답변을 항목에 맞춰 붙여넣기.
> (실제 폼 문항은 조금씩 다를 수 있으니, 아래 답변에서 해당 내용을 골라 넣으면 됩니다.)
> ⚠️ 대괄호 [ ]로 표시한 곳(프로젝트 번호, 연락처 등)은 제출 전에 실제 값으로 바꿔주세요.

---

## 1. Basic information

- **Application / Project name:** GALLA (갈라)
- **Google Cloud project number:** [YOUR_PROJECT_NUMBER]
- **API key(s) in use:** [YOUR_API_KEY_ID]
- **Primary contact email:** blackid@gmail.com
- **Website / app URL:** https://galla.im
- **Platforms:** Responsive web (https://galla.im) and native iOS app (bundle id `im.galla.app`, built with Capacitor)
- **Country / primary region:** Republic of Korea (regionCode=KR)

---

## 2. What does your application do? (Client description)

GALLA is a South Korean opinion, prediction, and community platform where users pick a side on trending issues, debate in comments, and predict outcomes. Within GALLA there is a discovery section called **"HotTube" (핫튜브)** that helps Korean users find what is currently popular on YouTube, organized by category (news/economy, entertainment/comedy, drama/film, music, gaming/sports, food, lifestyle/travel, beauty/fashion, animals, IT/science/education).

HotTube surfaces:
- **Trending videos** in Korea (YouTube "most popular" chart), and
- **The latest uploads from a curated list of well-known Korean creators** (e.g. travel, food, commentary, knowledge channels) so users can keep up with creators they follow even when those uploads are not on the trending chart.

Videos are **played back inside GALLA using the official YouTube embedded player (IFrame Player API / youtube.com/embed)** — GALLA never downloads, re-hosts, or re-streams video content. Each video also has a clear **"Watch on YouTube (유튜브에서 보기)"** link, the YouTube logo/branding is shown, and channel names are attributed.

---

## 3. Which API endpoints do you call, and why?

| Endpoint | Purpose | Approx. cost |
|---|---|---|
| `videos.list` (chart=mostPopular, regionCode=KR, part=snippet,statistics,contentDetails,status) | Fetch current trending videos in Korea for the category shelves. Paginated to increase coverage. | 1 unit/call |
| `videos.list` (id=…, part=snippet,statistics,contentDetails,status) | Hydrate metadata (title, channel, thumbnail, view/like count, duration, embeddable status) for videos found via playlists. | 1 unit/call |
| `playlistItems.list` (playlistId = channel "uploads" playlist) | Fetch the most recent uploads of curated creator channels. | 1 unit/call |
| `search.list` (type=channel) | **One-time only** — resolve a creator's channel ID from their name; the result is cached permanently in our database so we never search for the same channel again. | 100 units/call |
| `channels.list` (forHandle=@handle) | Resolve a creator's channel ID from a YouTube handle (preferred over search). Cached permanently. | 1 unit/call |

We use `status.embeddable` to **exclude videos that the owner has disabled for embedding**, so we never show a video that cannot be played in the official embedded player.

---

## 4. How is the data displayed to users?

- Category shelves and lists of video **thumbnails + title + channel name + view count + duration** (all standard YouTube snippet/statistics fields).
- Tapping a video opens the **official YouTube embedded player** inside the app; the video streams directly from YouTube to the user's device.
- A persistent **"Watch on YouTube ↗"** link and the **YouTube logo** are shown on every player.
- Channel names are always attributed next to each video.
- GALLA's own like/comment/share controls are **clearly separate** from YouTube's metrics and apply only to activity inside GALLA.

(Screenshots of the HotTube list and player are attached / available on request.)

---

## 5. Do you store YouTube data? For how long? How is it refreshed?

- We store **metadata only** — video id, title, channel title/id, thumbnail URL, view/like/comment counts, duration, published date, and embeddable flag — in a single table used to render the discovery lists.
- We **do not** store or host any video or audio content; playback is always via the official embedded player.
- Data is **refreshed on a schedule (currently every 30 minutes)** and **stale rows are deleted**, so stored statistics stay current and are never shown long after they were fetched. This complies with the YouTube API Services Developer Policies on data storage and refresh.

---

## 6. Authentication & user data

- The integration is **read-only** and uses a **server-side API key** for **public data only**.
- We do **not** use OAuth, do not access any user's private YouTube data, and do not act on behalf of YouTube users.

---

## 7. Monetization

- GALLA does **not** monetize YouTube content. We do not sell ads against YouTube videos, do not charge users to watch them, and do not place our own ads on or around the embedded player. HotTube is a free discovery feature for our users.

---

## 8. Compliance

- Playback uses the **official YouTube embedded player** only (no downloading, no background/audio-only extraction, no modification).
- We show **YouTube branding**, link back to **watch on YouTube**, and attribute channels.
- We honor **`status.embeddable`** and never attempt to circumvent embedding restrictions.
- We comply with the **YouTube API Services Terms of Service** and **Developer Policies**, including data storage/refresh and prohibited-use rules.

---

## 9. Quota requested & justification

**Current default:** 10,000 units/day.
**Requested:** [e.g. 1,000,000] units/day.

**Why we need more than the default:**
- We serve **~11 category feeds** for the Korean region and maintain a curated list of **top Korean creator channels (currently ~120, growing toward several hundred)**.
- Each refresh cycle costs roughly: trending charts (~16 units) + one `playlistItems.list` per creator channel (~1 unit each) + metadata hydration (~15 units). At ~120 channels and a 30-minute cycle that is **~6,000–7,000 units/day today**, and it grows linearly as we add creators and increase refresh frequency to keep "trending" genuinely fresh.
- One-time channel-ID resolution via `search.list` (100 units each) can temporarily consume a large share of the daily quota when we onboard a batch of new creators; a higher ceiling lets us onboard creators without starving the daily refresh.
- Headroom target: support **300–500 creator channels** and **15-minute refresh** for a responsive, up-to-date discovery experience for our Korean user base.

We are happy to provide additional screenshots, a demo account, or a screen recording of the HotTube feature on request.
