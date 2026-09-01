/* 📼 조각 보관소 — 기기 전용(서버로 안 보낸다)
   ============================================================================
   설계 결정(2026-09-01): 발행 전 조각은 **기기에만** 둔다. 서버는 조각의 존재를
   아예 모른다. 저장 원가 0. 대신 앱을 지우거나 기기를 바꾸면 사라지므로,
   그 사실을 화면에서 반드시 말해야 한다(clips.html 안내 문구).

   왜 IndexedDB 인가
     · 웹·앱 한 코드로 돌아간다(Capacitor Filesystem 은 앱 전용)
     · Blob 을 그대로 넣을 수 있어 base64 팽창(+33%)이 없다
     ⚠️ iOS 는 저장 압박 시 사이트 데이터를 지울 수 있다 → navigator.storage.persist()
        로 영구 보관을 요청한다. 거절될 수 있으므로 그것도 화면에 반영한다.

   조각은 우리 카메라로만 받는다. 같은 코덱·해상도라 나중에 이어붙일 때
   재인코딩 없이 붙일 수 있다(샤디가 온디바이스로 처리하는 이유와 같다).
   ========================================================================== */
(function () {
  "use strict";

  const DB_NAME = "galla_clips";
  const DB_VER = 1;
  const STORE = "clips";
  const RETENTION_DAYS = 30;   // 지나면 '정리할까요?' 를 띄운다(자동 삭제 아님)

  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const os = db.createObjectStore(STORE, { keyPath: "id" });
          os.createIndex("shot_at", "shot_at");
        }
      };
      req.onsuccess = () => { _db = req.result; resolve(_db); };
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode) {
    return open().then((db) => db.transaction(STORE, mode).objectStore(STORE));
  }

  const wrap = (req) => new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

  /* ── 저장 ────────────────────────────────────────────────────────────── */

  async function add(rec) {
    const os = await tx("readwrite");
    const row = {
      id: rec.id || (Date.now() + "-" + Math.round(performance.now() * 1000)),
      blob: rec.blob,
      thumb: rec.thumb || null,
      dur_ms: Math.round(rec.dur_ms || 0),
      w: rec.w || 0,
      h: rec.h || 0,
      portrait: !!rec.portrait,
      mime: rec.mime || (rec.blob && rec.blob.type) || "",
      shot_at: rec.shot_at || new Date().toISOString(),
      // 트윈(숏판·롱판 동시 발행)으로 찍었는지 — 발행 때 두 행으로 나눈다
      twin: !!rec.twin,
    };
    await wrap(os.add(row));
    return row.id;
  }

  async function all() {
    const os = await tx("readonly");
    const rows = await wrap(os.getAll());
    // 최신이 앞
    return rows.sort((a, b) => (a.shot_at < b.shot_at ? 1 : -1));
  }

  async function get(id) {
    const os = await tx("readonly");
    return wrap(os.get(id));
  }

  async function remove(ids) {
    const list = Array.isArray(ids) ? ids : [ids];
    const os = await tx("readwrite");
    for (const id of list) await wrap(os.delete(id));
    return list.length;
  }

  /* ── 용량·정리 ───────────────────────────────────────────────────────── */

  async function stats() {
    const rows = await all();
    let bytes = 0;
    let oldest = null;
    const cutoff = Date.now() - RETENTION_DAYS * 86400e3;
    let stale = 0;
    for (const r of rows) {
      bytes += (r.blob && r.blob.size) || 0;
      if (!oldest || r.shot_at < oldest) oldest = r.shot_at;
      if (new Date(r.shot_at).getTime() < cutoff) stale++;
    }
    return { count: rows.length, bytes, oldest, stale, retention_days: RETENTION_DAYS };
  }

  /* 30일 지난 조각 id — 자동으로 지우지 않는다. 지우는 건 사람이 정한다.
     (샤디는 15일 자동 삭제지만 우리는 조각이 곧 창작 재료라 함부로 못 지운다) */
  async function staleIds() {
    const cutoff = Date.now() - RETENTION_DAYS * 86400e3;
    const rows = await all();
    return rows.filter((r) => new Date(r.shot_at).getTime() < cutoff).map((r) => r.id);
  }

  /* ── 영구 보관 요청 ──────────────────────────────────────────────────── */

  /* iOS 는 저장 압박 시 사이트 데이터를 지울 수 있다. 조각이 기기에만 있으므로
     지워지면 그냥 사라진다 — 반드시 요청하고, 거절되면 화면에서 알린다. */
  async function ensurePersisted() {
    try {
      if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
      const already = navigator.storage.persisted ? await navigator.storage.persisted() : false;
      if (already) return { supported: true, persisted: true };
      const ok = await navigator.storage.persist();
      return { supported: true, persisted: !!ok };
    } catch (_) {
      return { supported: false, persisted: false };
    }
  }

  async function quota() {
    try {
      if (!navigator.storage || !navigator.storage.estimate) return null;
      const e = await navigator.storage.estimate();
      return { usage: e.usage || 0, quota: e.quota || 0 };
    } catch (_) { return null; }
  }

  window.GALLA_Clips = {
    add, all, get, remove, stats, staleIds, ensurePersisted, quota,
    RETENTION_DAYS,
  };
})();
