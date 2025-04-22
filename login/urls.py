from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    path('', views.Login, name='login'),
]