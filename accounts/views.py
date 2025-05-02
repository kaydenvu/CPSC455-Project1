from django.shortcuts import render, redirect
from django.http import JsonResponse, HttpResponse
from accounts.forms import SignUpForm
from chat.models import UserProfile, Keys
from accounts.models import user_type
from django.views.decorators.csrf import csrf_exempt
from mynewsite.settings import TRUSTED_DOMAINS as domain

@csrf_exempt
def Signup(request):
    """
    The Signup function handles user registration for the system.
    It includes several key steps:

    1. Checks if the user is already authenticated; if so, redirects to the dashboard.
    2. Retrieves a random fact to display on the signup page.
    3. Processes the POST request to create a new user:
        a. Verifies the request's host.
        b. Copies and modifies the POST data to include a dummy email address.
        c. Validates the signup form.
        d. If valid, saves the new user and associated profile and user type.
        e. If invalid, returns an error message.
    4. Renders the signup page with a random fact if the request method is not POST.
    """

    # Check if the user is authenticated; if so, redirect to the dashboard
    if request.user.is_authenticated:
        return redirect('/chat')

    # Process the POST request to create a new user
    if request.method == "POST":
        # Get the current host
        curr_host = request.META.get("HTTP_HOST")
        # Ensure the host starts with "http"
        if not curr_host.startswith("http"):
            curr_host1 = "https://" + curr_host
            curr_host2 = "http://" + curr_host
        # Check if the host matches the domain
        #if curr_host1 != domain and curr_host2 != domain:
        #    return HttpResponse("<script>alert('Invalid Request!'); window.location.href='/login';</script>")
        # Copy the POST data and modify the email field
        data = request.POST.copy()
        request.POST = data
        # Create the signup form with the modified POST data
        form = SignUpForm(request.POST)

        # Validate the form
        if form.is_valid():
            # Get the form data
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get("password1")
            # Save the new user
            user = form.save()
            # Create and save the user's profile
            profile = UserProfile(username=username)
            profile.save()
            # Grab the generated public_key JWK from the hidden field
            public_key_jwk = request.POST.get("public_key")
            if public_key_jwk:
                Keys.objects.create(user=profile, public_key=public_key_jwk)
            # Create and save the user type
            user_type_obj = user_type(user=user, type="regular")
            user_type_obj.save()
            # Redirect to the login page
            return redirect("/login")
        else:
            # If the form is invalid, return an error message
            return HttpResponse(
                "<script>alert('Please enter valid details!'); window.location.href='/register';</script>")
    return render(request, "registration/signup.html")


def UsernameCheck(request):
    """
    The UsernameCheck function handles AJAX requests to check if a username is available.
    It includes several key steps:

    1. Processes the GET request to check username availability.
    2. Checks if the username exists in the database.
    3. If the username exists, checks if the current authenticated user is the owner of the username.
    4. Returns a JSON response indicating the availability of the username.
    """

    # Process the GET request to check username availability
    if request.method == "GET":
        username = request.GET.get("username")
        user_self = False

        # Check if the username exists in the database
        if UserProfile.objects.filter(username=username).exists():
            # If the user is authenticated, check if they own the username
            if request.user.is_authenticated:
                if request.user.username == username:
                    user_self = True
            # Return a JSON response indicating the username is taken
            return JsonResponse({
                "status": "ok",
                "available": False,
                "self": user_self
            })
        else:
            # Return a JSON response indicating the username is available
            return JsonResponse({
                "status": "ok",
                "available": True,
                "self": user_self
            })

    # Return a JSON response indicating an error if the request method is not GET
    return JsonResponse({
        "status": "error",
        "available": False
    })
