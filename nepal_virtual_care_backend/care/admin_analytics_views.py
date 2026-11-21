
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Appointment,
    DoctorProfile,
    DoctorReview,
)


User = get_user_model()


class AdminAnalyticsView(APIView):
    """
    Admin-only platform analytics.

    Supports optional start_date and end_date query parameters
    in YYYY-MM-DD format.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get(self, request):
        today = timezone.localdate()

        start_value = request.query_params.get("start_date")
        end_value = request.query_params.get("end_date")

        start_date = parse_date(start_value) if start_value else (
            today - timedelta(days=29)
        )
        end_date = parse_date(end_value) if end_value else today

        if start_date is None or end_date is None:
            return Response(
                {
                    "detail": (
                        "Invalid date. Use YYYY-MM-DD format "
                        "for start_date and end_date."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if start_date > end_date:
            return Response(
                {
                    "detail": "The start date cannot be after the end date."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (end_date - start_date).days > 365:
            return Response(
                {
                    "detail": "Please select a date range of one year or less."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Appointments scheduled within the selected date range.
        appointments = Appointment.objects.filter(
            preferred_date__range=(start_date, end_date)
        )

        # Patient accounts exclude staff, administrators and doctors.
        patients = User.objects.filter(
            is_staff=False,
            is_superuser=False,
            doctor_profile__isnull=True,
        )

        active_patients = patients.filter(is_active=True)

        # Doctor accounts and their linked provider profiles.
        doctors = DoctorProfile.objects.select_related(
            "user",
            "provider",
        )

        active_doctors = doctors.filter(
            is_active=True,
            user__is_active=True,
            provider__is_active=True,
        )

        # Appointment status totals.
        appointment_counts = appointments.aggregate(
            total=Count("id"),
            pending=Count(
                "id",
                filter=Q(status="Pending"),
            ),
            confirmed=Count(
                "id",
                filter=Q(status="Confirmed"),
            ),
            completed=Count(
                "id",
                filter=Q(status="Completed"),
            ),
            cancelled=Count(
                "id",
                filter=Q(status="Cancelled"),
            ),
        )

        # Only approved reviews created within the selected period.
        approved_reviews = DoctorReview.objects.filter(
            moderation_status="Approved",
            created_at__date__range=(start_date, end_date),
        )

        # Daily patient registrations.
        registration_data = (
            patients.filter(
                date_joined__date__range=(start_date, end_date)
            )
            .annotate(day=TruncDate("date_joined"))
            .values("day")
            .annotate(total=Count("id"))
            .order_by("day")
        )

        registrations = [
            {
                "date": item["day"].isoformat(),
                "count": item["total"],
            }
            for item in registration_data
        ]

        # Daily appointments grouped by their scheduled date.
        appointment_data = (
            appointments
            .annotate(day=TruncDate("preferred_date"))
            .values("day")
            .annotate(total=Count("id"))
            .order_by("day")
        )

        appointment_trend = [
            {
                "date": item["day"].isoformat(),
                "count": item["total"],
            }
            for item in appointment_data
        ]

        # Doctor performance within the selected date range.
        doctor_performance = []

        for doctor in active_doctors:
            provider = doctor.provider

            doctor_appointments = appointments.filter(
                provider=provider
            )

            doctor_reviews = approved_reviews.filter(
                provider=provider
            )

            review_summary = doctor_reviews.aggregate(
                average_rating=Avg("rating"),
                review_count=Count("id"),
            )

            average_rating = review_summary["average_rating"]

            doctor_performance.append({
                "provider_id": provider.id,
                "doctor_name": provider.name,
                "specialty": provider.specialty,
                "city": provider.city,
                "appointments": doctor_appointments.count(),
                "completed_appointments": doctor_appointments.filter(
                    status="Completed"
                ).count(),
                "average_rating": (
                    round(float(average_rating), 2)
                    if average_rating is not None
                    else None
                ),
                "review_count": review_summary["review_count"],
            })

        doctor_performance.sort(
            key=lambda item: item["appointments"],
            reverse=True,
        )

        return Response({
            "date_range": {
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            },
            "summary": {
                "total_patients": patients.count(),
                "active_patients": active_patients.count(),
                "total_doctors": doctors.count(),
                "active_doctors": active_doctors.count(),
                "total_appointments": appointment_counts["total"],
                "pending_appointments": appointment_counts["pending"],
                "confirmed_appointments": appointment_counts["confirmed"],
                "completed_appointments": appointment_counts["completed"],
                "cancelled_appointments": appointment_counts["cancelled"],
                "approved_reviews": approved_reviews.count(),
            },
            "registration_trend": registrations,
            "appointment_trend": appointment_trend,
            "doctor_performance": doctor_performance,
        })
