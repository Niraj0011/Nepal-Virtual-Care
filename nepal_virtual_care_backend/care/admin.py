from django.contrib import admin
from .models import Provider, Appointment
@admin.register(Provider)
class ProviderAdmin(admin.ModelAdmin):
    list_display = ("name", "specialty", "city", "is_active", "is_demo")
    list_filter = ("specialty", "city", "is_active")
    search_fields = ("name", "specialty", "city")
@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("patient", "provider", "preferred_date", "status")
    list_filter = ("status", "consultation_type")
