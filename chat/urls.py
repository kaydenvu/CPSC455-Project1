from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("<str:room_name>/", views.room, name="room"),
    path("clear_logs/<str:room_name>/", views.clear_room_logs, name="clear_room_logs"),
    path('api/keys/', views.room_keys, name='room-keys'),
    path("api/upload-b2/", views.upload_to_b2, name="upload-b2"),
    path("api/download-b2/<str:b2_key>/", views.download_from_b2, name="download-b2"),
]