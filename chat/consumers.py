import json
import base64
import uuid
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage

from .models import ChatRoom, ChatMessage

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name       = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f"chat_{self.room_name}"

        # Ensure the chat room exists
        self.room, _ = await self.get_or_create_room(self.room_name)

        # Join the channel group
        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

        # Send last 50 messages (they come back as dicts)
        last_messages = await self.get_last_messages(self.room, 50)
        for msg_dict in last_messages:
            await self.send(text_data=json.dumps(msg_dict))

        # Announce that a user has joined
        username = (self.scope['user'].username
                    if self.scope['user'].is_authenticated else 'Anonymous')
        join_event = {
            'type':      'chat_message',
            'user':      'System',
            'message':   f"{username} has joined the chat.",
            'timestamp': timezone.now().isoformat(),
        }
        self.heartbeat_task = asyncio.create_task(self._send_heartbeat())
        await self.channel_layer.group_send(self.room_group_name, join_event)


    async def disconnect(self, close_code):
        self.heartbeat_task.cancel()
        # Leave the group
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

        # Announce leave
        user = self.scope['user'] if self.scope['user'].is_authenticated else None
        username = user.username if user else 'Anonymous'
        leave_event = {
            'type': 'chat_message',
            'user': 'System',
            'message': f"{username} has left the chat.",
            'timestamp': timezone.now().isoformat(),
        }
        await self.channel_layer.group_send(self.room_group_name, leave_event)
    async def _send_heartbeat(self):
        """
        Every 30s send a lightweight heartbeat frame so
        the client (and any NAT/PTP routers) know we're alive.
        """
        try:
            while True:
                await asyncio.sleep(30)
                await self.send(text_data=json.dumps({
                    "type": "ping",
                    "timestamp": timezone.now().isoformat()
                }))
        except asyncio.CancelledError:
            # normal on disconnect
            pass
    async def receive(self, text_data):
        data = json.loads(text_data)
        if data.get("type") == "ping":
            return
        user = self.scope['user'] if self.scope['user'].is_authenticated else None
        username = user.username if user else 'Anonymous'
        ts = timezone.now().isoformat()

        # File upload payload (encrypted file)
        if 'file' in data:
            file_info = data['file']
            iv_b64 = file_info.get('iv')
            ct_b64 = file_info.get('ct')
            if not iv_b64 or not ct_b64:
                return
            # Decode and store encrypted blob
            iv = base64.b64decode(iv_b64)
            ct = base64.b64decode(ct_b64)
            raw = iv + ct
            # Generate unique filename
            orig_name = file_info.get('name', 'file')
            ext = orig_name.split('.')[-1]
            filename = f"{uuid.uuid4().hex}.{ext}.enc"
            path = default_storage.save(filename, ContentFile(raw))
            url = default_storage.url(path)
            # Broadcast file metadata
            event = {
                'type': 'chat_message',
                'user': username,
                'file': {
                    'url': url,
                    'name': orig_name,
                    'type': file_info.get('type', ''),
                    'iv_length': len(iv),
                },
                'timestamp': ts,
            }
            await self.channel_layer.group_send(self.room_group_name, event)
            return

        # Encrypted text payload
        if 'iv' in data and 'ct' in data:
            event = {
                'type': 'chat_message',
                'user': username,
                'iv': data['iv'],
                'ct': data['ct'],
                'timestamp': ts,
            }
            await self.channel_layer.group_send(self.room_group_name, event)
            return

        # Plaintext message payload
        content = data.get('message', '').strip()
        if content:
            msg = await self.create_message(self.room, user, content)
            event = {
                'type': 'chat_message',
                'user': username,
                'message': msg.content,
                'timestamp': msg.timestamp.isoformat(),
            }
            await self.channel_layer.group_send(self.room_group_name, event)
            
    async def _send_heartbeat(self):
        try:
            while True:
                await asyncio.sleep(30)
                await self.send(json.dumps({"type":"heartbeat"}))
        except asyncio.CancelledError:
            pass

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
