/* 🔒 GALLA E2E 비밀대화 — WebCrypto ECDH(P-256) + AES-GCM
   설계(기기 귀속 — 카톡 비밀채팅과 같은 문법):
   · 개인키는 이 기기(localStorage)를 떠나지 않는다. 서버엔 공개키만 게시.
   · 대화키 = ECDH(내 개인키, 상대 공개키) → AES-GCM 256. 양쪽이 같은 키를 유도한다.
   · 서버·관리자는 암호문만 본다. 인박스 미리보기도 '🔒 비밀 메시지'(서버 트리거).
   · 한계(정직하게): 새 기기에선 이전 비밀 메시지를 못 연다(키 백업 없음).
     같은 계정의 다른 기기도 못 연다. 그게 '기기 귀속'의 뜻이다. */
(function () {
  const b64u = {
    enc: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
    dec: (s) => {
      const pad = '='.repeat((4 - s.length % 4) % 4);
      return Uint8Array.from(atob((s + pad).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    },
  };
  const supported = () => !!(window.crypto?.subtle && window.isSecureContext !== false);

  let myPriv = null, myPubJwk = null, published = false;
  const sharedCache = {};   // peerId -> Promise<CryptoKey|null>

  async function ensureMyKeys(sb, me) {
    if (myPriv) return true;
    try {
      const stored = localStorage.getItem('galla_e2e_priv');
      if (stored) {
        myPriv = await crypto.subtle.importKey('jwk', JSON.parse(stored),
          { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveKey']);
        myPubJwk = JSON.parse(localStorage.getItem('galla_e2e_pub') || 'null');
      }
      if (!myPriv || !myPubJwk) {
        const kp = await crypto.subtle.generateKey(
          { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
        const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
        myPubJwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
        localStorage.setItem('galla_e2e_priv', JSON.stringify(privJwk));
        localStorage.setItem('galla_e2e_pub', JSON.stringify(myPubJwk));
        myPriv = kp.privateKey;
      }
      if (!published) {
        // 공개키 게시(재게시는 무해 — 같은 키). 실패해도 다음 기회에.
        await sb.from('user_e2e_keys').upsert(
          { user_id: me, pub: myPubJwk, updated_at: new Date().toISOString() });
        published = true;
      }
      return true;
    } catch (e) { console.error('[e2e] keys', e); return false; }
  }

  function sharedWith(sb, me, peer) {
    if (!sharedCache[peer]) {
      const p = (async () => {
        if (!(await ensureMyKeys(sb, me))) return null;
        const { data } = await sb.from('user_e2e_keys')
          .select('pub').eq('user_id', peer).maybeSingle();
        if (!data?.pub) return null;   // 상대가 아직 비밀대화를 켠 적 없음
        const peerPub = await crypto.subtle.importKey('jwk', data.pub,
          { name: 'ECDH', namedCurve: 'P-256' }, false, []);
        return crypto.subtle.deriveKey(
          { name: 'ECDH', public: peerPub }, myPriv,
          { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      })().catch(e => { console.error('[e2e] derive', e); return null; });
      // ★ '키 없음'은 캐시하지 않는다 — 상대가 나중에 키를 게시하면 다음 시도에 잡혀야 한다
      sharedCache[peer] = p.then(k => { if (!k) delete sharedCache[peer]; return k; });
    }
    return sharedCache[peer];
  }

  window.GALLA_e2e = {
    supported,
    /* 내 키 준비 + 게시 (비밀대화 토글 켤 때 호출) */
    ready: (sb, me) => ensureMyKeys(sb, me),
    /* 상대가 비밀대화 가능한가(공개키 게시했나) */
    peerReady: async (sb, me, peer) => !!(await sharedWith(sb, me, peer)),
    /* 평문 → 'iv.ciphertext' (둘 다 base64url) */
    encrypt: async (sb, me, peer, text) => {
      const key = await sharedWith(sb, me, peer);
      if (!key) return null;
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key,
        new TextEncoder().encode(text));
      return b64u.enc(iv) + '.' + b64u.enc(ct);
    },
    /* 'iv.ciphertext' → 평문 | null(이 기기에서 열 수 없음) */
    decrypt: async (sb, me, peer, payload) => {
      try {
        const key = await sharedWith(sb, me, peer);
        if (!key) return null;
        const [ivS, ctS] = String(payload).split('.');
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: b64u.dec(ivS) }, key, b64u.dec(ctS));
        return new TextDecoder().decode(pt);
      } catch (_) { return null; }
    },
  };
})();
