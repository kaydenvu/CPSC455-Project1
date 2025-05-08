// static/js/app.js

;(async function() {
  // … grab roomName …
  const roomName = JSON.parse(document.getElementById('room-name').textContent);
  // Get username for presence tracking
  const username = JSON.parse(document.getElementById('username').textContent);

  // 1) Find your UI nodes ASAP
  const log = document.getElementById('chat-log');
  const input = document.getElementById('chat-message-input');
  const send = document.getElementById('chat-message-submit');
  const typingIndicator = document.getElementById('typing-indicator');
  const onlineUsersList = document.getElementById('online-users');
  const connectionStatus = document.getElementById('connection-status');
  
  if (!log || !input || !send) {
    console.error("Chat HTML elements not found!");
    return;
  }

  // 2) Try E2EE (but don't let failure stop you)
  let sharedKey = null, useE2EE = false;
  try {
    const privJwk = JSON.parse(localStorage.getItem('privateKeyJwk'));
    const privateKey = await crypto.subtle.importKey(
      'jwk', privJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false, ['deriveKey']
    );
    const res = await fetch(`/chat/api/keys/?room=${encodeURIComponent(roomName)}`);
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
  const proto = location.protocol==='https:'?'wss':'ws';
  
  // This automatically uses the current hostname or IP address the user connected with
  // For cross-device testing, each device should connect directly to the IP: 192.168.1.25:8000
  const host = location.host;
  
  // If needed, you can hardcode your IP here for testing
  // const host = "192.168.1.25:8000";
  
  const socket = new WebSocket(`${proto}://${host}/ws/chat/${roomName}/`);
  
  // Track typing status and timeout
  let typingTimeout = null;
  
  // Function to update online users list
  function updatePresenceList(users) {
    if (!onlineUsersList) return;
    
    // Clear current list
    onlineUsersList.innerHTML = '';
    
    // Add each user with appropriate status
    Object.entries(users).forEach(([user, data]) => {
      const userDiv = document.createElement('div');
      userDiv.className = 'user-presence';
      
      const statusIndicator = document.createElement('span');
      statusIndicator.className = 'status-indicator';
      
      if (data.status === 'typing') {
        statusIndicator.classList.add('typing');
        userDiv.innerHTML = `<span class="status-indicator ${data.status}"></span> ${user} <em>typing...</em>`;
      } else {
        statusIndicator.classList.add(data.status);
        userDiv.innerHTML = `<span class="status-indicator ${data.status}"></span> ${user}`;
      }
      
      onlineUsersList.appendChild(userDiv);
    });
  }
  
  // Function to update typing indicator
  function updateTypingIndicator(users) {
    if (!typingIndicator) return;
    
    const typingUsers = Object.entries(users)
      .filter(([user, data]) => data.status === 'typing' && user !== username)
      .map(([user]) => user);
    
    if (typingUsers.length === 0) {
      typingIndicator.style.display = 'none';
      typingIndicator.textContent = '';
    } else if (typingUsers.length === 1) {
      typingIndicator.style.display = 'block';
      typingIndicator.textContent = `${typingUsers[0]} is typing...`;
    } else if (typingUsers.length === 2) {
      typingIndicator.style.display = 'block';
      typingIndicator.textContent = `${typingUsers[0]} and ${typingUsers[1]} are typing...`;
    } else {
      typingIndicator.style.display = 'block';
      typingIndicator.textContent = `Multiple people are typing...`;
    }
  }
  
  // Update connection status
  function updateConnectionStatus(status) {
    if (!connectionStatus) return;
    
    connectionStatus.className = status === 'online' ? 'status-online' : 'status-offline';
    connectionStatus.textContent = status === 'online' ? 'Online' : 'Offline';
  }

  socket.onopen = () => {
    updateConnectionStatus('online');
    
    // Request current presence information
    socket.send(JSON.stringify({
      type: 'get_presence'
    }));
  };
  
  socket.onclose = () => {
    updateConnectionStatus('offline');
  };

  socket.onmessage = async e => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return console.error("Invalid JSON from server:", e.data);
    }
    
    // Handle ping/pong for keeping connection alive
    if (data.type === 'ping') {
      socket.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // Handle presence updates
    if (data.type === 'presence_update') {
      // Request the full presence list to ensure we're in sync
      socket.send(JSON.stringify({
        type: 'get_presence'
      }));
      return;
    }
    
    // Handle presence list
    if (data.type === 'presence_list') {
      updatePresenceList(data.users);
      updateTypingIndicator(data.users);
      return;
    }
    
    // Handle chat messages
    const user = data.user || 'System';
    const timestamp = data.timestamp || new Date().toISOString();
    let text;

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
    
    // Handle file attachments
    if (data.file) {
      text = `[File: ${data.file.name}] - ${window.location.origin}${data.file.url}`;
    }
    
    // Build a combined date+time label
    const dt = new Date(data.timestamp);
    const dateStr = dt.toLocaleDateString();     // e.g. "5/1/2025"
    const timeStr = dt.toLocaleTimeString();     // e.g. "2:23:45 PM"
    const label = `${dateStr} ${timeStr}`;
    log.value += `[${label}] ${user}: ${text}\n`;
    log.scrollTop = log.scrollHeight;
  };

  send.onclick = async () => {
    const msg = input.value.trim();
    if (!msg) return;

    if (useE2EE) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const pt = new TextEncoder().encode(msg);
      try {
        const ctBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, sharedKey, pt);
        socket.send(JSON.stringify({
          iv: btoa(String.fromCharCode(...iv)),
          ct: btoa(String.fromCharCode(...new Uint8Array(ctBuf))),
        }));
      } catch (encryptErr) {
        return console.error("Encryption failed:", encryptErr);
      }
    } else {
      socket.send(JSON.stringify({ message: msg }));
    }
    
    // Clear typing indicator
    socket.send(JSON.stringify({
      type: 'typing_indicator',
      typing: false
    }));
    
    input.value = '';
  };

  input.addEventListener('keyup', e => {
    if (e.key === 'Enter') {
      send.click();
    } else {
      // Send typing indicator
      clearTimeout(typingTimeout);
      
      socket.send(JSON.stringify({
        type: 'typing_indicator',
        typing: true
      }));
      
      // After 3 seconds of inactivity, clear typing status
      typingTimeout = setTimeout(() => {
        socket.send(JSON.stringify({
          type: 'typing_indicator',
          typing: false
        }));
      }, 3000);
    }
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
          name: file.name,
          type: file.type,
          iv: iv_b64,
          ct: ct_b64,
        }
    }));
  };
})();