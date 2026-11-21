
from rest_framework import serializers
from .models import HealthResource


class HealthResourceSerializer(serializers.ModelSerializer):
    class Meta:
        model = HealthResource
        fields = [
            "id",
            "tag",
            "title",
            "description",
            "is_published",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "created_at",
        ]
