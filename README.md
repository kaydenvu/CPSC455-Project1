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
python -m venv mynewsite
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
4. Install the required dependencies:
```
pip install -r requirements.txt
```

## Running the Application

### 1. Start the Server
To start the Django development server and enable WebSocket communication, run:
```
python manage.py runserver
```
Then, open your browser and go to ``` http://127.0.0.1:8000 ``` to access the application.


### 4. Stopping the Server
To stop the server, use <mark>Ctrl+C</mark> in the terminal where the server is running.
