// static/js/app.js

;(async function() {
    // … grab roomName …
    const roomName = JSON.parse(document.getElementById('room-name').textContent);
  
    // 1) Find your UI nodes ASAP
    const log   = document.getElementById('chat-log');
    const input = document.getElementById('chat-message-input');
    const send  = document.getElementById('chat-message-submit');
    if (!log || !input || !send) {
      console.error("Chat HTML elements not found!");
      return;
    }
  
    // 2) Try E2EE (but don’t let failure stop you)
    let sharedKey = null, useE2EE = false;
    try {
      const privJwk    = JSON.parse(localStorage.getItem('privateKeyJwk'));
      const privateKey = await crypto.subtle.importKey(
        'jwk', privJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false, ['deriveKey']
      );
      const res   = await fetch(`/chat/api/keys/?room=${encodeURIComponent(roomName)}`);
      const peers = await res.json();
      if (peers.length) {
        const peerPub = await crypto.subtle.importKey(
          'jwk', peers[0].public_key,
          { name: 'ECDH', namedCurve: 'P-256' },
          false, []
        );
        sharedKey = await crypto.subtle.deriveKey(
          { name: 'ECDH', public: peerPub },
          privateKey,
          { name: 'AES-GCM', length: 256 },
          false, ['encrypt','decrypt']
        );
        useE2EE = true;
      }
    } catch (err) {
      console.warn("E2EE initialization failed, falling back to plaintext", err);
    }
  
    // 3) Open the socket & bind handlers (always)
    const proto  = location.protocol==='https:'?'wss':'ws';
    const socket = new WebSocket(`${proto}://${location.host}/ws/chat/${roomName}/`);
  
    socket.onmessage = async e => {
      let data;
      try {
        data = JSON.parse(e.data);
      } catch {
        return console.error("Invalid JSON from server:", e.data);
      }
      const user      = data.user      || 'System';
      const timestamp = data.timestamp || new Date().toISOString();
      let   text;
  
      if (useE2EE && data.iv && data.ct) {
        try {
          const iv = Uint8Array.from(atob(data.iv), c=>c.charCodeAt(0));
          const ct = Uint8Array.from(atob(data.ct), c=>c.charCodeAt(0));
          const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, sharedKey, ct);
          text = new TextDecoder().decode(pt);
        } catch (decryptErr) {
          console.error("Decryption failed:", decryptErr);
          text = "[unable to decrypt]";
        }
      } else {
        text = data.message || '';
      }
  
      log.value += `[${new Date(timestamp).toLocaleTimeString()}] ${user}: ${text}\n`;
      log.scrollTop = log.scrollHeight;
    };
  
    send.onclick = async () => {
      const msg = input.value.trim();
      if (!msg) return;
  
      if (useE2EE) {
        const iv   = crypto.getRandomValues(new Uint8Array(12));
        const pt   = new TextEncoder().encode(msg);
        try {
          const ctBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, sharedKey, pt);
          socket.send(JSON.stringify({
            iv:  btoa(String.fromCharCode(...iv)),
            ct:  btoa(String.fromCharCode(...new Uint8Array(ctBuf))),
          }));
        } catch (encryptErr) {
          return console.error("Encryption failed:", encryptErr);
        }
      } else {
        socket.send(JSON.stringify({ message: msg }));
      }
      
      input.value = '';
    };
  
    input.addEventListener('keyup', e => {
      if (e.key === 'Enter') send.click();
    });
  
    window.addEventListener('beforeunload', () => socket.close());

    const fileInput = document.getElementById('chat-file-input');

    // When a file is selected:
    fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file || !useE2EE) return;

    // 1) Read file as ArrayBuffer
    const buf = await file.arrayBuffer();

    // 2) Generate IV
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // 3) Encrypt with sharedKey
    const ctBuf = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        sharedKey,
        buf
    );

    // 4) Base64‑encode IV + ciphertext
    const iv_b64 = btoa(String.fromCharCode(...iv));
    const ct_b64 = btoa(String.fromCharCode(...new Uint8Array(ctBuf)));

    // 5) Send via WebSocket with metadata
    socket.send(JSON.stringify({
        file: {
        name:     file.name,
        type:     file.type,
        iv:       iv_b64,
        ct:       ct_b64,
        }
    }));
    };
  })();