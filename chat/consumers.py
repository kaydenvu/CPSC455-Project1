import json
import base64
import uuid
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from datetime import timedelta
from collections import defaultdict
import html
import re

from .models import ChatRoom, ChatMessage

# Global presence cache - in production, use Redis instead
# Format: {room_name: {username: {'status': 'online'|'typing', 'last_seen': timestamp}}}
PRESENCE_CACHE = {}

# Global rate limiting cache - in production, use Redis instead
# Format: {username: [list of message timestamps]}
MESSAGE_RATE_CACHE = defaultdict(list)

class ChatConsumer(AsyncWebsocketConsumer):
    # Rate limiting constants
    RATE_LIMIT_MESSAGES = 5  # Maximum messages
    RATE_LIMIT_WINDOW = 5    # Time window in seconds
    RATE_LIMIT_FILE_WINDOW = 30  # Longer window for file uploads (seconds)
    RATE_LIMIT_FILES = 2     # Fewer allowed file uploads

    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"chat_{self.room_name}"
        
        # Get username - ensure we have a unique identifier for anonymous users
        if self.scope['user'].is_authenticated:
            self.username = self.scope['user'].username
        else:
            # Generate a consistent anonymous ID using session if available
            session = self.scope.get('session', {})
            if session and 'anonymous_id' in session:
                anonymous_id = session['anonymous_id']
            else:
                anonymous_id = uuid.uuid4().hex[:8]
                if session:
                    session['anonymous_id'] = anonymous_id
            
            self.username = f"Anonymous-{anonymous_id}"
            
        self.typing = False
        self.typing_task = None

        # Initialize room in the presence cache if needed
        if self.room_name not in PRESENCE_CACHE:
            PRESENCE_CACHE[self.room_name] = {}

        # Initialize rate limiting for this user
        if self.username not in MESSAGE_RATE_CACHE:
            MESSAGE_RATE_CACHE[self.username] = []

        # Ensure the chat room exists
        self.room, _ = await self.get_or_create_room(self.room_name)

        # Join the channel group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Send last 50 messages (they come back as dicts)
        last_messages = await self.get_last_messages(self.room, 50)
        for msg_dict in last_messages:
            await self.send(text_data=json.dumps(msg_dict))
            
        # Send current online users
        await self.send_presence_list()
            
        # Update user presence status to online
        PRESENCE_CACHE[self.room_name][self.username] = {
            'status': 'online',
            'last_seen': timezone.now().isoformat()
        }

        # Announce that a user has joined and their presence
        join_event = {
            'type': 'chat_message',
            'user': 'System',
            'message': f"{self.username} has joined the chat.",
            'timestamp': timezone.now().isoformat(),
        }
        presence_event = {
            'type': 'presence_update',
            'user': self.username,
            'status': 'online',
            'timestamp': timezone.now().isoformat(),
        }
        
        # Start heartbeat task
        self.heartbeat_task = asyncio.create_task(self._send_heartbeat())
        
        # Send join notification and presence update
        await self.channel_layer.group_send(self.room_group_name, join_event)
        await self.channel_layer.group_send(self.room_group_name, presence_event)

    async def disconnect(self, close_code):
        # Cancel heartbeat and any pending typing timeout
        self.heartbeat_task.cancel()
        if self.typing_task and not self.typing_task.done():
            self.typing_task.cancel()
            
        # Update presence status to offline
        if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
            del PRESENCE_CACHE[self.room_name][self.username]
        
        # Leave the group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        # Announce leave
        leave_event = {
            'type': 'chat_message',
            'user': 'System',
            'message': f"{self.username} has left the chat.",
            'timestamp': timezone.now().isoformat(),
        }
        
        # Send presence update for offline status
        presence_event = {
            'type': 'presence_update',
            'user': self.username,
            'status': 'offline',
            'timestamp': timezone.now().isoformat(),
        }
        
        await self.channel_layer.group_send(self.room_group_name, leave_event)
        await self.channel_layer.group_send(self.room_group_name, presence_event)

    async def _send_heartbeat(self):
        """
        Every 30s send a lightweight heartbeat frame so
        the client (and any NAT/PTP routers) know we're alive.
        """
        try:
            while True:
                await asyncio.sleep(30)
                # Update last seen timestamp
                if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
                    PRESENCE_CACHE[self.room_name][self.username]['last_seen'] = timezone.now().isoformat()
                
                await self.send(text_data=json.dumps({
                    "type": "ping",
                    "timestamp": timezone.now().isoformat()
                }))
        except asyncio.CancelledError:
            # normal on disconnect
            pass
            
    async def _typing_timeout(self):
        """
        After 3 seconds of no typing activity, clear the typing status
        """
        try:
            await asyncio.sleep(3)
            self.typing = False
            
            # Update presence status back to online
            if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
                PRESENCE_CACHE[self.room_name][self.username]['status'] = 'online'
                
            # Broadcast typing stopped
            presence_event = {
                'type': 'presence_update',
                'user': self.username,
                'status': 'online',
                'timestamp': timezone.now().isoformat(),
            }
            await self.channel_layer.group_send(self.room_group_name, presence_event)
        except asyncio.CancelledError:
            # Normal cancellation when user types again
            pass

    def _clean_expired_messages(self, username, window_seconds):
        """Remove messages older than the window from the rate cache"""
        now = timezone.now()
        MESSAGE_RATE_CACHE[username] = [
            timestamp for timestamp in MESSAGE_RATE_CACHE[username]
            if now - timestamp < timedelta(seconds=window_seconds)
        ]
        
    async def _check_rate_limit(self, is_file=False):
        """Check if the user has exceeded their rate limit"""
        window = self.RATE_LIMIT_FILE_WINDOW if is_file else self.RATE_LIMIT_WINDOW
        limit = self.RATE_LIMIT_FILES if is_file else self.RATE_LIMIT_MESSAGES
        
        # Clean expired messages first
        self._clean_expired_messages(self.username, window)
        
        # Check if user is within limits
        if len(MESSAGE_RATE_CACHE[self.username]) >= limit:
            return False
            
        # Add current message timestamp
        MESSAGE_RATE_CACHE[self.username].append(timezone.now())
        return True
        
    async def _send_rate_limit_warning(self):
        """Send a private rate limit warning to the user"""
        await self.send(text_data=json.dumps({
            'type': 'rate_limit_warning',
            'message': f"Please slow down. You can send {self.RATE_LIMIT_MESSAGES} messages every {self.RATE_LIMIT_WINDOW} seconds.",
            'timestamp': timezone.now().isoformat(),
        }))

    async def send_presence_list(self):
        """Send the current list of online users to this client"""
        if self.room_name in PRESENCE_CACHE:
            presence_list = {
                'type': 'presence_list',
                'users': PRESENCE_CACHE[self.room_name],
                'timestamp': timezone.now().isoformat(),
            }
            await self.send(text_data=json.dumps(presence_list))

    async def receive(self, text_data):
        data = json.loads(text_data)
        
        # Handle ping/pong
        if data.get("type") == "ping":
            await self.send(text_data=json.dumps({
                "type": "pong",
                "timestamp": timezone.now().isoformat()
            }))
            return
            
        # Handle typing indicator
        if data.get("type") == "typing_indicator":
            typing_status = data.get("typing", False)
            
            # Only send update if status changed
            if typing_status != self.typing:
                self.typing = typing_status
                
                # Update presence status
                if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
                    PRESENCE_CACHE[self.room_name][self.username]['status'] = 'typing' if typing_status else 'online'
                
                # Send typing indicator to group
                presence_event = {
                    'type': 'presence_update',
                    'user': self.username,
                    'status': 'typing' if typing_status else 'online',
                    'timestamp': timezone.now().isoformat(),
                }
                await self.channel_layer.group_send(self.room_group_name, presence_event)
                
                # Set/cancel typing timeout
                if typing_status:
                    # Cancel existing typing task if any
                    if self.typing_task and not self.typing_task.done():
                        self.typing_task.cancel()
                    # Create new typing timeout task
                    self.typing_task = asyncio.create_task(self._typing_timeout())
            return
            
        # Handle presence request
        if data.get("type") == "get_presence":
            await self.send_presence_list()
            return

        # Update last seen timestamp
        if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
            PRESENCE_CACHE[self.room_name][self.username]['last_seen'] = timezone.now().isoformat()
            PRESENCE_CACHE[self.room_name][self.username]['status'] = 'online'

        # File upload payload (encrypted file)
        if 'file' in data:
            # Check rate limit for files
            if not await self._check_rate_limit(is_file=True):
                await self._send_rate_limit_warning()
                return
                
            file_info = data['file']
            iv_b64 = file_info.get('iv')
            ct_b64 = file_info.get('ct')
            if not iv_b64 or not ct_b64:
                return
            # Decode and store encrypted blob
            try:
                iv = base64.b64decode(iv_b64)
                ct = base64.b64decode(ct_b64)
                raw = iv + ct
            except:
                #invalid base64 data
                return

            # Generate unique filename
            orig_name = sanitize_filename(file_info.get('name', 'file'))
            ext = sanitize_filename(orig_name.split('.')[-1])
            if not ext or len(ext) > 10:
                ext = 'bin'

            filename = f"{uuid.uuid4().hex}.{ext}.enc"
            path = default_storage.save(filename, ContentFile(raw))
            url = default_storage.url(path)
            # Broadcast file metadata
            event = {
                'type': 'chat_message',
                'user': self.username,
                'file': {
                    'url': url,
                    'name': orig_name,
                    'type': file_info.get('type', ''),
                    'iv_length': len(iv),
                },
                'timestamp': timezone.now().isoformat(),
            }
            await self.channel_layer.group_send(self.room_group_name, event)
            return

        # Encrypted text payload
        if 'iv' in data and 'ct' in data:
            # Check rate limit
            if not await self._check_rate_limit():
                await self._send_rate_limit_warning()
                return
                
            event = {
                'type': 'chat_message',
                'user': self.username,
                'iv': data['iv'],
                'ct': data['ct'],
                'timestamp': timezone.now().isoformat(),
            }
            await self.channel_layer.group_send(self.room_group_name, event)
            return

        # Plaintext message payload
        content = data.get('message', '').strip()
        if content:
            # Check rate limit
            if not await self._check_rate_limit():
                await self._send_rate_limit_warning()
                return
                
            # Reset typing indicator if sending a message
            if self.typing:
                self.typing = False
                if self.typing_task and not self.typing_task.done():
                    self.typing_task.cancel()
                    
                # Update presence back to online
                if self.room_name in PRESENCE_CACHE and self.username in PRESENCE_CACHE[self.room_name]:
                    PRESENCE_CACHE[self.room_name][self.username]['status'] = 'online'

            msg = await self.create_message(self.room, self.scope['user'] if self.scope['user'].is_authenticated else None, content)
            event = {
                'type': 'chat_message',
                'user': self.username,
                'message': msg.content,
                'timestamp': msg.timestamp.isoformat(),
            }
            await self.channel_layer.group_send(self.room_group_name, event)

    async def chat_message(self, event):
        # Build the payload to send back
        payload = {
            'user': event['user'],
            'timestamp': event['timestamp'],
        }
        # Include text or file or encrypted fields
        if 'message' in event:
            payload['message'] = event['message']
        if 'iv' in event and 'ct' in event:
            payload['iv'] = event['iv']
            payload['ct'] = event['ct']
        if 'file' in event:
            payload['file'] = event['file']

        await self.send(text_data=json.dumps(payload))
        
    async def presence_update(self, event):
        """
        Handle presence updates (online/offline/typing)
        """
        payload = {
            'type': 'presence_update',
            'user': event['user'],
            'status': event['status'],
            'timestamp': event['timestamp'],
        }
        await self.send(text_data=json.dumps(payload))

    @database_sync_to_async
    def get_or_create_room(self, room_name):
        return ChatRoom.objects.get_or_create(name=room_name)

    @database_sync_to_async
    def get_last_messages(self, room, limit):
        qs = ChatMessage.objects.filter(room=room).select_related('user')
        latest = qs.order_by('-timestamp')[:limit]
        result = []
        for msg in reversed(latest):
            result.append({
                'user': msg.user.username if msg.user else 'Anonymous',
                'message': msg.content,
                'timestamp': msg.timestamp.isoformat(),
            })
        return result

    @database_sync_to_async
    def create_message(self, room, user, content):
        return ChatMessage.objects.create(
            room=room,
            user=user if user and user.is_authenticated else None,
            content=content
        )

    def sanitize_input(text):
            # Sanitize any text input to prevent XSS attacks
            if not instance(text, str):
                return ""

                sanitized = html.escape(texr)

                max_length = 2000
                sanitize = sanitized[:max_length]

                return sanitized

        def sanitize_filename(filename):
            # Sanitize file inputs
            if not isinstance(filename, str):
                return "file"

            # Remove file path componenets
            filename = re.sub(r'.*[/\\]', '', filename)
        
            # Only allow certain characters
            filename = re.sub(r'[^a-zA-Z0-9_.-]', '_', filename)
            
            # Ensure filename isn't empty
            if not filename:
                filename = "file"
                
            # Limit length
            max_length = 100
            filename = filename[:max_length]
            
            return filename