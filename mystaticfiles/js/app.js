// static/js/app.js

;(async function() {
  // Grab roomName from the embedded JSON
  const roomName = JSON.parse(document.getElementById('room-name').textContent);
  // Get username for presence tracking
  const username = JSON.parse(document.getElementById('username').textContent);

  // 1) Find all UI nodes
  const log = document.getElementById('chat-log');
  const input = document.getElementById('chat-message-input');
  const send = document.getElementById('chat-message-submit');
  const typingIndicator = document.getElementById('typing-indicator');
  const onlineUsersList = document.getElementById('online-users');
  const connectionStatus = document.getElementById('connection-status');
  const fileInput = document.getElementById('chat-file-input');
  
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
    const fileId = e.target.getAttribute('data-file-id');
    if (!fileId) return;
    
    // Get file data from session storage
    const fileDataStr = sessionStorage.getItem(fileId);
    if (!fileDataStr) {
      alert('File information not available');
      return;
    }
    
    const fileData = JSON.parse(fileDataStr);
    console.log('Downloading file:', fileData);
    
    try {
      // Show download status
      e.target.textContent = 'Downloading...';
      e.target.disabled = true;
      
      // Fetch the encrypted file
      const response = await fetch(fileData.url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Get the encrypted data
      const encryptedData = await response.arrayBuffer();
      
      // If we have encrypted data and a shared key, decrypt it
      if (useE2EE && sharedKey && fileData.ivLength > 0) {
        // Extract IV and ciphertext
        const iv = new Uint8Array(encryptedData.slice(0, fileData.ivLength));
        const ct = new Uint8Array(encryptedData.slice(fileData.ivLength));
        
        // Decrypt the file
        const decryptedBuffer = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          sharedKey,
          ct
        );
        
        // Create a blob from the decrypted data
        const blob = new Blob([decryptedBuffer], { type: fileData.type });
        
        // Create download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileData.name;
        document.body.appendChild(a);
        a.click();
        
        // Clean up
        window.setTimeout(() => {
          URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }, 0);
        
        e.target.textContent = `Download ${fileData.name}`;
        e.target.disabled = false;
      } else {
        // For non-encrypted files or if decryption isn't available
        // Just open the URL directly
        window.open(fileData.url, '_blank');
        e.target.textContent = `Download ${fileData.name}`;
        e.target.disabled = false;
      }
    } catch (error) {
      console.error('Download failed:', error);
      e.target.textContent = 'Download failed';
      alert(`Failed to download file: ${error.message}`);
      
      // Reset after a delay
      setTimeout(() => {
        e.target.textContent = `Download ${fileData.name}`;
        e.target.disabled = false;
      }, 3000);
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
      
      // Create a temporary message showing upload progress
      const dt = new Date();
      const dateStr = dt.toLocaleDateString();
      const timeStr = dt.toLocaleTimeString();
      const label = `${dateStr} ${timeStr}`;
      
      // Create progress message
      const messageDiv = document.createElement('div');
      messageDiv.className = 'chat-message uploading';
      
      const metaSpan = document.createElement('div');
      metaSpan.className = 'message-meta';
      metaSpan.innerHTML = `<span class="timestamp">[${label}]</span> <span class="username">${username}:</span>`;
      
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      
      const fileInfoSpan = document.createElement('div');
      fileInfoSpan.className = 'file-info';
      fileInfoSpan.textContent = `Uploading: ${file.name}`;
      
      const progressBar = document.createElement('div');
      progressBar.className = 'upload-progress';
      
      const statusSpan = document.createElement('div');
      statusSpan.className = 'upload-status';
      statusSpan.textContent = 'Processing...';
      
      contentDiv.appendChild(fileInfoSpan);
      contentDiv.appendChild(progressBar);
      contentDiv.appendChild(statusSpan);
      
      messageDiv.appendChild(metaSpan);
      messageDiv.appendChild(contentDiv);
      
      log.appendChild(messageDiv);
      log.scrollTop = log.scrollHeight;

      try {
        // Animate progress bar to show activity
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += 5;
          if (progress > 90) {
            progress = 90; // Cap at 90% until complete
          }
          progressBar.style.width = `${progress}%`;
        }, 200);
        
        // Handle file based on encryption status
        if (useE2EE && sharedKey) {
          statusSpan.textContent = 'Encrypting file...';
          
          // Read file as ArrayBuffer
          const buf = await file.arrayBuffer();
          
          // Generate IV for encryption
          const iv = crypto.getRandomValues(new Uint8Array(12));
          
          statusSpan.textContent = 'Uploading encrypted file...';
          
          // Encrypt file content
          const ctBuf = await crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            sharedKey,
            buf
          );
          
          // Base64-encode IV + ciphertext
          const iv_b64 = btoa(String.fromCharCode(...iv));
          const ct_b64 = btoa(String.fromCharCode(...new Uint8Array(ctBuf)));
          
          // Send via WebSocket with metadata
          socket.send(JSON.stringify({
            file: {
              name: file.name,
              type: file.type,
              iv: iv_b64,
              ct: ct_b64,
            }
          }));
          
          // Complete the progress bar
          clearInterval(progressInterval);
          progressBar.style.width = '100%';
          
          // Remove the upload message after successful upload
          setTimeout(() => {
            if (messageDiv.parentNode) {
              messageDiv.parentNode.removeChild(messageDiv);
            }
          }, 1000);
        } else {
          statusSpan.textContent = 'Uploading file...';
          
          // For unencrypted file transfer
          // Since the server is already set up for encrypted file handling,
          // we fall back to a simpler message-only approach when encryption is unavailable
          socket.send(JSON.stringify({ 
            message: `[Shared a file: ${file.name}]` 
          }));
          
          statusSpan.textContent = 'Encryption not available. Sharing file info only.';
          clearInterval(progressInterval);
          progressBar.style.width = '100%';
        }
      } catch (error) {
        console.error("File upload failed:", error);
        statusSpan.textContent = `Upload failed: ${error.message}`;
        progressBar.style.backgroundColor = '#dc3545'; // Red for error
      }
      
      // Reset file input so the same file can be selected again
      fileInput.value = '';
    };
  }
})();