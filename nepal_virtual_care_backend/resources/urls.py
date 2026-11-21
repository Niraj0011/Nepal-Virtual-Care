
from django.urls import path

from .views import HealthResourceListCreateView


urlpatterns = [
    path(
        "",
        HealthResourceListCreateView.as_view(),
        name="health-resources",
    ),
]
