/* 🛰 갈라 관제 앱 서비스워커(scope /ops/) — 관제 알림(위기·신고·버그)만 받는다. 캐시는 하지 않는다(항상 최신). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  const opts = {
    body: d.body || "새 관제 알림",
    icon: "/ops/icon-192.png",
    badge: "/ops/icon-192.png",
    tag: d.tag || "ops",
    renotify: true,
    requireInteraction: !!d.urgent,          // 위기는 사용자가 닫을 때까지 떠 있다
    vibrate: d.urgent ? [300, 120, 300, 120, 600] : [120],
    data: { url: d.url || "/ops/#/alerts" },
  };
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || "갈라 관제", opts);
    try { if (self.navigator.setAppBadge) await self.navigator.setAppBadge(); } catch (_) {}
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/ops/#/alerts";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).pathname.startsWith("/ops")) { try { await w.focus(); await w.navigate(url); return; } catch (_) {} }
    }
    await self.clients.openWindow(url);
  })());
});
