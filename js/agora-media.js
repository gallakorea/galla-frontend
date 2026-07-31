/* 📞 GALLA Agora 미디어 래퍼 — 통화 시그널링(벨·수락·CallKit)은 dm-call.js 그대로 두고,
   실제 소리·영상만 Agora로. 수락되면 양쪽이 channel=callId로 join → publish(mic[+cam]) → 상대 subscribe.
   iosrtc/ICE/TURN/SDP 협상 전부 불필요(Agora 네트워크가 처리). window.GALLA_agora API로 노출. */
(function () {
  "use strict";
  let client = null, localMic = null, localCam = null, curChannel = null, joining = false;
  const beacon = (m) => { try { window.__agoraLog ? window.__agoraLog(m) : console.log("[agora]", m); } catch (_) {} };

  const _SB = "https://bidqauputnhkqepvdzrr.supabase.co", _ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZHFhdXB1dG5oa3FlcHZkenJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyNzg1NDIsImV4cCI6MjA4MDg1NDU0Mn0.D-UGDPuBaNO8v-ror5-SWgUNLRvkOO-yrf2wDVZtyEM";
  async function token(channel, uid) {
    const sb = window.supabaseClient;
    // 세션 access_token을 '명시적으로' Bearer로 실어 직접 호출 (functions.invoke가 유저 토큰을 안 실어 401나던 것 해결)
    let jwt = _ANON;
    try { const { data } = await sb.auth.getSession(); if (data && data.session && data.session.access_token) jwt = data.session.access_token; } catch (_) {}
    const r = await fetch(_SB + "/functions/v1/agora-token", {
      method: "POST",
      headers: { "apikey": _ANON, "Authorization": "Bearer " + jwt, "Content-Type": "application/json" },
      body: JSON.stringify({ channel, uid }),
    });
    let d = null; try { d = await r.json(); } catch (_) {}
    if (!r.ok || !d || !d.ok) throw new Error("token-fail:" + r.status + ":" + (d && d.reason || "?"));
    return d; // { appId, token, uid, channel }
  }

  // SDK(1.2MB) 지연 로드 — 통화 시작 시 1회만 받는다(앱 첫 로드 가볍게).
  let _sdkP = null;
  function loadSDK() {
    if (window.AgoraRTC) return Promise.resolve();
    if (_sdkP) return _sdkP;
    _sdkP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "/vendor/agora/AgoraRTC_N-production.js?v=073106";
      s.async = true; s.onload = () => { beacon("sdk loaded"); res(); }; s.onerror = () => rej(new Error("sdk-load-fail"));
      document.head.appendChild(s);
    });
    return _sdkP;
  }

  const A = window.GALLA_agora = {
    supported() { return true; },   // 지연로드하므로 항상 지원(웹뷰 WebRTC 전제)
    active() { return !!client && !!curChannel; },
    loadSDK,

    // channel=callId, uid=uint32(내 유저), video=면상톡 여부, cbs={onRemoteVideo,onLocalVideo,onPeerLeft,onRemoteAudio}
    async join(channel, uid, video, cbs) {
      cbs = cbs || {};
      if (joining || client) { beacon("join skip (busy)"); return; }
      joining = true;
      try {
        await loadSDK();
        if (!window.AgoraRTC) throw new Error("sdk-not-loaded");
        client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
        client.on("user-published", async (u, mt) => {
          try {
            await client.subscribe(u, mt);
            if (mt === "audio") { u.audioTrack.play(); beacon("remote audio play"); cbs.onRemoteAudio && cbs.onRemoteAudio(u.audioTrack); }
            if (mt === "video") { beacon("remote video"); cbs.onRemoteVideo && cbs.onRemoteVideo(u.videoTrack); }
          } catch (e) { beacon("subscribe err " + (e && e.message)); }
        });
        client.on("user-unpublished", (u, mt) => { if (mt === "video") cbs.onRemoteVideo && cbs.onRemoteVideo(null); });
        client.on("user-left", () => { beacon("peer left"); cbs.onPeerLeft && cbs.onPeerLeft(); });
        client.on("connection-state-change", (c, p) => beacon("conn " + p + "→" + c));

        const d = await token(channel, uid >>> 0);
        await client.join(d.appId, channel, d.token, uid >>> 0);
        beacon("join ok ch=" + channel.slice(0, 8) + " uid=" + (uid >>> 0));

        // ⚠️ iosrtc가 getUserMedia를 치환하면 Agora가 'no audio tracks'로 실패. Agora 트랙 생성 동안만
        //    getUserMedia를 원본(네이티브 WebKit)으로 잠깐 교체했다가 되돌린다. (v2 방식 — 확실)
        const md = navigator.mediaDevices;
        const orig = md && md.__origGetUserMedia;
        const swapped = md && md.getUserMedia;
        beacon("mic-setup origGUM=" + !!orig);
        try {
          if (orig) { try { md.getUserMedia = orig; } catch (_) {} }
          localMic = await AgoraRTC.createMicrophoneAudioTrack();
          const pub = [localMic];
          if (video) { localCam = await AgoraRTC.createCameraVideoTrack(); pub.push(localCam); cbs.onLocalVideo && cbs.onLocalVideo(localCam); }
          await client.publish(pub);
        } finally {
          if (orig && swapped) { try { md.getUserMedia = swapped; } catch (_) {} }   // iosrtc판 복원(다른 기능 위해)
        }
        curChannel = channel;
        beacon("publish ok video=" + !!video);
      } catch (e) {
        beacon("JOIN FAIL " + (e && e.message || e));
        await A.leave();
        throw e;
      } finally { joining = false; }
    },

    async leave() {
      try { localMic && localMic.close(); } catch (_) {}
      try { localCam && localCam.close(); } catch (_) {}
      localMic = localCam = null;
      if (client) { try { await client.leave(); } catch (_) {} }
      client = null; curChannel = null;
      beacon("left");
    },

    setMute(muted) { try { localMic && localMic.setEnabled(!muted); beacon("mute=" + muted); } catch (_) {} },

    // 면상톡 전환: 통화 중 카메라 켜기/끄기
    async setVideo(on, cbs) {
      cbs = cbs || {};
      try {
        if (on && !localCam) {
          localCam = await AgoraRTC.createCameraVideoTrack();
          await client.publish([localCam]);
          cbs.onLocalVideo && cbs.onLocalVideo(localCam);
          beacon("video on");
        } else if (!on && localCam) {
          await client.unpublish([localCam]);
          localCam.close(); localCam = null;
          beacon("video off");
        }
      } catch (e) { beacon("setVideo err " + (e && e.message)); }
    },
    setCamEnabled(on) { try { localCam && localCam.setEnabled(on); } catch (_) {} },
    async switchCamera() { try { localCam && await localCam.setDevice && beacon("flip (setDevice N/A on web)"); } catch (_) {} },
    localVideoTrack() { return localCam; },
  };
  beacon("module ready sdk=" + (!!window.AgoraRTC));
})();
