import asyncio
import websockets

async def hello():
    uri = "ws://localhost:8765"
    async with websockets.connect(uri) as websocket:
        # Send a message to the server
        await websocket.send("Hello from Client 2!")
        # Receive the server's response
        response = await websocket.recv()
        print(f"Client 2 received: {response}")

async def communicate():
    uri = "ws://127.0.0.1:8765"  # Server URI
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to the server!")
            
            # Start a loop to allow continuous communication
            while True:
                # Send message to the server
                message = input("Enter message to send (or 'exit' to quit): ")
                if message.lower() == 'exit':
                    print("Closing connection.")
                    break
                await websocket.send(message)
                
                # Receive the server's response
                response = await websocket.recv()
                print(f"Server response: {response}")

    except Exception as e:
        print(f"Error: {e}")

# Run the client
asyncio.run(hello())
asyncio.run(communicate())