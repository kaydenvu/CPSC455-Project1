from django.db import models
from django.contrib.auth.models import User

class user_type(models.Model):

    user = models.OneToOneField(User, on_delete=models.CASCADE)
    type = models.CharField(max_length=255)

    def __str__(self):
        return self.type