/* =========================================================
   GALLA Service Worker — PWA 오프라인 셸 + 즉시 재방문 로딩
   설계 원칙(_headers 캐시 정책과 충돌 없이 보완):
   - 외부 오리진(Supabase REST/RT/Storage/Functions, CDN 이미지·영상)은 손대지 않음(항상 네트워크)
   - 비 GET 요청은 통과
   - HTML 문서: network-first → 실패 시 캐시 → 최후 offline.html
   - 같은 오리진 정적 자원(css/js/vendor/assets): cache-first + 백그라운드 갱신(SWR)
     ※ 자원 URL이 ?v=NNN 으로 버전되므로 배포 시 새 URL → 자동 최신화(stale 없음)
   - 민감 페이지(설정·계정·인증·관리자)는 캐시 제외
   ========================================================= */
const SW_VERSION = 'galla-sw-v610';   // v420: 계정폼(비번변경·문의) SPA 스타일 스코프화 + 갈라성향 간격 / v419: 리로드 확실화(캐시버스터)+pull-refresh SPA전역
/* ⚠️ STATIC_CACHE 는 SW 버전과 묶지 않는다.
   예전엔 'galla-static-'+SW_VERSION 이라 SW 를 올릴 때마다 activate 에서 통째로 지워졌다.
   자원 URL 은 ?v= 로 버전돼 있어(불변) 버릴 이유가 없는데도 매 배포마다 전부 재다운로드했다
   → 재방문이 늘 콜드스타트였다(사장님: "점점 느려짐"). HTML 캐시만 버전에 묶는다. */
const STATIC_CACHE = 'galla-static-v1';
const PAGE_CACHE = 'galla-pages-' + SW_VERSION;

// 안정 URL만 사전 캐시(버전 박힌 자원은 런타임에 캐시)
const PRECACHE = ['/offline.html', '/assets/logo.png', '/manifest.webmanifest'];

// 캐시하지 않을 같은-오리진 경로(민감/동적)
const NO_CACHE_PATHS = [
  '/settings', '/account-edit', '/auth/', '/admin', '/login', '/reset',
  '/change-password', '/confirm', '/withdraw', '/imgproxy'
];
const isSensitive = (p) => NO_CACHE_PATHS.some(x => p.startsWith(x));

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(STATIC_CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      // 옛 HTML 캐시만 정리한다. 정적 캐시(galla-static-v1)는 불변 URL 모음이라 보존.
      .filter(k => k.startsWith('galla-pages-') && k !== PAGE_CACHE)
      .map(k => caches.delete(k)));
    /* 정적 캐시가 지나치게 불어나면(옛 버전 자원 누적) 한 번 비운다 — 상한만 둔다. */
    try {
      const sc = await caches.open(STATIC_CACHE);
      const n = (await sc.keys()).length;
      if (n > 600) await caches.delete(STATIC_CACHE);
    } catch {}
    await self.clients.claim();
    /* 옛 캐시만 비운다. 자동 navigate는 셸 iframe·앱 웹뷰에서 예기치 않은
       이동을 일으킬 수 있어 제거(사장님 재현) — 캐시는 이미 위에서 삭제됐으므로
       다음 로드부터 자연히 최신 코드가 온다. */
  })());
});

// 페이지에서 새 SW 즉시 적용 트리거
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // 외부 오리진(Supabase·CDN 등)은 서비스워커 개입 없음
  if (url.origin !== self.location.origin) return;
  // 민감 경로는 항상 네트워크
  if (isSensitive(url.pathname)) return;

  const isDoc = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isDoc) {
    // HTML: network-first → 캐시 → offline. (원본 req 그대로 — ⚠️ req.url로 새 요청을 만들면
    //   .html→clean URL 308 리다이렉트를 따라가 'redirected response'가 되고, 그걸 내비게이션에
    //   반환하면 브라우저가 거부해 전 페이지가 죽는다. 절대 fetch(req.url)로 바꾸지 말 것.
    //   CF의 내비게이션-전용 옛 HTML 캐시 문제는 js/plaza.js의 ensurePlazaPanel 자가치유가 처리한다.)
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const c = await caches.open(PAGE_CACHE);
          c.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        const cached = await caches.match(req, { ignoreSearch: true });
        return cached || (await caches.match('/offline.html')) || Response.error();
      }
    })());
    return;
  }

  /* 코드(js/css).
     ⚠️ 예전엔 전부 network-first 였다. 그런데 index.html 만 해도 CSS 14 + JS 38 = 52개다 —
        캐시가 있어도 매번 52번의 왕복을 먼저 하니 재방문이 느리고, 회선이 흔들리면
        스타일시트가 늦거나 실패해 '무스타일 화면'이 순간 노출됐다(사장님 실측 영상).
     자원 URL 은 ?v=NNN 으로 버전돼 있어 내용이 바뀌면 URL 이 바뀐다(= 불변).
     따라서 버전이 박힌 것은 cache-first 가 안전하다 — 옛 코드가 새 HTML 에 얹힐 수 없다.
     버전이 없는 것만 예전대로 network-first 로 남긴다. */
  const isCode = /\.(?:js|css)(?:\?|$)/i.test(url.pathname + url.search) || /\.(?:js|css)$/i.test(url.pathname);
  const isVersioned = /[?&]v=/.test(url.search);
  if (isCode && isVersioned) {
    e.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          const c = await caches.open(STATIC_CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })());
    return;
  }
  if (isCode) {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
          const c = await caches.open(STATIC_CACHE);
          c.put(req, res.clone());
        }
        return res;
      } catch {
        const cached = await caches.match(req);
        return cached || Response.error();
      }
    })());
    return;
  }

  // 그 외 정적 자원(이미지·폰트·벤더 등): cache-first + stale-while-revalidate
  e.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      fetch(req).then(res => {
        if (res && res.ok) caches.open(STATIC_CACHE).then(c => c.put(req, res));
      }).catch(() => {});
      return cached;
    }
    try {
      const res = await fetch(req);
      if (res && res.ok && (res.type === 'basic' || res.type === 'default')) {
        const c = await caches.open(STATIC_CACHE);
        c.put(req, res.clone());
      }
      return res;
    } catch {
      return Response.error();
    }
  })());
});

/* ── Web Push — DM·난장 새 메시지 ───────────────────────────
   payload: {title, body, url, tag} (send-push 엣지 함수가 만든다) */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  // 프리뷰: 부제가 오면 본문 위에 헤드라인처럼 얹고, image가 오면 big-picture(뉴스 히어로)로 보여준다
  const bodyLines = [d.subtitle, d.body].filter(Boolean).join('\n');
  const opts = {
    body: bodyLines || '새 메시지가 도착했어요',
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    tag: d.tag || 'galla',       // 같은 방 알림은 갱신(도배 방지)
    renotify: true,
    data: { url: d.url || '/dm.html' },
  };
  if (d.image) opts.image = d.image;   // 잠금화면/알림 big-picture 프리뷰
  e.waitUntil(self.registration.showNotification(d.title || 'GALLA', opts));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/dm.html';
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 이미 열린 창이 있으면 그 창을 앞으로 + 이동, 없으면 새로
    for (const w of wins) {
      try { await w.focus(); await w.navigate(url); return; } catch (_) {}
    }
    await clients.openWindow(url);
  })());
});
