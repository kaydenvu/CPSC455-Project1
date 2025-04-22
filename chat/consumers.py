from channels.generic.websocket import AsyncWebsocketConsumer
import json
import os
from datetime import datetime

# Dictionary to track users per room
active_users = {}

# Log file location (can be adjusted to the path you prefer)
LOG_FILE_PATH = 'chat_logs.txt'

def log_message(room_name, user_name, message):
    """Function to log the message with a timestamp to a text file."""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    log_message = f"[{timestamp}] {room_name} - {user_name}: {message}\n"
    
    # Ensure the file exists and append the message to it
    with open(LOG_FILE_PATH, 'a') as log_file:
        log_file.write(log_message)

class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_name = self.scope['url_route']['kwargs']['room_name']
        self.room_group_name = f'chat_{self.room_name}'

        # Get the authenticated username, or assign 'Anonymous' if not logged in
        self.user_name = self.scope["user"].username if self.scope["user"].is_authenticated else "Anonymous"

        # Initialize the room in active_users if not exists
        if self.room_group_name not in active_users:
            active_users[self.room_group_name] = []

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

        # Log this event to the file
        log_message(self.room_name, 'System', f'{self.user_name} has joined the chat!')

    async def disconnect(self, close_code):
        # Remove user from active users list
        if self.room_group_name in active_users and self.user_name in active_users[self.room_group_name]:
            active_users[self.room_group_name].remove(self.user_name)

        # Remove user from the WebSocket group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        # Log this event to the file
        log_message(self.room_name, 'System', f'{self.user_name} has left the chat.')

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

        # Log the message to the file
        log_message(self.room_name, self.user_name, message)

    async def chat_message(self, event):
        message = event['message']

        # Send message to WebSocket client
        await self.send(text_data=json.dumps({
            'message': message
        }))
