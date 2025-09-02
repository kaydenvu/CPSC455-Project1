## 🔐 Login to CoffeeChat App: https://coffeechat.secure-tech.org/
> Built using **Django**, **WebSockets**, and **MySQL**, hosted 24/7 for reliable access.

Welcome to **CoffeeChat**, a fully encrypted, real-time chat platform designed with privacy, performance, and usability in mind.

This login page is your secure gateway into a feature-rich communication environment. After authentication, users gain access to a live messaging interface built on WebSockets and backed by a Django server, with full end-to-end encryption and secure file sharing.

<img width="462" height="368" alt="Screenshot 2025-08-29 at 6 50 40 PM" src="https://github.com/user-attachments/assets/a3835e04-4966-4795-ac3b-35a1b43eac92" />

---
> ✅ **Login Required**  
Please enter your credentials to continue. If you don’t have an account yet, head over to the [Registration Page](#) to get started.
---
### ✨ Features Available After Login:

- **🔐 End-to-End Encrypted Messaging**  
  Messages are encrypted on the client-side before transmission and stored as encrypted blobs on the server. Only the intended recipient can decrypt and read them.

- **🛡️ Secure Authentication**  
  Login is protected by:
  - Strict password policy
  - Password hashing
  - Input sanitization
  - Brute-force protection
  - Rate limiting
 

<img width="913" height="252" alt="Screenshot 2025-08-29 at 6 58 43 PM" src="https://github.com/user-attachments/assets/3a920464-05b6-48dd-b890-3a295a4cb66c" />

https://github.com/user-attachments/assets/d405d2e0-eac2-4b86-a639-7c7a27014659



- **💬 Real-Time Chat via WebSockets**  
  Chat with friends in real time using persistent WebSocket connections. Experience fast delivery, typing indicators, and live updates.

- **🟢 Online/Offline Presence Detection**  
  Know when your contacts are online, offline, or typing using heartbeat ping/pong mechanisms and server-side presence tracking.

- **📎 Encrypted File Sharing**  
  Upload and share files safely. All files are validated client-side and uploaded to secure cloud storage (e.g., Firebase or IPFS), with links scanned using VirusTotal.

- **😊 Emoji Support**  
  Make your chats more expressive with a built-in emoji selector.

- **🌐 24/7 Hosted Infrastructure**  
  Hosted using a combination of InfinityFree (for frontend and APIs), and Render/Vercel (for WebSocket backend), ensuring high availability and fast response times.

  
<img width="840" height="617" alt="Screenshot 2025-08-29 at 6 55 18 PM" src="https://github.com/user-attachments/assets/d465c963-67d5-47f8-b39f-210813aef389" />

---







## Activating on localhost
# WebSocket Server-Client Application
Instead of chatting through the public chat server, you can launch application through the local host 127:0.0.1 IP address. You can chat with another client as long as you share the same network.
## Prerequisites
Ensure you have [Python](https://www.python.org/downloads/) installed on your system.

## Cloning the Repository
To get a copy of this project on your local machine, follow these steps:
1. Open a terminal or command prompt.
2. Navigate to the directory where you want to clone the repository.
3. Run the following command:
```
git clone https://github.com/kaydenvu/CPSC455-Project1
```
## Setup before running the application
1. Open an integrated terminal in the mynewsite directory.
2. Create a virtual environment using the following command in PowerShell:
```
python -m venv venv
```
3. Activate the virtual environment:
- On Windows (PowerShell):
    ```
    mynewsite\Scripts\activate
    ```
- On macOS/Linux:
    ```
    source mynewsite/bin/activate
    ```
4. Install the required dependencies by running this file in the terminal:
```
bash build.sh
```

## Running the Application

### 1. Start the Server
To start the Django development server and enable WebSocket communication, run:
```
python3 manage.py runserver
```
Then, open your browser and go to ``` http://127.0.0.1:8000 ``` to access the application.


### 4. Stopping the Server
To stop the server, use <mark>Ctrl+C</mark> in the terminal where the server is running.
