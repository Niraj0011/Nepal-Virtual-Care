from django.contrib import admin
from .models import PatientProfile, ConsentPreference
admin.site.register(PatientProfile)
admin.site.register(ConsentPreference)
