from django.db import models
from django.contrib.auth.models import User
from django.conf import settings

class UserProfile(models.Model):
    id = models.AutoField(primary_key=True, unique=True, editable=False, blank=True)
    user = models.OneToOneField(User, on_delete=models.CASCADE, default=None, null=True, blank=True)
    username = models.CharField(max_length=20, unique=True)
    online = models.IntegerField(default=0)
    online_for = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True)
    
    def __str__(self):
        return f"{self.username}"

#Store E2EE keys
class Keys(models.Model):
    id = models.AutoField(primary_key=True, unique=True, editable=False, blank=True)
    user = models.ForeignKey(UserProfile, on_delete=models.CASCADE)
    public_key = models.TextField()
    
    class Meta:
        verbose_name_plural = "Keys"

    def __str__(self):
        return f"{self.user}"
# Store room keys
class RoomKey(models.Model):
    room = models.ForeignKey(
        "ChatRoom",
        on_delete=models.CASCADE,
        related_name="keys"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="room_keys"
    )
    public_key = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("room", "user")
        ordering = ("-created_at",)

    def __str__(self):
        return f"{self.user.username} @ {self.room.name}"

class ChatRoom(models.Model):
    name = models.CharField(max_length=255, unique=True)

    def __str__(self):
        return self.name


class ChatMessage(models.Model):
    room      = models.ForeignKey(ChatRoom,
                                  related_name='messages',
                                  on_delete=models.CASCADE)
    user      = models.ForeignKey(User,
                                  null=True,
                                  blank=True,
                                  on_delete=models.SET_NULL)
    content   = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['timestamp']         # always return messages in chronological order

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.user or 'Anonymous'}: {self.content[:20]}…"