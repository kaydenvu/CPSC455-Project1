from django.shortcuts import render,redirect
from django.http import HttpResponse


def index(request):
    if not request.user.is_authenticated:
        HttpResponse("<script>alert('You are not logged in!'); window.location.href='/';</script>")
        return redirect('/')  # Redirect to homepage if not authenticated
    return render(request, "chat/index.html")


def room(request, room_name):
    if not request.user.is_authenticated:
        return redirect('/')  # Redirect to homepage if not authenticated
    return render(request, "chat/room.html", {"room_name": room_name})