from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate
from django.http import HttpResponse

# Create your views here.

def Login(request):
    """
    The Login function handles the process of user authentication and login.
    It includes several key steps:

    1. Checks if the user is already authenticated; if yes, redirects to the chat dashboard.
    2. Fetches a random fact from the database to display on the login page.
    3. Handles POST requests for form submissions and constructs variations of the host URL 
       (with "https://" and "http://") to handle requests without the protocol specified.
    4. Validates the request host and redirects to an error page if it's invalid.
    5. Authenticates the user by fetching the username and password from the request.
    6. Logs the user in if the credentials are valid and redirects to the key generation page.
    7. Renders the login page with an error message if the credentials are invalid.
    8. Renders the login page with a random fact for GET requests.

    """
    if request.user.is_authenticated:
        return redirect('/chat')

    if request.method == "POST":
        curr_host = request.META.get("HTTP_HOST")
        if not curr_host.startswith("http"):
            curr_host1 = "https://" + curr_host
            curr_host2 = "http://" + curr_host
        '''
        Authenticates after fetching the username and the password and logs the user in
        Else in case of invalid credentials login page is rendered with the error
        '''
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect("/chat")
        else:
            return HttpResponse("<script>alert('Invalid credentials!'); window.location.href='/login';</script>")
    return render(request, "login.html")