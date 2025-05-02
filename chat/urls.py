from django.urls import path

from . import views

urlpatterns = [
    path("", views.index, name="index"),
    path("<str:room_name>/", views.room, name="room"),
    path("clear_logs/<str:room_name>/", views.clear_room_logs, name="clear_room_logs"),
    path('api/keys/', views.room_keys, name='room-keys'),
]