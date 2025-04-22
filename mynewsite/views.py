from django.shortcuts import render, redirect

def Home(request):
    # Check if the user is authenticated; if so, redirect to the dashboard
    if request.user.is_authenticated:
        return redirect('/chat')
    return render(request, "home.html")