from channels.generic.websocket import AsyncWebsocketConsumer
import json

# Dictionary to track users per room
active_users = {}

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'

        # Initialize the room in active_users if not exists
        if self.room_group_name not in active_users:
            active_users[self.room_group_name] = []

        # Assign user number based on current count
        user_number = len(active_users[self.room_group_name]) + 1
        self.user_name = f'User{user_number}'
        
        # Store the user in the active users list
        active_users[self.room_group_name].append(self.user_name)

        # Add user to the WebSocket group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        # Notify others in the chat
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message': f'{self.user_name} has joined the chat!'
            }
        )

    async def disconnect(self, close_code):
        # Remove user from active users list
        if self.room_group_name in active_users and self.user_name in active_users[self.room_group_name]:
            active_users[self.room_group_name].remove(self.user_name)

        # Remove user from the WebSocket group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        data = json.loads(text_data)
        message = data['message']

        # Send message to everyone in the room
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message',
                'message': f'{self.user_name}: {message}'
            }
        )

    async def chat_message(self, event):
        message = event['message']

        # Send message to WebSocket client
        await self.send(text_data=json.dumps({
            'message': message
        }))
