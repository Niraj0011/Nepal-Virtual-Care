
from django.contrib import admin

from .models import (
    AccountSession,
    ConsentPreference,
    PatientProfile,
)


admin.site.register(PatientProfile)
admin.site.register(ConsentPreference)


@admin.register(AccountSession)
class AccountSessionAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "device_label",
        "browser_name",
        "operating_system",
        "created_at",
        "last_activity_at",
        "expires_at",
        "revoked_at",
    )

    list_filter = (
        "device_type",
        "browser_name",
        "operating_system",
        "revoked_at",
    )

    search_fields = (
        "user__email",
        "user__username",
        "device_label",
        "ip_address",
    )

    readonly_fields = (
        "id",
        "user",
        "device_id_hash",
        "device_label",
        "browser_name",
        "operating_system",
        "device_type",
        "ip_address",
        "location_label",
        "created_at",
        "last_activity_at",
        "expires_at",
        "revoked_at",
        "revoked_reason",
    )

    ordering = ("-last_activity_at",)

    def has_add_permission(self, request):
        return False
