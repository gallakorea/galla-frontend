/* 정지(밴)된 계정이 여전히 활동할 수 있던 표 6개를 막는다.

   `banned_no_write`(RESTRICTIVE, insert, authenticated, NOT _me_banned()) 는 14개 표에만 걸려 있었다.
   빠진 곳을 정지 계정으로 직접 찔러 확인했다 — 전부 INSERT 가 성공했다(2026-09-01 실측):

     · votes                — **이슈 찬반 투표**. 정지돼도 판을 계속 흔들 수 있었다.
     · open_messages        — 난장 대화. ⚠️ **처음 '뚫렸다'고 본 건 오탐이었다** — `open_rooms` 가
                              0행이라 `insert … select … limit 1` 이 0행을 넣고 성공으로 보였다.
                              방을 만들어 다시 하니 원래도 막혀 있었다. 정책은 명시적으로 남겨둔다.
     · market_comments      — 예측 의견배틀 댓글.
     · galla_news_comments  — 갈라뉴스 댓글.
     · follows              — 팔로우(정지 중 스팸 팔로우).
     · content_reports      — 신고. 정지자가 신고를 도배할 수 있었다.

   차단은 확인된 것: comments·plaza_posts·comment_likes·duel_votes 등 기존 14개 표,
   그리고 SECURITY DEFINER RPC 8개(weather_say 는 {"ok":false,"reason":"banned"} 반환).

   ⚠️ `bookmarks`(저장) 는 일부러 두었다 — 본인만 보는 목록이라 막을 실익이 없고,
      과잉 차단은 정지 해제 뒤 데이터만 이상하게 만든다.

   ⚠️ RESTRICTIVE 여야 한다. PERMISSIVE 로 넣으면 옆의 정책과 OR 로 합쳐져 아무것도 못 막는다
      (이 프로젝트에서 같은 함정으로 결함 3건이 났다). */

create policy banned_no_write on public.votes
  as restrictive for insert to authenticated with check (not _me_banned());

create policy banned_no_write on public.open_messages
  as restrictive for insert to authenticated with check (not _me_banned());

create policy banned_no_write on public.market_comments
  as restrictive for insert to authenticated with check (not _me_banned());

create policy banned_no_write on public.galla_news_comments
  as restrictive for insert to authenticated with check (not _me_banned());

create policy banned_no_write on public.follows
  as restrictive for insert to authenticated with check (not _me_banned());

create policy banned_no_write on public.content_reports
  as restrictive for insert to authenticated with check (not _me_banned());
