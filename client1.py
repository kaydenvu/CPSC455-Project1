import asyncio
import websockets


async def hello(websocket):
    # Send a message to the server
    await websocket.send("Hello from Client 1!")

    # Receive the server's response
    response = await websocket.recv()
    print(f"Client 1 received: {response}")



async def communicate(websocket):
    # Start a loop to allow continuous communication
    while True:
        # Send message to the server
        message = input("Client 1: Enter message to send (or 'exit' to quit): ")
        if message.lower() == 'exit':
            print("Client 1: Closing connection.")
            break
        await websocket.send(message)
        
        # Receive the server's response
        response = await websocket.recv()
        print(f"Client 1 received: {response}")



async def main():
    uri = "ws://localhost:8765"  # Server URI
    try:
        async with websockets.connect(uri) as websocket:
            print("Client 1 connected to the server!")
            await hello(websocket)  # Send a hello message
            await communicate(websocket)  # Begin continuous communication
    except Exception as e:
        print(f"Error in Client 1: {e}")

# Run the client
asyncio.run(main())
