<img width="462" height="368" alt="Screenshot 2025-08-29 at 6 50 40 PM" src="https://github.com/user-attachments/assets/a3835e04-4966-4795-ac3b-35a1b43eac92" />

<img width="840" height="617" alt="Screenshot 2025-08-29 at 6 55 18 PM" src="https://github.com/user-attachments/assets/d465c963-67d5-47f8-b39f-210813aef389" />
<img width="913" height="252" alt="Screenshot 2025-08-29 at 6 58 43 PM" src="https://github.com/user-attachments/assets/3a920464-05b6-48dd-b890-3a295a4cb66c" />


https://github.com/user-attachments/assets/d405d2e0-eac2-4b86-a639-7c7a27014659






# WebSocket Server-Client Application
This project consists of a WebSocket server built with Django Channels for client applications that communicate with the server asynchronously.
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
