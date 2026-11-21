
from datetime import datetime, timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_time

from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Appointment,
    DoctorAvailability,
    DoctorLeaveRequest,
    DoctorProfile,
    Notification,
    Provider,
)


class DoctorFollowUpAppointmentView(APIView):
    """
    Allows an active doctor to schedule a confirmed follow-up
    appointment for a patient from one of their completed appointments.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_doctor(self, request):
        try:
            doctor = request.user.doctor_profile
        except DoctorProfile.DoesNotExist:
            doctor = None

        if (
            doctor is None
            or not doctor.is_active
            or not doctor.user.is_active
            or not doctor.provider.is_active
        ):
            raise PermissionDenied(
                "Only active doctors can schedule follow-up appointments."
            )

        return doctor

    def post(self, request):
        doctor = self.get_doctor(request)

        original_id = request.data.get("original_appointment")
        date_value = request.data.get("preferred_date")
        time_value = request.data.get("start_time")
        reason = str(request.data.get("reason", "")).strip()

        if not original_id:
            raise ValidationError({
                "original_appointment": "Please select the original appointment."
            })

        if not date_value:
            raise ValidationError({
                "preferred_date": "Please select a follow-up date."
            })

        if not time_value:
            raise ValidationError({
                "start_time": "Please select a follow-up time."
            })

        if len(reason) > 1000:
            raise ValidationError({
                "reason": "The reason cannot exceed 1000 characters."
            })

        selected_date = parse_date(str(date_value))
        selected_time = parse_time(str(time_value))

        if selected_date is None:
            raise ValidationError({
                "preferred_date": "Please provide a valid date in YYYY-MM-DD format."
            })

        if selected_time is None:
            raise ValidationError({
                "start_time": "Please provide a valid time in HH:MM format."
            })

        if selected_date < timezone.localdate():
            raise ValidationError({
                "preferred_date": "A follow-up appointment cannot be scheduled in the past."
            })

        try:
            with transaction.atomic():
                provider = Provider.objects.select_for_update().get(
                    pk=doctor.provider_id,
                    is_active=True,
                )

                original_appointment = get_object_or_404(
                    Appointment.objects.select_for_update().select_related(
                        "patient",
                        "provider",
                    ),
                    pk=original_id,
                    provider=provider,
                )

                if original_appointment.status != "Completed":
                    raise ValidationError({
                        "original_appointment": (
                            "A follow-up can only be scheduled from a completed appointment."
                        )
                    })

                if not original_appointment.patient.is_active:
                    raise ValidationError({
                        "original_appointment": "This patient account is inactive."
                    })

                availability = DoctorAvailability.objects.filter(
                    provider=provider,
                    weekday=selected_date.weekday(),
                    is_available=True,
                ).first()

                if (
                    availability is None
                    or not availability.start_time
                    or not availability.end_time
                ):
                    raise ValidationError({
                        "preferred_date": (
                            "You do not have working hours configured for that day."
                        )
                    })

                slot_duration = availability.slot_duration

                if not slot_duration or slot_duration <= 0:
                    raise ValidationError({
                        "preferred_date": "Your appointment slot duration is invalid."
                    })

                start_datetime = datetime.combine(
                    selected_date,
                    selected_time,
                )

                end_datetime = start_datetime + timedelta(
                    minutes=slot_duration,
                )

                if selected_date == timezone.localdate():
                    current_datetime = timezone.localtime().replace(
                        tzinfo=None,
                    )

                    if start_datetime <= current_datetime:
                        raise ValidationError({
                            "start_time": (
                                "Please select a follow-up time that has not passed."
                            )
                        })

                end_time = end_datetime.time()

                if (
                    selected_time < availability.start_time
                    or end_time > availability.end_time
                ):
                    raise ValidationError({
                        "start_time": (
                            "The selected time is outside your working hours."
                        )
                    })

                start_minutes = (
                    selected_time.hour * 60 + selected_time.minute
                )

                opening_minutes = (
                    availability.start_time.hour * 60
                    + availability.start_time.minute
                )

                if (start_minutes - opening_minutes) % slot_duration != 0:
                    raise ValidationError({
                        "start_time": "Please select a valid appointment slot."
                    })

                leave_conflict = DoctorLeaveRequest.objects.filter(
                    provider=provider,
                    leave_date=selected_date,
                    status="Approved",
                    start_time__lt=end_time,
                    end_time__gt=selected_time,
                ).exists()

                if leave_conflict:
                    raise ValidationError({
                        "start_time": "You have approved leave during that time."
                    })

                appointment_conflict = Appointment.objects.filter(
                    provider=provider,
                    preferred_date=selected_date,
                    start_time__lt=end_time,
                    end_time__gt=selected_time,
                ).exclude(
                    status="Cancelled",
                ).exists()

                if appointment_conflict:
                    raise ValidationError({
                        "start_time": (
                            "That appointment slot is already booked. "
                            "Please choose another time."
                        )
                    })

                follow_up = Appointment.objects.create(
                    patient=original_appointment.patient,
                    provider=provider,
                    preferred_date=selected_date,
                    start_time=selected_time,
                    end_time=end_time,
                    consultation_type=original_appointment.consultation_type,
                    reason=reason or (
                        f"Follow-up consultation for appointment "
                        f"#{original_appointment.pk}."
                    ),
                    status="Confirmed",
                    follow_up_of=original_appointment,
                )

                patient_name = (
                    original_appointment.patient.get_full_name().strip()
                    or original_appointment.patient.username
                )

                Notification.objects.create(
                    recipient=original_appointment.patient,
                    notification_type="appointment_confirmed",
                    title="Follow-up appointment scheduled",
                    message=(
                        f"Dr. {provider.name} has scheduled a follow-up "
                        f"appointment for you on "
                        f"{selected_date.strftime('%d %b %Y')} at "
                        f"{selected_time.strftime('%H:%M')}. "
                        f"You can view the appointment in your dashboard."
                    ),
                    appointment=follow_up,
                )

                Notification.objects.create(
                    recipient=request.user,
                    notification_type="general",
                    title="Follow-up appointment scheduled",
                    message=(
                        f"Your follow-up appointment with {patient_name} "
                        f"has been scheduled for "
                        f"{selected_date.strftime('%d %b %Y')} at "
                        f"{selected_time.strftime('%H:%M')}."
                    ),
                    appointment=follow_up,
                )

                return Response(
                    {
                        "detail": "Follow-up appointment scheduled successfully.",
                        "appointment": {
                            "id": follow_up.id,
                            "patient_name": patient_name,
                            "provider_name": provider.name,
                            "preferred_date": follow_up.preferred_date.isoformat(),
                            "start_time": follow_up.start_time.strftime("%H:%M"),
                            "end_time": follow_up.end_time.strftime("%H:%M"),
                            "status": follow_up.status,
                            "consultation_type": follow_up.consultation_type,
                            "reason": follow_up.reason,
                            "follow_up_of": original_appointment.id,
                            "is_follow_up": True,
                        },
                    },
                    status=status.HTTP_201_CREATED,
                )

        except ValidationError:
            raise

        except Exception:
            raise
