from django.contrib import admin
from .models import UserProfile, Keys

admin.site.register(UserProfile)
admin.site.register(Keys)

from .models import ChatRoom, ChatMessage

@admin.action(description="Clear chat logs for selected rooms")
def clear_messages(modeladmin, request, queryset):
    total_deleted = 0
    for room in queryset:
        deleted, _ = ChatMessage.objects.filter(room=room).delete()
        total_deleted += deleted
    modeladmin.message_user(
        request,
        f"🚮 Cleared {total_deleted} messages from {queryset.count()} room(s)."
    )

@admin.register(ChatRoom)
class ChatRoomAdmin(admin.ModelAdmin):
    list_display = ("name",)
    actions = [clear_messages]