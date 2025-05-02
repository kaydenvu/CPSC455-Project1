# chat/views.py
import json
from django.shortcuts import render, redirect
from django.utils import timezone
from django.http import JsonResponse 
from datetime import timedelta
from .models import ChatRoom, Keys

DEFAULT_ROOMS = ['room1', 'room2', 'room3']
ROOMS = list(DEFAULT_ROOMS)

# Initialize LAST_ACTIVE with timezone-aware timestamps
LAST_ACTIVE = {
    room: timezone.now()
    for room in DEFAULT_ROOMS
}

INACTIVITY_THRESHOLD = timedelta(minutes=1)

def prune_rooms():
    now = timezone.now()
    for room in list(ROOMS):
        if room in DEFAULT_ROOMS:
            continue
        last = LAST_ACTIVE.get(room)
        # both now and last are aware → subtraction works
        if not last or (now - last) > INACTIVITY_THRESHOLD:
            ROOMS.remove(room)
            LAST_ACTIVE.pop(room, None)

def index(request):
    if not request.user.is_authenticated:
        return redirect('/')
    prune_rooms()
    return render(request, "chat/index.html", {"rooms": ROOMS})

def room(request, room_name):
    if not request.user.is_authenticated:
        return redirect('/')
    prune_rooms()
    # record activity with an aware datetime
    LAST_ACTIVE[room_name] = timezone.now()
    if room_name not in ROOMS:
        ROOMS.append(room_name)
    return render(request, "chat/room.html", {
        "room_name": room_name,
        "rooms": ROOMS,
    })


def room_keys(request):
    room_name = request.GET.get('room')
    if not room_name:
        return JsonResponse({"error": "Missing room parameter"}, status=400)

    try:
        ChatRoom.objects.get(name=room_name)
    except ChatRoom.DoesNotExist:
        return JsonResponse({"error": "Unknown room"}, status=404)

    # Grab all Keys records (or filter by room membership if you prefer)
    qs = Keys.objects.select_related('user').all()
    data = []
    for k in qs:
        try:
            jwk_obj = json.loads(k.public_key)  # parse the stored JSON string
        except ValueError:
            # if it's already a dict/string parse failed, just skip or handle
            continue
        data.append({
            "user":       k.user.username,
            "public_key": jwk_obj,
        })

    return JsonResponse(data, safe=False)