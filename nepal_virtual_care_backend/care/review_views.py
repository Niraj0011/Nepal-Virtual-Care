
from django.db import IntegrityError, transaction
from django.utils import timezone

from rest_framework import generics, serializers, status
from rest_framework.permissions import (
    AllowAny,
    IsAdminUser,
    IsAuthenticated,
)
from rest_framework.response import Response

from .models import DoctorReview, DoctorReviewReport
from .serializers import (
    DoctorReviewCreateUpdateSerializer,
    DoctorReviewSerializer,
    DoctorReviewReportCreateSerializer,
    DoctorReviewReportSerializer,
    AdminDoctorReviewReportUpdateSerializer,
)


class PublicDoctorReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorReview
        fields = ("id", "rating", "comment", "created_at")
        read_only_fields = fields


class AdminDoctorReviewModerationSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorReview
        fields = ("moderation_status", "moderation_note")

    def validate_moderation_status(self, value):
        if value not in ("Approved", "Rejected"):
            raise serializers.ValidationError(
                "A review can only be published or hidden."
            )
        return value

    def validate_moderation_note(self, value):
        return value.strip()

    def validate(self, attrs):
        moderation_status = attrs.get(
            "moderation_status",
            self.instance.moderation_status,
        )
        moderation_note = attrs.get(
            "moderation_note",
            self.instance.moderation_note,
        )

        if moderation_status == "Rejected" and not moderation_note.strip():
            raise serializers.ValidationError({
                "moderation_note": (
                    "Please provide a reason when hiding a review."
                )
            })

        return attrs


def is_patient_user(user):
    return (
        user.is_authenticated
        and not user.is_staff
        and not user.is_superuser
        and not hasattr(user, "doctor_profile")
    )


class PublicDoctorReviewListView(generics.ListAPIView):
    serializer_class = PublicDoctorReviewSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return (
            DoctorReview.objects
            .filter(
                provider_id=self.kwargs["provider_id"],
                moderation_status="Approved",
            )
            .order_by("-created_at")
        )


class PatientDoctorReviewListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not is_patient_user(self.request.user):
            return DoctorReview.objects.none()

        return (
            DoctorReview.objects
            .filter(patient=self.request.user)
            .select_related("provider", "appointment", "patient")
            .order_by("-created_at")
        )

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DoctorReviewCreateUpdateSerializer
        return DoctorReviewSerializer

    def list(self, request, *args, **kwargs):
        if not is_patient_user(request.user):
            return Response(
                {"detail": "Only patients can access their reviews."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        if not is_patient_user(request.user):
            return Response(
                {"detail": "Only patients can submit reviews."},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                review = serializer.save()
        except IntegrityError:
            return Response(
                {
                    "detail": (
                        "You have already reviewed this consultation. "
                        "You can edit your existing review instead."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = DoctorReviewSerializer(
            review,
            context=self.get_serializer_context(),
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class PatientDoctorReviewDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated]
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self):
        if not is_patient_user(self.request.user):
            return DoctorReview.objects.none()

        return (
            DoctorReview.objects
            .filter(patient=self.request.user)
            .select_related("provider", "appointment", "patient")
        )

    def get_serializer_class(self):
        if self.request.method == "PATCH":
            return DoctorReviewCreateUpdateSerializer
        return DoctorReviewSerializer

    def retrieve(self, request, *args, **kwargs):
        if not is_patient_user(request.user):
            return Response(
                {"detail": "Only patients can access their reviews."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().retrieve(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not is_patient_user(request.user):
            return Response(
                {"detail": "Only patients can edit their reviews."},
                status=status.HTTP_403_FORBIDDEN,
            )

        instance = self.get_object()
        serializer = self.get_serializer(
            instance,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        review = serializer.save()

        response_serializer = DoctorReviewSerializer(
            review,
            context=self.get_serializer_context(),
        )
        return Response(response_serializer.data)


class DoctorReviewReportCreateView(generics.CreateAPIView):
    serializer_class = DoctorReviewReportCreateSerializer
    permission_classes = [IsAuthenticated]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                report = serializer.save()
        except IntegrityError:
            return Response(
                {"detail": "You have already reported this review."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = DoctorReviewReportSerializer(
            report,
            context=self.get_serializer_context(),
        )

        return Response(
            response_serializer.data,
            status=status.HTTP_201_CREATED,
        )


class AdminDoctorReviewListView(generics.ListAPIView):
    serializer_class = DoctorReviewSerializer
    permission_classes = [IsAdminUser]

    queryset = (
        DoctorReview.objects
        .select_related(
            "patient",
            "provider",
            "appointment",
            "moderated_by",
        )
        .order_by("-created_at")
    )


class AdminDoctorReviewModerationView(generics.RetrieveUpdateAPIView):
    serializer_class = AdminDoctorReviewModerationSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "patch", "head", "options"]

    queryset = DoctorReview.objects.all()

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .select_related("patient", "provider", "appointment")
        )

    def perform_update(self, serializer):
        serializer.save(
            moderated_by=self.request.user,
            moderated_at=timezone.now(),
        )


class AdminDoctorReviewReportListView(generics.ListAPIView):
    serializer_class = DoctorReviewReportSerializer
    permission_classes = [IsAdminUser]

    queryset = (
        DoctorReviewReport.objects
        .select_related(
            "review",
            "review__patient",
            "review__provider",
            "reporter",
            "reviewed_by",
        )
        .order_by("status", "-created_at")
    )


class AdminDoctorReviewReportDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = AdminDoctorReviewReportUpdateSerializer
    permission_classes = [IsAdminUser]
    http_method_names = ["get", "patch", "head", "options"]

    queryset = DoctorReviewReport.objects.all()

    def perform_update(self, serializer):
        status_value = serializer.validated_data.get(
            "status",
            serializer.instance.status,
        )

        if status_value == "Reviewed":
            serializer.save(
                reviewed_by=self.request.user,
                reviewed_at=timezone.now(),
            )
        else:
            serializer.save(
                reviewed_by=None,
                reviewed_at=None,
            )
