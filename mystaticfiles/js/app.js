// static/js/app.js

function getCookie(name) {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)')
  );
  return match ? decodeURIComponent(match[1]) : null;
}

const csrfToken = getCookie('csrftoken');


;(async function() {
  // Grab roomName from the embedded JSON
  const roomName = JSON.parse(document.getElementById('room-name').textContent);
  // Get username for presence tracking
  const username = JSON.parse(document.getElementById('username').textContent);

  let pendingMessage = null;
  function safeSend(payload) {
    const msg = JSON.stringify(payload);
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(msg);
    } else {
      // queue it—will send once socket fires 'open'
      pendingMessage = msg;
    }
  }

  // 1) Find all UI nodes
  const log = document.getElementById('chat-log');
  const input = document.getElementById('chat-message-input');
  const send = document.getElementById('chat-message-submit');
  const typingIndicator = document.getElementById('typing-indicator');
  const onlineUsersList = document.getElementById('online-users');
  const connectionStatus = document.getElementById('connection-status');
  const fileInput = document.getElementById('chat-file-input');
  const emojiButton = document.getElementById('emoji-button');

  if (!log || !input || !send) {
    console.error("Chat HTML elements not found!");
    return;
  }
  
// Initialize the emoji picker 
if (emojiButton) {
  const picker = new EmojiButton({
    position: 'top-start',
    rootElement: document.getElementById('chat-container'),
    autoHide: false,
    autoFocusSearch: false,
    showAnimation: true,
    
  });
  
  // Attach the picker to the button
  emojiButton.addEventListener('click', () => {
    picker.togglePicker(emojiButton);Z
  });
  
  // Handle emoji selection
  picker.on('emoji', selection => {
    // Get current cursor position
    const cursorPos = input.selectionStart;

    const emoji = selection.emoji || selection.character || selection;

    if (!emoji) {
      console.error('Could not extract emoji from selection:', selection);
      return;
    }
    // Insert emoji at cursor position
    const currentValue = input.value;
    input.value = currentValue.slice(0, cursorPos) + emoji + currentValue.slice(cursorPos);
    
    // Move cursor position after the inserted emoji
    const newCursorPos = cursorPos + emoji.length;
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    // Focus back on the input
    input.focus();
    
    // Trigger typing indicator
    input.dispatchEvent(new KeyboardEvent('keyup', { key: 'Process' }));
  });
  
  // Close emoji picker when clicking outside
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.emoji-picker') && 
        event.target !== emojiButton && 
        picker.pickerVisible) {
      picker.hidePicker();
    }
  });
}

  // 2) Try E2EE (but don't let failure stop you)
  let sharedKey = null, useE2EE = false, privateKey = null;

try {
  // Ensure we have a keypair in localStorage
  let stored = localStorage.getItem("ecdhKeypair");
  let pubJwk, privJwkObj;

  if (!stored) {
    // generate a new ECDH keypair
    const kp = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"]
    );
    pubJwk      = await crypto.subtle.exportKey("jwk", kp.publicKey);
    privJwkObj  = await crypto.subtle.exportKey("jwk", kp.privateKey);
    // store both halves together
    localStorage.setItem("ecdhKeypair", JSON.stringify({ pubJwk, privJwk: privJwkObj }));
  } else {
    // load both halves
    const parsed = JSON.parse(stored);
    pubJwk     = parsed.pubJwk;
    privJwkObj = parsed.privJwk;
  }

  // 2) Always re-post our public JWK so the server record stays fresh
  await fetch(`/chat/api/keys/?room=${encodeURIComponent(roomName)}`, {
    method:      'POST',
    credentials: 'same-origin',         // send the CSRF cookie
    headers: {
      'Content-Type':  'application/json',
      'X-CSRFToken':    csrfToken       // include the CSRF token
    },
    body: JSON.stringify({
      user:       username,
      public_key: pubJwk
    })
  });

  // 3) Import our private key
  privateKey = await crypto.subtle.importKey(
    "jwk",
    privJwkObj,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey"]
  );

  // 4) Fetch everyone’s public keys for this room
  const peers = await fetch(`/chat/api/keys/?room=${encodeURIComponent(roomName)}`)
    .then(r => r.json());

  // 5) Pick the other user’s most recent key
  const sorted = peers
    .filter(p => p.user !== username)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const other = sorted[0];

  if (other) {
    // 6) Import their public key and derive sharedKey
    const peerPub = await crypto.subtle.importKey(
      "jwk",
      other.public_key,
      { name: "ECDH", namedCurve: "P-256" },
      false,
      []
    );

    sharedKey = await crypto.subtle.deriveKey(
      { name: "ECDH", public: peerPub },
      privateKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );

    console.log("✅ Derived shared key with", other.user);
    useE2EE = true;
  } else {
    console.warn("🔒 Waiting for peer’s public key…");
  }
} catch (err) {
  console.warn("E2EE initialization failed, falling back to plaintext", err);
}


  // 3) Open the socket & bind handlers
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  
  // This automatically uses the current hostname or IP address the user connected with
  const host = location.host;
  
  // Create WebSocket connection
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

  // File download handler function
  async function handleFileDownload(e) {
  const fileData = JSON.parse(sessionStorage.getItem(e.target.dataset.fileId));

  // 1) Fetch encrypted bytes from your proxy
  const res = await fetch(fileData.url, {
    credentials: 'same-origin',       // send session cookie
    headers:     { 'X-CSRFToken': csrfToken }
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const encrypted = await res.arrayBuffer();

  // 2) Decrypt if needed (same as before)
  if (useE2EE && sharedKey && fileData.iv_length) {
    const iv  = new Uint8Array(encrypted.slice(0, fileData.iv_length));
    const ct  = new Uint8Array(encrypted.slice(fileData.iv_length));
    const pt  = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      sharedKey,
      ct
    );
    const blob = new Blob([pt], { type: fileData.type });
    // … create <a> and download …
  } else {
    // fallback
    window.open(fileData.url, '_blank');
  }
}


  // Socket open handler
  socket.onopen = () => {
    updateConnectionStatus('online');
    
    // Request current presence information
    socket.send(JSON.stringify({
      type: 'get_presence'
    }));
  };
  
  // Socket close handler
  socket.onclose = () => {
    updateConnectionStatus('offline');
  };

  // Socket message handler
  socket.onmessage = async e => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return console.error("Invalid JSON from server:", e.data);
    }
    console.log("Received message:", data);
    console.log("Data type:", data.type);
    
    // Handle ping/pong for keeping connection alive
    if (data.type === 'ping') {
      socket.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      return;
    }

    // Handles rating limiting in the chat box
    if (data.type === 'rate_limit_warning') {
      // Create a rate limit UI
      const warningDiv = document.createElement('div');
      warningDiv.className ='rate-limit-warning';
      warningDiv.textContent = data.message;

      // The warning message appears in the log when rate-limit surpassed
      log.appendChild(warningDiv);
      log.scrollTop = log.scrollHeight;

      input.classList.add('rate-limited');
      send.classList.add('rate-limited');
      send.disable = true;

      // Send button enabled again after timeOut is over
      setTimeout(() => {
        input.classList.remove('rate-limited');
        send.classList.remove('rate-limited');
        send.disabled = false;
      }, 2000);
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
    let text = '';

    // Handle encrypted messages
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
    } else if (data.message) {
      text = data.message;
    }
    
    // Build a combined date+time label
    const dt = new Date(timestamp);
    const dateStr = dt.toLocaleDateString();
    const timeStr = dt.toLocaleTimeString();
    const label = `${dateStr} ${timeStr}`;
    
    // Create message container
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message';
    
    // Add timestamp and username
    const metaSpan = document.createElement('div');
    metaSpan.className = 'message-meta';
    metaSpan.innerHTML = `<span class="timestamp">[${label}]</span> <span class="username">${user}:</span>`;
    messageDiv.appendChild(metaSpan);
    
    // Add message content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (text.startsWith("📎")) {
    // 1) Extract the URL (first http:// or https:// to next whitespace)
    const urlMatch  = text.match(/https?:\/\/[^\s]+/);
    // 2) Extract the filename (inside the first pair of parentheses)
    const nameMatch = text.match(/\(([^)]+)\)/);

      if (urlMatch) {
        const url      = urlMatch[0];
        const fileName = nameMatch ? nameMatch[1] : "file";

        const link = document.createElement("a");
        link.href       = url;
        link.textContent= `Download ${fileName}`;
        link.target     = "_blank";
        link.rel        = "noopener";

        contentDiv.appendChild(link);
      }
    } else if (data.type === 'file_link') {
      // decrypt the URL
      const iv = Uint8Array.from(atob(data.iv), c=>c.charCodeAt(0));
      const ct = Uint8Array.from(atob(data.ct), c=>c.charCodeAt(0));
      const pt = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, sharedKey, ct);
      const url = new TextDecoder().decode(pt);

      // build your link
      const link = document.createElement('a');
      link.href = url;
      link.textContent = `Download ${data.name}`;
      link.target = '_blank';
      link.rel = 'noopener';

      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message';
      messageDiv.appendChild(link);
      log.appendChild(messageDiv);
      log.scrollTop = log.scrollHeight;
      return;
    } else
    // Handle file attachments
    if (data.file) {
      const fileType = data.file.type || '';
      const fileName = data.file.name || 'file';
      
      // Make sure we have a valid URL
      const fileUrl = data.file.url.startsWith('/') 
        ? window.location.origin + data.file.url
        : window.location.origin + '/' + data.file.url;
      
      // Log file information for debugging
      console.log('Received file:', {
        name: fileName,
        type: fileType,
        url: fileUrl,
        data: data.file
      });
      
      // Add file info text
      const fileInfoSpan = document.createElement('div');
      fileInfoSpan.className = 'file-info';
      fileInfoSpan.textContent = `File: ${fileName}`;
      contentDiv.appendChild(fileInfoSpan);
      
      // Store file data for later retrieval
      // This allows us to handle encrypted files without relying on server URLs
      const fileData = {
        name: fileName,
        type: fileType,
        url: fileUrl,
        ivLength: data.file.iv_length || 0
      };
      
      // Create a unique ID for this file
      const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Store in session storage for handling download
      sessionStorage.setItem(fileId, JSON.stringify(fileData));
      
      // Handle different file types
      if (fileType.startsWith('image/')) {
        // For images - create preview
        const img = document.createElement('img');
        img.src = fileUrl;
        img.alt = fileName;
        img.className = 'chat-image';
        img.setAttribute('data-file-id', fileId);
        
        // Add error handling
        img.onerror = function() {
          this.style.display = 'none';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'file-error';
          errorDiv.textContent = 'Image preview not available';
          contentDiv.appendChild(errorDiv);
        };
        
        contentDiv.appendChild(img);
      } else if (fileType.startsWith('video/')) {
        // For videos - create player
        const video = document.createElement('video');
        video.controls = true;
        video.className = 'chat-video';
        video.style.maxWidth = '300px';
        video.setAttribute('data-file-id', fileId);
        
        const source = document.createElement('source');
        source.src = fileUrl;
        source.type = fileType;
        
        video.onerror = function() {
          this.style.display = 'none';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'file-error';
          errorDiv.textContent = 'Video preview not available';
          contentDiv.appendChild(errorDiv);
        };
        
        video.appendChild(source);
        contentDiv.appendChild(video);
      } else if (fileType.startsWith('audio/')) {
        // For audio - create player
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.className = 'chat-audio';
        audio.setAttribute('data-file-id', fileId);
        
        const source = document.createElement('source');
        source.src = fileUrl;
        source.type = fileType;
        
        audio.onerror = function() {
          this.style.display = 'none';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'file-error';
          errorDiv.textContent = 'Audio preview not available';
          contentDiv.appendChild(errorDiv);
        };
        
        audio.appendChild(source);
        contentDiv.appendChild(audio);
      }
      
      // Always add a direct download button for all file types
      // This will use our custom handling for encrypted files
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'file-download-btn';
      downloadBtn.textContent = `Download ${fileName}`;
      downloadBtn.setAttribute('data-file-id', fileId);
      downloadBtn.onclick = handleFileDownload;
      contentDiv.appendChild(downloadBtn);
    } else {
      // Regular text message
      const textSpan = document.createElement('span');
      textSpan.className = 'message-text';
      textSpan.textContent = text;
      contentDiv.appendChild(textSpan);
    }
    
    messageDiv.appendChild(contentDiv);
    log.appendChild(messageDiv);
    log.scrollTop = log.scrollHeight;
  };

  // Send button click handler
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

  // Input key event handler
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

  // Handle page unload
  window.addEventListener('beforeunload', () => socket.close());

// File upload handling
if (fileInput) {
  fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    // Create a temporary “uploading” message
    const dt    = new Date();
    const label = `[${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}] ${username}:`;
    const messageDiv = document.createElement('div');
    messageDiv.className = 'chat-message uploading';
    messageDiv.innerHTML = `
      <div class="message-meta">${label}</div>
      <div class="message-content">
        <div class="file-info">Uploading: ${file.name}</div>
        <div class="upload-progress"></div>
        <div class="upload-status">Processing...</div>
      </div>
    `;
    log.appendChild(messageDiv);
    log.scrollTop = log.scrollHeight;

    const progressBar = messageDiv.querySelector('.upload-progress');
    const statusSpan = messageDiv.querySelector('.upload-status');

    try {
      // Animate progress bar
      let progress = 0;
      const interval = setInterval(() => {
        progress = Math.min(progress + 5, 90);
        progressBar.style.width = `${progress}%`;
      }, 200);

      if (useE2EE && sharedKey) {
        statusSpan.textContent = 'Encrypting file...';

        // // 1) encrypt
        // const buf = await file.arrayBuffer();
        // const iv  = crypto.getRandomValues(new Uint8Array(12));
        // const ct  = await crypto.subtle.encrypt(
        //   { name: 'AES-GCM', iv },
        //   sharedKey,
        //   buf
        // );
        // const blob = new Blob([iv, ct], { type: 'application/octet-stream' });
        const blob = file;

        statusSpan.textContent = 'Uploading to server…';

        // 2) POST to Django proxy
        const form = new FormData();
        form.append('file', blob, file.name);

        let res;
        try {
          res = await fetch('/chat/api/upload-b2/', {
            method:      'POST',
            credentials: 'same-origin',
            headers:     { 'X-CSRFToken': csrfToken },
            body:         form
          });
        } catch (networkErr) {
          alert("Network error—please try again.");
          console.error(networkErr);
          clearInterval(interval);
          messageDiv.remove();
          fileInput.value = '';
          return;
        }

        if (!res.ok) {
          let err = { error: `Upload failed: ${res.status}` };
          try {
            err = await res.json();
          } catch (e) {
            console.error('Invalid JSON error response', e);
          }
          // show a popup to the user
          alert(payload.error);
          clearInterval(interval);
          messageDiv.remove();
          fileInput.value = '';
          return;
        }

        const { b2_key, download_url} = await res.json();

        // 3) Notify via WebSocket
        const payload = {
          type: 'chat.message',
          file: {
            b2_key,
            name:      file.name,
            type:      file.type,
            //iv_length: iv.byteLength,
            url:       `/chat/api/download-b2/${encodeURIComponent(b2_key)}/`
          }
        };
        safeSend(payload);
        // AES‑GCM‐encrypt the URL text
        const url = download_url;
        const iv  = crypto.getRandomValues(new Uint8Array(12));
        const pt  = new TextEncoder().encode(url);
        const ctBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, sharedKey, pt);

        // safeSend({
        //   type: 'file_link',         // a new message type
        //   message: `📎 Download file (${file.name}): ${download_url}`,
        //   iv:   btoa(String.fromCharCode(...iv)),
        //   ct:   btoa(String.fromCharCode(...new Uint8Array(ctBuf))),
        //   name: file.name           // for display
        // });
        safeSend({message: `📎 Download file (${file.name}): ${download_url}`,});
        statusSpan.textContent = 'File uploaded successfully!';
        console.log('File uploaded:', b2_key, file.type, file.name);
      } else {
        // plaintext fallback
        statusSpan.textContent = 'Sharing file info only...';
        socket.send(JSON.stringify({
          message: `[Shared a file: ${file.name}]`
        }));
      }

      // finish progress & cleanup
      clearInterval(interval);
      progressBar.style.width = '100%';
      setTimeout(() => messageDiv.remove(), 1000);
    } catch (err) {
      console.error('File upload failed:', err);
      statusSpan.textContent = `Upload failed: ${err.message}`;
      progressBar.style.backgroundColor = '#dc3545';
    }

    fileInput.value = '';
  };
}

})();