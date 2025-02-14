# WebSocket Server-Client Application
This project consists of a WebSocket server and two client applications that communicate with the server asynchronously using Python's websockets library.
## Prerequisites
Ensure you have [Python](https://www.python.org/downloads/) installed on your system.
Install the required websockets library using:
```
pip install websockets
```
## Cloning the Repository
To get a copy of this project on your local machine, follow these steps:
1. Open a terminal or command prompt.
2. Navigate to the directory where you want to clone the repository.
3. Run the following command:
```
git clone https://github.com/kaydenvu/CPSC455-Project1
```

## Files Overview
* server.py - The WebSocket server that listens for client connections and echoes received messages.
* client1.py - The first client application that connects to the server and sends/receives messages.
* client2.py - The second client application, similar to client1.py, demonstrating multiple client support.

## Running the Application

### 1. Start the Server
First, run the WebSocket server:
```
python server.py
```
You should see an output indicating the server has started:
```
Server started on ws://localhost:8765
```

### 2. Start Clients
In separate terminal windows, run each client.
#### Client 1:
```bash
python client1.py
```
#### Client 2:
```bash
python client2.py
```
Once connected, each client will send an initial "Hello" message to the server and receive an echoed response.

### 3. Sending Messages

After the initial connection, each client can send messages to the server via the terminal. The server will echo the messages back.\
Example interaction in a client terminal:
```
Client 1: Enter message to send (or 'exit' to quit): Hello, Server!
Client 1 received: Hello, Server!
```
To exit the client, type <mark>exit</mark>.

### 4. Stopping the Server
To stop the server, use <mark>Ctrl+C</mark> in the terminal where the server is running.
