from django.urls import path
from . import views

app_name = 'accounts'

urlpatterns = [
    # URL for the signup page
    path('', views.Signup, name='signup'),
]