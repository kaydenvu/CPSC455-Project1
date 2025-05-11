# chat/views.py
import json, io, requests, time, vt
from django.shortcuts import render, redirect
from django.utils import timezone
from django.http import JsonResponse 
from datetime import timedelta
from .models import ChatRoom, RoomKey
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from decouple import config

VT_API_KEY = config('VIRUSTOTAL_API_KEY')

DEFAULT_ROOMS = ['room1', 'room2', 'room3']
ROOMS = list(DEFAULT_ROOMS)

# Initialize LAST_ACTIVE with timezone-aware timestamps
LAST_ACTIVE = {
    room: timezone.now()
    for room in DEFAULT_ROOMS
}

INACTIVITY_THRESHOLD = timedelta(minutes=1)
def is_blob_clean(blob: bytes, timeout: int = 60) -> bool:
    client = vt.Client(VT_API_KEY)
    try:
        analysis = client.scan_file(io.BytesIO(blob),
                                    wait_for_completion=True,
                                    timeout=timeout)
        return analysis.stats['malicious'] == 0
    finally:
        client.close()


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


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def room_keys(request):
    # Expect ?room=<roomName>
    room_name = request.query_params.get("room")
    if not room_name:
        return Response({"detail": "Missing room parameter"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        room = ChatRoom.objects.get(name=room_name)
    except ChatRoom.DoesNotExist:
        return Response({"detail": "Room not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "POST":
        # Remove any existing key for this user in this room
        RoomKey.objects.filter(room=room, user=request.user).delete()
        # Create fresh one
        RoomKey.objects.create(
            room=room,
            user=request.user,
            public_key=request.data.get("public_key", {})
        )
        return Response(status=status.HTTP_201_CREATED)

    # GET: return all keys for this room
    keys = RoomKey.objects.filter(room=room)
    return Response([
        {
            "user":        rk.user.username,
            "public_key":  rk.public_key,
            "created_at":  rk.created_at.isoformat()
        }
        for rk in keys
    ])

from django.contrib.admin.views.decorators import staff_member_required
from django.shortcuts import get_object_or_404, redirect
from django.contrib import messages
from .models import ChatRoom, ChatMessage

@staff_member_required
def clear_room_logs(request, room_name):
    room = get_object_or_404(ChatRoom, name=room_name)
    count, _ = ChatMessage.objects.filter(room=room).delete()
    messages.success(request, f"Cleared {count} messages from '{room_name}'.")
    return redirect("index")

import uuid
from django.views.decorators.csrf import csrf_exempt
from django.http               import JsonResponse, HttpResponseNotAllowed, HttpResponse
from .b2_client                import upload_bytes, download_bytes, make_presigned_b2_url

@csrf_exempt
def upload_to_b2(request):
    if request.method != "POST":
        return HttpResponseNotAllowed(["POST"])
    f = request.FILES.get("file")
    if not f:
        return JsonResponse({"error": "No file provided"}, status=400)

    data = f.read()

    try:
        clean = is_blob_clean(data)
    except Exception:
        clean = True  # or True if you’d rather allow on API failure

    if not clean:
        return JsonResponse(
            {"error": "Malicious content detected—upload blocked."},
            status=400
        )
    
    b2_key      = f"{uuid.uuid4().hex}_{f.name}"
    result = upload_bytes(data, b2_key)
    download_url = make_presigned_b2_url(b2_key, valid_seconds=3600)
    
    return JsonResponse({
        "b2_key":       b2_key,
        "file_id":      result.id_,
        "file_name":    result.file_name,
        "content_sha1": result.content_sha1,
        "download_url": download_url,
    })


def download_from_b2(request, b2_key):
    """
    Streams the file back with the original Content-Type header.
    """
    try:
        raw = download_bytes(b2_key)
    except Exception:
        return HttpResponse(status=404)
    response = HttpResponse(raw, content_type="application/octet-stream")
    response["Content-Disposition"] = f'attachment; filename="{b2_key.split("_",1)[1]}"'
    return response