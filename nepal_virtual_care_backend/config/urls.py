
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health_check(request):
    return Response({
        "status": "ok",
        "service": "Nepal Virtual Care API",
    })


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health_check),
    path("api/auth/", include("accounts.urls")),
    path("api/", include("care.urls")),
    path("api/community/", include("community.urls")),
    path("api/resources/", include("resources.urls")),
]

if settings.DEBUG:
    urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT,
    )
