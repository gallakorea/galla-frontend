/* 📮 GALLA Web Push — 구독 관리 + 발송 트리거
   개인키는 서버(엣지 함수 시크릿)에만, 여기엔 공개키만 있다.
   iOS는 '홈 화면에 추가'된 PWA + iOS 16.4+ 에서만 동작(사파리 탭에선 미지원). */
(function () {
  const VAPID_PUBLIC_KEY = 'BDbFS8TJV78UIPq6qqv7VprrtRAMRxSA5kB8KNJe8oUlK8r1DBiUlMB-wf4vhJTw3K7TRSVW_YLSLTuppXlYVFs';

  const sb = () => window.supabaseClient;
  const b64uToBytes = (s) => {
    const pad = '='.repeat((4 - s.length % 4) % 4);
    const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  };

  const supported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

  async function getSub() {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  /* 'unsupported' | 'denied' | 'on' | 'off' */
  window.GALLA_pushStatus = async function () {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    try { return (await getSub()) ? 'on' : 'off'; } catch (_) { return 'off'; }
  };

  window.GALLA_pushEnable = async function () {
    if (!supported()) throw new Error('unsupported');
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: b64uToBytes(VAPID_PUBLIC_KEY),
    });
    const raw = sub.toJSON();
    const { data: sess } = await sb().auth.getSession();
    const me = sess?.session?.user?.id;
    if (!me) throw new Error('auth');
    await sb().from('push_subscriptions').upsert({
      endpoint: sub.endpoint, user_id: me,
      p256dh: raw.keys.p256dh, auth: raw.keys.auth,
    });
    return true;
  };

  window.GALLA_pushDisable = async function () {
    const sub = await getSub();
    if (!sub) return;
    try { await sb().from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch (_) {}
    await sub.unsubscribe();
  };

  /* 발송 트리거 — 메시지 저장 직후 fire-and-forget.
     서버가 '진짜 발신자인가'를 재확인하므로 실패해도, 조작해도 해가 없다. */
  window.GALLA_pushSend = function (kind, id) {
    try {
      sb().functions.invoke('send-push', { body: { kind, id } }).catch(() => {});
    } catch (_) {}
  };
})();
