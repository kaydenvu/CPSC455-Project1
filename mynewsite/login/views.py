from django.shortcuts import render, redirect
from django.contrib.auth import login, authenticate
from django.http import HttpResponse
from django.core.cache import cache

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
    7. Handles user login with basic rate limiting:
        - Allows 5 failed login attempts per IP address within 1 minute.
        - Shows alert and redirects after failure or success.
    8. Renders the login page with an error message if the credentials are invalid.
    9. Renders the login page with a random fact for GET requests.

    """

    if request.user.is_authenticated:
        return redirect('/chat')

    # Get client IP address
    ip = request.META.get('REMOTE_ADDR')
    rate_limit_key = f"login_attempts_{ip}"
    attempts = cache.get(rate_limit_key, 0)

    if attempts >= 5:
        # Redirect to login page if the rate limit is reached
        return HttpResponse("""
            <script>
                alert('Too many failed attempts. Please try again later.');
                setTimeout(function() {
                    window.location.href = '/login';
                }, 100);
            </script>
        """)

    if request.method == "POST":
        username = request.POST.get("username")
        password = request.POST.get("password")
        user = authenticate(username=username, password=password)

        if user is not None:
            login(request, user)
            # Reset the failed attempts on successful login
            cache.delete(rate_limit_key)
            return redirect("/chat")
        else:
            # Increment failed attempt count
            attempts += 1
            remaining_attempts = 5 - attempts
            cache.set(rate_limit_key, attempts, timeout=60)  # 1 minute

            return HttpResponse(f"""
                <script>
                    alert('Invalid credentials! You have {remaining_attempts} attempts left.');
                    setTimeout(function() {{
                        window.location.href = '/login';
                    }}, 100);
                </script>
            """)

    return render(request, "login.html")
