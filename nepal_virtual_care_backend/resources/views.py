
from rest_framework import generics, permissions

from .models import HealthResource
from .serializers import HealthResourceSerializer


class HealthResourceListCreateView(generics.ListCreateAPIView):
    serializer_class = HealthResourceSerializer

    def get_queryset(self):
        queryset = HealthResource.objects.all()

        # Administrators can see all resources.
        # Other visitors only see published resources.
        if not (
            self.request.user.is_authenticated
            and self.request.user.is_staff
        ):
            queryset = queryset.filter(is_published=True)

        return queryset

    def get_permissions(self):
        if self.request.method == "GET":
            return [permissions.AllowAny()]

        return [permissions.IsAdminUser()]
