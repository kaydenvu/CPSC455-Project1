import asyncio
import websockets

# This function should accept both websocket and path arguments
async def echo(websocket):
    print(f"Client connected: {websocket.remote_address}")

    try:
        while True:
            # Wait for a message from the client
            message = await websocket.recv()
            print(f"Received message: {message}")
            # Send the message back to the client (echo server)
            await websocket.send(f"{message}")
    except websockets.exceptions.ConnectionClosed:
        print(f"Client disconnected: {websocket.remote_address}")
    except Exception as e:
        print(f"Error: {e}")

# Start the server
async def main():
    try:
        # Set up the WebSocket server to listen on localhost:8765
        async with websockets.serve(echo, "localhost", 8765):
            print("Server started on ws://localhost:8765")
            await asyncio.Future()  # Run forever, serving WebSocket clients
    except Exception as e:
        print(f"Server Error: {e}")

# Run the server
asyncio.run(main())