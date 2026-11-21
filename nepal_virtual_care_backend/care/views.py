
import mimetypes
import os

from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import generics, permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Provider,
    Appointment,
    AppointmentStatusHistory,
    AppointmentRescheduleRequest,
    DoctorProfile,
    DoctorAvailability,
    DoctorScheduleChangeRequest,
    DoctorLeaveRequest,
    MedicalDocument,
    PatientHealthHistory,
    Notification,
    Prescription,
)

from .serializers import (
    ProviderSerializer,
    AppointmentSerializer,
    AppointmentStatusSerializer,
    AppointmentRescheduleRequestCreateSerializer,
    AppointmentRescheduleRequestSerializer,
    AppointmentRescheduleReviewSerializer,
    DoctorAccountSerializer,
    DoctorListSerializer,
    DoctorAvailabilitySerializer,
    DoctorScheduleChangeRequestCreateSerializer,
    DoctorScheduleChangeRequestSerializer,
    AdminScheduleChangeReviewSerializer,
    DoctorLeaveRequestCreateSerializer,
    DoctorLeaveRequestSerializer,
    AdminLeaveRequestReviewSerializer,
    PatientManagementSerializer,
    MedicalDocumentSerializer,
    PatientHealthHistorySerializer,
    NotificationSerializer,
    PrescriptionCreateSerializer,
    PrescriptionSerializer,
)


User = get_user_model()


# ============================================================
# NOTIFICATION HELPERS
# ============================================================

def create_notification(
    recipient,
    notification_type,
    title,
    message,
    appointment=None,
):
    """
    Create a notification for one user.
    """
    if recipient is None or not recipient.is_active:
        return None

    return Notification.objects.create(
        recipient=recipient,
        notification_type=notification_type,
        title=title,
        message=message,
        appointment=appointment,
    )


def notify_administrators(
    notification_type,
    title,
    message,
):
    """
    Notify all active administrator accounts.
    """
    administrators = User.objects.filter(
        Q(is_staff=True) | Q(is_superuser=True),
        is_active=True,
    ).distinct()

    notifications = [
        Notification(
            recipient=administrator,
            notification_type=notification_type,
            title=title,
            message=message,
        )
        for administrator in administrators
    ]

    if notifications:
        Notification.objects.bulk_create(notifications)


def get_doctor_user(provider):
    """
    Return the active user account associated with a provider.
    """
    doctor_profile = (
        DoctorProfile.objects
        .filter(
            provider=provider,
            is_active=True,
            user__is_active=True,
        )
        .select_related("user")
        .first()
    )

    return doctor_profile.user if doctor_profile else None


# ============================================================
# GENERAL HELPERS
# ============================================================

def get_display_name(user):
    full_name = user.get_full_name().strip()
    return full_name or user.username


def get_active_doctor_profile(user):
    try:
        doctor = user.doctor_profile

        if (
            doctor.is_active
            and doctor.user.is_active
            and doctor.provider.is_active
        ):
            return doctor

    except DoctorProfile.DoesNotExist:
        pass

    return None


def validate_availability_schedule(data):
    """
    Validate a complete weekly schedule.
    The frontend sends one entry for each weekday, Monday through Sunday.
    """
    if not isinstance(data, list):
        raise ValidationError({
            "detail": "Please submit a list containing the weekly availability."
        })

    serializer = DoctorAvailabilitySerializer(
        data=data,
        many=True,
    )

    serializer.is_valid(raise_exception=True)

    weekdays = [
        item["weekday"]
        for item in serializer.validated_data
    ]

    if len(weekdays) != len(set(weekdays)):
        raise ValidationError({
            "detail": "Each weekday can only appear once in the schedule."
        })

    if set(weekdays) != set(range(7)):
        raise ValidationError({
            "detail": "Please provide availability for all seven days of the week."
        })

    return serializer.validated_data


def save_provider_availability(provider, schedule):
    """
    Save or update a provider's complete weekly schedule.
    This helper is used by administrators.
    """
    for item in schedule:
        DoctorAvailability.objects.update_or_create(
            provider=provider,
            weekday=item["weekday"],
            defaults={
                "start_time": item.get("start_time"),
                "end_time": item.get("end_time"),
                "slot_duration": item.get("slot_duration", 30),
                "is_available": item.get("is_available", True),
            },
        )

    return DoctorAvailability.objects.filter(
        provider=provider,
    ).order_by("weekday")


def validate_provider_appointment_slot(
    provider,
    selected_date,
    start_time,
    end_time,
    exclude_appointment_id=None,
):
    """
    Validate an appointment interval against the provider's current
    schedule, slot duration, working hours, approved leave, existing
    appointments, and current date/time.

    Call this while holding a lock on the provider when creating,
    moving, or approving an appointment.
    """
    today = timezone.localdate()

    if selected_date < today:
        raise ValidationError({
            "requested_date": "Appointments cannot be scheduled in the past."
        })

    if start_time is None or end_time is None:
        raise ValidationError({
            "start_time": "A valid appointment start and end time are required."
        })

    if end_time <= start_time:
        raise ValidationError({
            "end_time": "The appointment end time must be after its start time."
        })

    requested_start_datetime = datetime.combine(
        selected_date,
        start_time,
    )

    requested_end_datetime = datetime.combine(
        selected_date,
        end_time,
    )

    if requested_start_datetime <= timezone.localtime().replace(tzinfo=None):
        raise ValidationError({
            "start_time": "The selected appointment time has already passed."
        })

    if requested_end_datetime.date() != selected_date:
        raise ValidationError({
            "end_time": "Appointments cannot extend into the following day."
        })

    availability = DoctorAvailability.objects.filter(
        provider=provider,
        weekday=selected_date.weekday(),
        is_available=True,
    ).first()

    if (
        availability is None
        or availability.start_time is None
        or availability.end_time is None
    ):
        raise ValidationError({
            "requested_date": "The doctor is not available on the selected day."
        })

    slot_duration = availability.slot_duration

    if (
        not isinstance(slot_duration, int)
        or isinstance(slot_duration, bool)
        or slot_duration <= 0
    ):
        raise ValidationError({
            "start_time": "The doctor's appointment schedule is invalid. Please contact the administrator."
        })

    if availability.end_time <= availability.start_time:
        raise ValidationError({
            "requested_date": "The doctor's working hours are currently invalid."
        })

    expected_end_datetime = (
        requested_start_datetime
        + timedelta(minutes=slot_duration)
    )

    if expected_end_datetime.date() != selected_date:
        raise ValidationError({
            "end_time": "Appointments cannot extend into the following day."
        })

    if expected_end_datetime.time() != end_time:
        raise ValidationError({
            "end_time": (
                "The requested appointment duration does not match "
                "the doctor's current slot duration."
            )
        })

    if (
        start_time < availability.start_time
        or end_time > availability.end_time
    ):
        raise ValidationError({
            "start_time": "The requested appointment is outside the doctor's working hours."
        })

    start_minutes = (
        start_time.hour * 60
        + start_time.minute
    )

    opening_minutes = (
        availability.start_time.hour * 60
        + availability.start_time.minute
    )

    if (start_minutes - opening_minutes) % slot_duration != 0:
        raise ValidationError({
            "start_time": "The requested time is not a valid appointment slot."
        })

    leave_conflict = DoctorLeaveRequest.objects.filter(
        provider=provider,
        leave_date=selected_date,
        status="Approved",
        start_time__lt=end_time,
        end_time__gt=start_time,
    ).exists()

    if leave_conflict:
        raise ValidationError({
            "start_time": "The requested appointment overlaps with the doctor's approved leave."
        })

    overlapping_appointments = Appointment.objects.filter(
        provider=provider,
        preferred_date=selected_date,
        start_time__lt=end_time,
        end_time__gt=start_time,
    ).exclude(
        status="Cancelled",
    )

    if exclude_appointment_id is not None:
        overlapping_appointments = overlapping_appointments.exclude(
            pk=exclude_appointment_id,
        )

    if overlapping_appointments.exists():
        raise ValidationError({
            "start_time": "The requested appointment slot is no longer available. Please choose another time."
        })

    return availability


def find_schedule_appointment_conflicts(provider, schedule):
    """
    Find future appointments that would become invalid if a proposed
    weekly schedule were applied.

    An appointment must fit inside the proposed working hours and
    match the proposed slot duration and alignment.
    """
    schedule_by_weekday = {
        item["weekday"]: item
        for item in schedule
    }

    future_appointments = (
        Appointment.objects
        .filter(
            provider=provider,
            preferred_date__gte=timezone.localdate(),
        )
        .exclude(status="Cancelled")
        .exclude(start_time__isnull=True)
        .exclude(end_time__isnull=True)
        .order_by("preferred_date", "start_time")
    )

    conflicts = []

    for appointment in future_appointments:
        day_schedule = schedule_by_weekday.get(
            appointment.preferred_date.weekday()
        )

        if (
            day_schedule is None
            or not day_schedule.get("is_available", True)
            or not day_schedule.get("start_time")
            or not day_schedule.get("end_time")
        ):
            conflicts.append(appointment.id)
            continue

        slot_duration = day_schedule.get("slot_duration", 30)

        if (
            not isinstance(slot_duration, int)
            or isinstance(slot_duration, bool)
            or slot_duration <= 0
        ):
            conflicts.append(appointment.id)
            continue

        proposed_start = day_schedule["start_time"]
        proposed_end = day_schedule["end_time"]

        if (
            proposed_end <= proposed_start
            or appointment.start_time < proposed_start
            or appointment.end_time > proposed_end
        ):
            conflicts.append(appointment.id)
            continue

        appointment_start_datetime = datetime.combine(
            appointment.preferred_date,
            appointment.start_time,
        )

        appointment_end_datetime = datetime.combine(
            appointment.preferred_date,
            appointment.end_time,
        )

        expected_end_datetime = (
            appointment_start_datetime
            + timedelta(minutes=slot_duration)
        )

        if (
            appointment_end_datetime != expected_end_datetime
            or expected_end_datetime.date() != appointment.preferred_date
        ):
            conflicts.append(appointment.id)
            continue

        start_minutes = (
            appointment.start_time.hour * 60
            + appointment.start_time.minute
        )

        opening_minutes = (
            proposed_start.hour * 60
            + proposed_start.minute
        )

        if (start_minutes - opening_minutes) % slot_duration != 0:
            conflicts.append(appointment.id)

    return conflicts


# ============================================================
# PERMISSIONS
# ============================================================

class PatientOnly(permissions.BasePermission):
    """
    Only active ordinary patient accounts can book appointments
    or manage their own medical documents and health history.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user.is_authenticated or not user.is_active:
            return False

        if user.is_staff or user.is_superuser:
            return False

        try:
            user.doctor_profile
            return False
        except DoctorProfile.DoesNotExist:
            return True


class DoctorOrAdminOnly(permissions.BasePermission):
    """
    Only active doctors and administrators can manage appointment statuses.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user.is_authenticated or not user.is_active:
            return False

        if user.is_staff or user.is_superuser:
            return True

        return get_active_doctor_profile(user) is not None


class PrescriptionUserPermission(permissions.BasePermission):
    """
    Only active doctors and ordinary patient accounts can access
    prescriptions. Administrators do not receive automatic access
    to private patient prescriptions.
    """

    def has_permission(self, request, view):
        user = request.user

        if not user.is_authenticated or not user.is_active:
            return False

        if user.is_staff or user.is_superuser:
            return False

        try:
            user.doctor_profile
            return get_active_doctor_profile(user) is not None
        except DoctorProfile.DoesNotExist:
            return True


# ============================================================
# PROVIDERS AND AVAILABLE SLOTS
# ============================================================

class ProviderListView(generics.ListAPIView):
    serializer_class = ProviderSerializer
    permission_classes = [permissions.AllowAny]
    queryset = Provider.objects.filter(is_active=True)

    def get_queryset(self):
        qs = super().get_queryset()

        search = self.request.query_params.get("search")
        specialty = self.request.query_params.get("specialty")

        if search:
            qs = qs.filter(
                Q(name__icontains=search)
                | Q(specialty__icontains=search)
                | Q(city__icontains=search)
            )

        if specialty and specialty.lower() != "all specialties":
            qs = qs.filter(specialty__iexact=specialty)

        return qs


class AvailableSlotsView(APIView):
    """
    Patients can retrieve available appointment slots
    for a provider on a selected date.

    Approved doctor leave is excluded from the available slots.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, provider_id):
        date_value = request.query_params.get("date")

        if not date_value:
            return Response(
                {"detail": "Please provide an appointment date."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        selected_date = parse_date(date_value)

        if selected_date is None:
            return Response(
                {"detail": "Please provide a valid date in YYYY-MM-DD format."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if selected_date < timezone.localdate():
            return Response(
                {"detail": "Appointments cannot be booked in the past."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider = Provider.objects.filter(
            id=provider_id,
            is_active=True,
        ).first()

        if provider is None:
            return Response(
                {"detail": "Doctor not found or unavailable."},
                status=status.HTTP_404_NOT_FOUND,
            )

        availability = DoctorAvailability.objects.filter(
            provider=provider,
            weekday=selected_date.weekday(),
            is_available=True,
        ).first()

        if availability is None:
            return Response({
                "provider_id": provider.id,
                "provider_name": provider.name,
                "date": selected_date.isoformat(),
                "slots": [],
            })

        if (
            availability.start_time is None
            or availability.end_time is None
            or availability.end_time <= availability.start_time
        ):
            return Response({
                "provider_id": provider.id,
                "provider_name": provider.name,
                "date": selected_date.isoformat(),
                "slot_duration": availability.slot_duration,
                "slots": [],
            })

        slot_duration = availability.slot_duration

        if (
            not isinstance(slot_duration, int)
            or isinstance(slot_duration, bool)
            or slot_duration <= 0
        ):
            return Response(
                {"detail": "The doctor's appointment schedule is currently invalid."},
                status=status.HTTP_409_CONFLICT,
            )

        opening = datetime.combine(
            selected_date,
            availability.start_time,
        )

        closing = datetime.combine(
            selected_date,
            availability.end_time,
        )

        booked_appointments = Appointment.objects.filter(
            provider=provider,
            preferred_date=selected_date,
        ).exclude(
            status="Cancelled",
        ).exclude(
            start_time__isnull=True,
        ).exclude(
            end_time__isnull=True,
        )

        booked_intervals = list(
            booked_appointments.values_list(
                "start_time",
                "end_time",
            )
        )

        approved_leaves = DoctorLeaveRequest.objects.filter(
            provider=provider,
            leave_date=selected_date,
            status="Approved",
        ).exclude(
            start_time__isnull=True,
        ).exclude(
            end_time__isnull=True,
        )

        leave_intervals = list(
            approved_leaves.values_list(
                "start_time",
                "end_time",
            )
        )

        current_datetime = timezone.localtime()
        slots = []
        slot_start = opening

        while slot_start + timedelta(minutes=slot_duration) <= closing:
            slot_end = slot_start + timedelta(minutes=slot_duration)

            start_time = slot_start.time()
            end_time = slot_end.time()

            is_booked = any(
                booked_start < end_time
                and booked_end > start_time
                for booked_start, booked_end in booked_intervals
            )

            is_on_leave = any(
                leave_start < end_time
                and leave_end > start_time
                for leave_start, leave_end in leave_intervals
            )

            is_past = (
                datetime.combine(selected_date, start_time)
                <= current_datetime.replace(tzinfo=None)
            )

            if not is_booked and not is_on_leave and not is_past:
                slots.append({
                    "start_time": start_time.strftime("%H:%M"),
                    "end_time": end_time.strftime("%H:%M"),
                })

            slot_start = slot_end

        return Response({
            "provider_id": provider.id,
            "provider_name": provider.name,
            "date": selected_date.isoformat(),
            "slot_duration": slot_duration,
            "slots": slots,
        })


# ============================================================
# DOCTOR AVAILABILITY
# ============================================================

class DoctorAvailabilityView(APIView):
    """
    Doctors can view their weekly availability.

    Doctors can save their schedule only once.
    After the first save, only administrators can change it.
    """

    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def get_doctor(self, request):
        doctor = get_active_doctor_profile(request.user)

        if doctor is None:
            raise PermissionDenied(
                "Only active doctor accounts can view their availability."
            )

        return doctor

    def get(self, request):
        doctor = self.get_doctor(request)

        availability = DoctorAvailability.objects.filter(
            provider=doctor.provider,
        ).order_by("weekday")

        serializer = DoctorAvailabilitySerializer(
            availability,
            many=True,
        )

        return Response({
            "provider_id": doctor.provider_id,
            "provider_name": doctor.provider.name,
            "availability": serializer.data,
            "is_locked": availability.exists(),
        })

    def put(self, request):
        doctor = self.get_doctor(request)

        schedule = validate_availability_schedule(request.data)

        with transaction.atomic():
            locked_provider = Provider.objects.select_for_update().get(
                pk=doctor.provider_id,
            )

            existing_schedule = DoctorAvailability.objects.filter(
                provider=locked_provider,
            )

            if existing_schedule.exists():
                return Response(
                    {
                        "detail": (
                            "Your weekly availability has already been saved. "
                            "Only an administrator can change your working hours. "
                            "Please contact the administrator if you need an update."
                        ),
                        "code": "availability_locked",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            for item in schedule:
                DoctorAvailability.objects.create(
                    provider=locked_provider,
                    weekday=item["weekday"],
                    start_time=item.get("start_time"),
                    end_time=item.get("end_time"),
                    slot_duration=item.get("slot_duration", 30),
                    is_available=item.get("is_available", True),
                )

        updated_availability = DoctorAvailability.objects.filter(
            provider=doctor.provider,
        ).order_by("weekday")

        return Response({
            "detail": "Your weekly availability has been saved successfully.",
            "availability": DoctorAvailabilitySerializer(
                updated_availability,
                many=True,
            ).data,
            "is_locked": True,
        })


class AdminDoctorAvailabilityView(APIView):
    """
    Administrators can view and update any doctor's weekly availability.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_provider(self, provider_id):
        provider = Provider.objects.filter(
            pk=provider_id,
        ).first()

        if provider is None:
            raise PermissionDenied(
                "The requested doctor provider could not be found."
            )

        return provider

    def get(self, request, provider_id):
        provider = self.get_provider(provider_id)

        availability = DoctorAvailability.objects.filter(
            provider=provider,
        ).order_by("weekday")

        return Response({
            "provider_id": provider.id,
            "provider_name": provider.name,
            "availability": DoctorAvailabilitySerializer(
                availability,
                many=True,
            ).data,
            "is_locked": availability.exists(),
        })

    def put(self, request, provider_id):
        provider = self.get_provider(provider_id)

        schedule = validate_availability_schedule(request.data)

        with transaction.atomic():
            locked_provider = Provider.objects.select_for_update().get(
                pk=provider.pk,
            )

            conflicts = find_schedule_appointment_conflicts(
                locked_provider,
                schedule,
            )

            if conflicts:
                return Response(
                    {
                        "detail": (
                            "The availability cannot be updated because "
                            "existing future appointments would no longer "
                            "fit the proposed working hours or slot duration. "
                            "Resolve these appointments first."
                        ),
                        "conflicting_appointment_ids": conflicts,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            updated_availability = save_provider_availability(
                locked_provider,
                schedule,
            )

        return Response({
            "detail": "Doctor availability updated successfully.",
            "provider_id": provider.id,
            "provider_name": provider.name,
            "availability": DoctorAvailabilitySerializer(
                updated_availability,
                many=True,
            ).data,
            "is_locked": True,
        })


# ============================================================
# APPOINTMENTS
# ============================================================

class AppointmentListCreateView(generics.ListCreateAPIView):
    serializer_class = AppointmentSerializer

    def get_permissions(self):
        if self.request.method == "POST":
            return [
                permissions.IsAuthenticated(),
                PatientOnly(),
            ]

        return [permissions.IsAuthenticated()]

    def get_queryset(self):
        user = self.request.user

        if not user.is_authenticated or not user.is_active:
            return Appointment.objects.none()

        if user.is_staff or user.is_superuser:
            return Appointment.objects.all().select_related(
                "patient",
                "provider",
            )

        doctor = get_active_doctor_profile(user)

        if doctor is not None:
            return Appointment.objects.filter(
                provider=doctor.provider,
            ).select_related(
                "patient",
                "provider",
            )

        return Appointment.objects.filter(
            patient=user,
        ).select_related(
            "provider",
        )

    def perform_create(self, serializer):
        user = self.request.user

        if not user.is_authenticated or not user.is_active:
            raise PermissionDenied(
                "An active account is required to book an appointment."
            )

        provider = serializer.validated_data["provider"]
        preferred_date = serializer.validated_data["preferred_date"]
        start_time = serializer.validated_data["start_time"]
        end_time = serializer.validated_data["end_time"]

        try:
            with transaction.atomic():
                locked_provider = Provider.objects.select_for_update().get(
                    pk=provider.pk,
                    is_active=True,
                )

                validate_provider_appointment_slot(
                    provider=locked_provider,
                    selected_date=preferred_date,
                    start_time=start_time,
                    end_time=end_time,
                )

                appointment = serializer.save(patient=user)

                create_notification(
                    recipient=user,
                    notification_type="appointment_booked",
                    title="Appointment request received",
                    message=(
                        f"Your appointment request with "
                        f"{locked_provider.name} has been received "
                        f"for {preferred_date.strftime('%d %b %Y')} "
                        f"at {start_time.strftime('%H:%M')}. "
                        f"It is awaiting confirmation."
                    ),
                    appointment=appointment,
                )

                doctor_user = get_doctor_user(locked_provider)

                if doctor_user:
                    create_notification(
                        recipient=doctor_user,
                        notification_type="appointment_booked",
                        title="New appointment request",
                        message=(
                            f"{get_display_name(user)} has requested "
                            f"an appointment on "
                            f"{preferred_date.strftime('%d %b %Y')} "
                            f"at {start_time.strftime('%H:%M')}."
                        ),
                        appointment=appointment,
                    )

        except Provider.DoesNotExist:
            raise ValidationError({
                "provider": "This doctor is no longer available."
            })

        except IntegrityError:
            raise ValidationError({
                "start_time": (
                    "This appointment slot is no longer available. "
                    "Please choose another time."
                )
            })


class AppointmentStatusUpdateView(generics.UpdateAPIView):
    """
    Allows an assigned active doctor or administrator to update
    an appointment's status.

    Every genuine status change is recorded in AppointmentStatusHistory
    and generates the appropriate notifications.
    """

    serializer_class = AppointmentStatusSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        DoctorOrAdminOnly,
    ]

    lookup_url_kwarg = "pk"

    def get_queryset(self):
        user = self.request.user

        if not user.is_authenticated or not user.is_active:
            return Appointment.objects.none()

        if user.is_staff or user.is_superuser:
            return Appointment.objects.all()

        doctor = get_active_doctor_profile(user)

        if doctor is not None:
            return Appointment.objects.filter(
                provider=doctor.provider,
            )

        return Appointment.objects.none()

    def perform_update(self, serializer):
        with transaction.atomic():
            appointment = self.get_queryset().select_for_update().select_related(
                "patient",
                "provider",
            ).get(
                pk=serializer.instance.pk,
            )

            old_status = appointment.status

            # Revalidate against the latest locked appointment state.
            locked_serializer = self.get_serializer(
                appointment,
                data=self.request.data,
                partial=True,
            )

            locked_serializer.is_valid(raise_exception=True)

            updated_appointment = locked_serializer.save()

            new_status = updated_appointment.status

            if old_status != new_status:
                AppointmentStatusHistory.objects.create(
                    appointment=updated_appointment,
                    old_status=old_status,
                    new_status=new_status,
                    changed_by=self.request.user,
                )

                patient_name = get_display_name(
                    updated_appointment.patient
                )

                appointment_date = (
                    updated_appointment.preferred_date.strftime("%d %b %Y")
                )

                appointment_time = (
                    updated_appointment.start_time.strftime("%H:%M")
                    if updated_appointment.start_time
                    else "the scheduled time"
                )

                if new_status == "Confirmed":
                    notification_type = "appointment_confirmed"
                    title = "Appointment confirmed"
                    message = (
                        f"Your appointment with "
                        f"{updated_appointment.provider.name} "
                        f"on {appointment_date} at {appointment_time} "
                        f"has been confirmed."
                    )

                elif new_status == "Cancelled":
                    notification_type = "appointment_cancelled"
                    title = "Appointment cancelled"
                    message = (
                        f"Your appointment with "
                        f"{updated_appointment.provider.name} "
                        f"on {appointment_date} at {appointment_time} "
                        f"has been cancelled."
                    )

                elif new_status == "Completed":
                    notification_type = "appointment_completed"
                    title = "Appointment completed"
                    message = (
                        f"Your appointment with "
                        f"{updated_appointment.provider.name} "
                        f"on {appointment_date} has been marked as completed."
                    )

                else:
                    notification_type = "general"
                    title = "Appointment status updated"
                    message = (
                        f"Your appointment with "
                        f"{updated_appointment.provider.name} "
                        f"on {appointment_date} has been updated "
                        f"from {old_status} to {new_status}."
                    )

                create_notification(
                    recipient=updated_appointment.patient,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    appointment=updated_appointment,
                )

                doctor_user = get_doctor_user(
                    updated_appointment.provider
                )

                if (
                    doctor_user
                    and doctor_user.pk != self.request.user.pk
                    and (
                        self.request.user.is_staff
                        or self.request.user.is_superuser
                    )
                    and new_status == "Cancelled"
                ):
                    create_notification(
                        recipient=doctor_user,
                        notification_type="appointment_cancelled",
                        title="Appointment cancelled",
                        message=(
                            f"The appointment with {patient_name} "
                            f"on {appointment_date} at {appointment_time} "
                            f"has been cancelled by an administrator."
                        ),
                        appointment=updated_appointment,
                    )


# ============================================================
# NOTIFICATION CENTRE
# ============================================================

class NotificationListView(generics.ListAPIView):
    """
    Users can view only their own notifications.
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Notification.objects
            .filter(recipient=self.request.user)
            .select_related("appointment")
            .order_by("-created_at")
        )


class NotificationUnreadCountView(APIView):
    """
    Return the unread notification count for the current user.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        unread_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).count()

        return Response({
            "unread_count": unread_count,
        })


class NotificationMarkReadView(APIView):
    """
    Mark one of the current user's notifications as read.
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        notification = get_object_or_404(
            Notification,
            pk=pk,
            recipient=request.user,
        )

        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=["is_read"])

        return Response(
            NotificationSerializer(notification).data,
            status=status.HTTP_200_OK,
        )


class NotificationMarkAllReadView(APIView):
    """
    Mark all notifications belonging to the current user as read.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated_count = Notification.objects.filter(
            recipient=request.user,
            is_read=False,
        ).update(is_read=True)

        return Response({
            "detail": "All notifications have been marked as read.",
            "updated_count": updated_count,
        })


# ============================================================
# ADMIN RECENT ACTIVITY
# ============================================================

class AdminActivityView(APIView):
    """
    Administrators can view recent patient registrations,
    appointment bookings, and appointment status changes.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get(self, request):
        activities = []

        patients = User.objects.filter(
            is_staff=False,
            is_superuser=False,
            doctor_profile__isnull=True,
        ).order_by("-date_joined")[:30]

        for patient in patients:
            patient_name = get_display_name(patient)

            activities.append({
                "id": f"patient-{patient.id}",
                "type": "patient_registered",
                "timestamp": patient.date_joined.isoformat(),
                "_sort_timestamp": patient.date_joined,
                "title": "New patient registered",
                "description": f"{patient_name} created a patient account.",
                "patient_name": patient_name,
            })

        appointments = Appointment.objects.select_related(
            "patient",
            "provider",
        ).order_by("-created_at")[:30]

        for appointment in appointments:
            patient_name = get_display_name(appointment.patient)
            provider_name = appointment.provider.name

            activities.append({
                "id": f"appointment-{appointment.id}",
                "type": "appointment_booked",
                "timestamp": appointment.created_at.isoformat(),
                "_sort_timestamp": appointment.created_at,
                "title": "New appointment booked",
                "description": (
                    f"{patient_name} booked an appointment "
                    f"with {provider_name}."
                ),
                "patient_name": patient_name,
                "provider_name": provider_name,
                "appointment_id": appointment.id,
                "status": appointment.status,
            })

        status_changes = AppointmentStatusHistory.objects.select_related(
            "appointment",
            "appointment__patient",
            "appointment__provider",
            "changed_by",
        ).order_by("-changed_at")[:30]

        for change in status_changes:
            patient_name = get_display_name(
                change.appointment.patient
            )

            changed_by_name = (
                get_display_name(change.changed_by)
                if change.changed_by
                else "Unknown user"
            )

            activities.append({
                "id": f"status-{change.id}",
                "type": "appointment_status_changed",
                "timestamp": change.changed_at.isoformat(),
                "_sort_timestamp": change.changed_at,
                "title": "Appointment status updated",
                "description": (
                    f"{patient_name}: {change.old_status} "
                    f"→ {change.new_status}."
                ),
                "patient_name": patient_name,
                "provider_name": change.appointment.provider.name,
                "appointment_id": change.appointment_id,
                "old_status": change.old_status,
                "new_status": change.new_status,
                "changed_by": changed_by_name,
            })

        activities.sort(
            key=lambda item: item["_sort_timestamp"],
            reverse=True,
        )

        for activity in activities:
            activity.pop("_sort_timestamp", None)

        return Response({
            "results": activities[:30],
            "count": min(len(activities), 30),
        })


# ============================================================
# DOCTOR MANAGEMENT
# ============================================================

class DoctorManagementView(generics.ListCreateAPIView):
    """
    Administrators can list and create doctor accounts.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        return DoctorProfile.objects.select_related(
            "user",
            "provider",
        ).order_by("provider__name")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return DoctorAccountSerializer

        return DoctorListSerializer

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        instance = self.get_object()

        serializer = DoctorListSerializer(
            instance,
            data=request.data,
            partial=partial,
        )

        serializer.is_valid(raise_exception=True)
        doctor_profile = serializer.save()

        return Response(
            DoctorListSerializer(doctor_profile).data,
            status=status.HTTP_200_OK,
        )

    def partial_update(self, request, *args, **kwargs):
        kwargs["partial"] = True
        return self.update(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        doctor_user = serializer.save()
        doctor_profile = doctor_user.doctor_profile

        return Response(
            DoctorListSerializer(doctor_profile).data,
            status=status.HTTP_201_CREATED,
        )


class DoctorDetailView(generics.RetrieveUpdateAPIView):
    """
    Administrators can view and update individual doctor accounts.
    """

    serializer_class = DoctorListSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        return DoctorProfile.objects.select_related(
            "user",
            "provider",
        )


# ============================================================
# PATIENT MANAGEMENT
# ============================================================

class PatientManagementView(generics.ListAPIView):
    """
    Administrators can view and search patient accounts.
    """

    serializer_class = PatientManagementSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        patients = User.objects.filter(
            is_staff=False,
            is_superuser=False,
            doctor_profile__isnull=True,
        ).order_by("-date_joined")

        search = self.request.query_params.get(
            "search",
            "",
        ).strip()

        if search:
            patients = patients.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(email__icontains=search)
                | Q(username__icontains=search)
            )

        return patients


class PatientDetailView(generics.RetrieveUpdateAPIView):
    """
    Administrators can view, edit names, and activate or deactivate
    individual patient accounts.
    """

    serializer_class = PatientManagementSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        return User.objects.filter(
            is_staff=False,
            is_superuser=False,
            doctor_profile__isnull=True,
        )


# ============================================================
# PATIENT HEALTH HISTORY
# ============================================================

class PatientHealthHistoryView(APIView):
    """
    Patients can view and update their own health history.

    A blank history record is created automatically when a patient
    first opens the Health History section.

    Doctors and administrators cannot use this endpoint.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        PatientOnly,
    ]

    def get_history(self, user):
        history, _ = PatientHealthHistory.objects.get_or_create(
            patient=user,
        )
        return history

    def get(self, request):
        history = self.get_history(request.user)

        serializer = PatientHealthHistorySerializer(history)

        return Response(serializer.data)

    def put(self, request):
        history = self.get_history(request.user)

        serializer = PatientHealthHistorySerializer(
            history,
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save(patient=request.user)

        return Response(
            serializer.data,
            status=status.HTTP_200_OK,
        )


class DoctorPatientHealthHistoryView(APIView):
    """
    Active doctors can view a patient's health history only when
    that patient has a Confirmed or Completed appointment with
    the doctor's own provider.

    This endpoint is read-only.
    Pending and cancelled appointments do not grant access.
    Administrators do not receive access through this endpoint.
    """

    permission_classes = [
        permissions.IsAuthenticated,
    ]

    def get(self, request, patient_id):
        doctor = get_active_doctor_profile(request.user)

        if doctor is None:
            raise PermissionDenied(
                "Only active doctors can view patient health histories."
            )

        has_authorized_appointment = Appointment.objects.filter(
            patient_id=patient_id,
            provider=doctor.provider,
            status__in=["Confirmed", "Completed"],
        ).exists()

        if not has_authorized_appointment:
            return Response(
                {
                    "detail": (
                        "You do not have permission to view this patient's "
                        "health history. A confirmed or completed appointment "
                        "with this patient is required."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        patient = User.objects.filter(
            pk=patient_id,
            is_active=True,
            is_staff=False,
            is_superuser=False,
            doctor_profile__isnull=True,
        ).first()

        if patient is None:
            return Response(
                {"detail": "Patient not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        history = PatientHealthHistory.objects.filter(
            patient=patient,
        ).first()

        if history is None:
            return Response(
                {
                    "detail": "This patient has not provided a health history.",
                    "history": None,
                },
                status=status.HTTP_200_OK,
            )

        serializer = PatientHealthHistorySerializer(history)

        response = Response(serializer.data)
        response["Cache-Control"] = "private, no-store"
        return response


# ============================================================
# MEDICAL DOCUMENTS
# ============================================================

class MedicalDocumentListCreateView(generics.ListCreateAPIView):
    """
    Patients can list and upload their own medical documents.
    """

    serializer_class = MedicalDocumentSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        PatientOnly,
    ]
    parser_classes = [MultiPartParser, FormParser]

    def get_queryset(self):
        return MedicalDocument.objects.filter(
            patient=self.request.user
        )

    def perform_create(self, serializer):
        serializer.save(patient=self.request.user)


class MedicalDocumentDetailView(generics.DestroyAPIView):
    """
    Patients can delete only their own medical documents.
    """

    serializer_class = MedicalDocumentSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        PatientOnly,
    ]

    def get_queryset(self):
        return MedicalDocument.objects.filter(
            patient=self.request.user
        )


class MedicalDocumentDownloadView(generics.GenericAPIView):
    """
    Patients can download only their own medical documents.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        PatientOnly,
    ]

    def get_queryset(self):
        return MedicalDocument.objects.filter(
            patient=self.request.user
        )

    def get(self, request, *args, **kwargs):
        document = self.get_object()

        filename = os.path.basename(document.file.name)
        content_type, _ = mimetypes.guess_type(filename)

        try:
            file_handle = document.file.open("rb")
        except (FileNotFoundError, OSError, ValueError):
            raise ValidationError({
                "detail": "The requested medical document is no longer available."
            })

        response = FileResponse(
            file_handle,
            as_attachment=True,
            filename=filename,
            content_type=content_type or "application/octet-stream",
        )

        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"

        return response


# ============================================================
# DIGITAL PRESCRIPTIONS
# ============================================================

class PrescriptionListCreateView(generics.ListCreateAPIView):
    """
    Doctors can issue prescriptions for their own appointments.

    Doctors see only prescriptions they issued.
    Patients see only prescriptions issued to them.

    Prescriptions cannot be edited or deleted through this endpoint.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        PrescriptionUserPermission,
    ]

    def get_serializer_class(self):
        if self.request.method == "POST":
            return PrescriptionCreateSerializer

        return PrescriptionSerializer

    def get_queryset(self):
        user = self.request.user

        doctor = get_active_doctor_profile(user)

        if doctor is not None:
            return (
                Prescription.objects
                .filter(doctor=doctor)
                .select_related(
                    "patient",
                    "doctor",
                    "doctor__user",
                    "doctor__provider",
                    "appointment",
                    "replaces",
                )
                .prefetch_related("items")
                .order_by("-issued_at")
            )

        return (
            Prescription.objects
            .filter(patient=user)
            .select_related(
                "patient",
                "doctor",
                "doctor__user",
                "doctor__provider",
                "appointment",
                "replaces",
            )
            .prefetch_related("items")
            .order_by("-issued_at")
        )

    def perform_create(self, serializer):
        prescription = serializer.save()

        appointment = prescription.appointment
        doctor_name = get_display_name(self.request.user)

        create_notification(
            recipient=prescription.patient,
            notification_type="general",
            title="New digital prescription",
            message=(
                f"{doctor_name} has issued a prescription for your "
                f"appointment with {appointment.provider.name} on "
                f"{appointment.preferred_date.strftime('%d %b %Y')}. "
                f"You can view it in your prescriptions."
            ),
            appointment=appointment,
        )


class PrescriptionDetailView(generics.RetrieveAPIView):
    """
    A doctor can retrieve only a prescription they issued.
    A patient can retrieve only their own prescription.

    This endpoint is read-only.
    """

    serializer_class = PrescriptionSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        PrescriptionUserPermission,
    ]

    def get_queryset(self):
        user = self.request.user

        doctor = get_active_doctor_profile(user)

        if doctor is not None:
            return (
                Prescription.objects
                .filter(doctor=doctor)
                .select_related(
                    "patient",
                    "doctor",
                    "doctor__user",
                    "doctor__provider",
                    "appointment",
                    "replaces",
                )
                .prefetch_related("items")
            )

        return (
            Prescription.objects
            .filter(patient=user)
            .select_related(
                "patient",
                "doctor",
                "doctor__user",
                "doctor__provider",
                "appointment",
                "replaces",
            )
            .prefetch_related("items")
        )


# ============================================================
# DOCTOR SCHEDULE-CHANGE REQUESTS
# ============================================================

class DoctorScheduleChangeRequestView(APIView):
    """
    Doctors can submit a weekly schedule-change request and review their
    own request history. The existing schedule remains unchanged until
    an administrator approves the request.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_doctor(self, request):
        doctor = get_active_doctor_profile(request.user)

        if doctor is None:
            raise PermissionDenied(
                "Only active doctors can manage schedule-change requests."
            )

        return doctor

    def get(self, request):
        doctor = self.get_doctor(request)

        requests = (
            DoctorScheduleChangeRequest.objects
            .filter(
                doctor=request.user,
                provider=doctor.provider,
            )
            .select_related(
                "doctor",
                "provider",
                "reviewed_by",
            )
            .order_by("-created_at")
        )

        return Response(
            DoctorScheduleChangeRequestSerializer(
                requests,
                many=True,
            ).data
        )

    def post(self, request):
        doctor = self.get_doctor(request)

        serializer = DoctorScheduleChangeRequestCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "provider": doctor.provider,
            },
        )

        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                locked_provider = Provider.objects.select_for_update().get(
                    pk=doctor.provider_id,
                    is_active=True,
                )

                pending_exists = DoctorScheduleChangeRequest.objects.filter(
                    provider=locked_provider,
                    status="Pending",
                ).exists()

                if pending_exists:
                    raise ValidationError({
                        "detail": (
                            "There is already a pending schedule-change request "
                            "for this doctor. Please wait for the administrator "
                            "to review it."
                        )
                    })

                schedule_request = serializer.save()

                notify_administrators(
                    notification_type="schedule_request_submitted",
                    title="New schedule-change request",
                    message=(
                        f"{get_display_name(request.user)} "
                        f"has submitted a weekly schedule-change request "
                        f"for {locked_provider.name}."
                    ),
                )

        except IntegrityError:
            raise ValidationError({
                "detail": (
                    "A pending schedule-change request already exists for "
                    "this doctor."
                )
            })

        return Response(
            DoctorScheduleChangeRequestSerializer(
                schedule_request
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AdminScheduleChangeRequestListView(generics.ListAPIView):
    """
    Administrators can view all doctor schedule-change requests.
    Pending requests appear first so they are easy to review.
    """

    serializer_class = DoctorScheduleChangeRequestSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        return (
            DoctorScheduleChangeRequest.objects
            .select_related(
                "doctor",
                "provider",
                "reviewed_by",
            )
            .order_by(
                models_case_pending_first(),
                "-created_at",
            )
        )


def models_case_pending_first():
    from django.db.models import Case, IntegerField, When

    return Case(
        When(status="Pending", then=0),
        default=1,
        output_field=IntegerField(),
    )


class AdminScheduleChangeRequestReviewView(APIView):
    """
    Administrators can approve or reject a doctor's pending schedule request.
    Approval applies the requested weekly schedule after checking existing
    future appointments will still fit the proposed working hours and
    appointment duration.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def post(self, request, pk):
        review_serializer = AdminScheduleChangeReviewSerializer(
            data=request.data
        )

        review_serializer.is_valid(raise_exception=True)
        review_data = review_serializer.validated_data

        with transaction.atomic():
            schedule_request = (
                DoctorScheduleChangeRequest.objects
                .select_for_update()
                .select_related(
                    "provider",
                    "doctor",
                )
                .filter(pk=pk)
                .first()
            )

            if schedule_request is None:
                return Response(
                    {"detail": "Schedule-change request not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if schedule_request.status != "Pending":
                return Response(
                    {
                        "detail": (
                            "This schedule-change request has already been reviewed."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            locked_provider = Provider.objects.select_for_update().get(
                pk=schedule_request.provider_id
            )

            new_status = review_data["status"]
            admin_response = review_data.get("admin_response", "")

            if new_status == "Approved":
                proposed_schedule = validate_availability_schedule(
                    schedule_request.requested_schedule
                )

                conflicts = find_schedule_appointment_conflicts(
                    locked_provider,
                    proposed_schedule,
                )

                if conflicts:
                    return Response(
                        {
                            "detail": (
                                "This schedule cannot be approved because "
                                "existing future appointments would no longer "
                                "fit the proposed working hours or slot duration. "
                                "Please resolve these appointments before approving."
                            ),
                            "conflicting_appointment_ids": conflicts,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                save_provider_availability(
                    locked_provider,
                    proposed_schedule,
                )

            schedule_request.status = new_status
            schedule_request.admin_response = admin_response
            schedule_request.reviewed_by = request.user
            schedule_request.reviewed_at = timezone.now()

            schedule_request.save(
                update_fields=[
                    "status",
                    "admin_response",
                    "reviewed_by",
                    "reviewed_at",
                    "updated_at",
                ]
            )

            create_notification(
                recipient=schedule_request.doctor,
                notification_type="schedule_request_reviewed",
                title="Schedule request reviewed",
                message=(
                    f"Your schedule-change request for "
                    f"{locked_provider.name} has been {new_status.lower()}."
                    + (
                        f" Administrator response: {admin_response}"
                        if admin_response
                        else ""
                    )
                ),
            )

        return Response(
            DoctorScheduleChangeRequestSerializer(
                schedule_request
            ).data,
            status=status.HTTP_200_OK,
        )


# ============================================================
# DOCTOR LEAVE REQUESTS
# ============================================================

class DoctorLeaveRequestView(APIView):
    """
    Doctors can submit date-specific leave requests and view their
    own leave-request history.

    The weekly working schedule is not changed by leave requests.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get_doctor(self, request):
        doctor = get_active_doctor_profile(request.user)

        if doctor is None:
            raise PermissionDenied(
                "Only active doctors can manage leave requests."
            )

        return doctor

    def get(self, request):
        doctor = self.get_doctor(request)

        leave_requests = (
            DoctorLeaveRequest.objects
            .filter(
                doctor=request.user,
                provider=doctor.provider,
            )
            .select_related(
                "doctor",
                "provider",
                "reviewed_by",
            )
            .order_by("-created_at")
        )

        serializer = DoctorLeaveRequestSerializer(
            leave_requests,
            many=True,
        )

        return Response(serializer.data)

    def post(self, request):
        doctor = self.get_doctor(request)

        serializer = DoctorLeaveRequestCreateSerializer(
            data=request.data,
            context={
                "request": request,
                "provider": doctor.provider,
            },
        )

        serializer.is_valid(raise_exception=True)

        try:
            with transaction.atomic():
                locked_provider = Provider.objects.select_for_update().get(
                    pk=doctor.provider_id,
                    is_active=True,
                )

                pending_exists = DoctorLeaveRequest.objects.filter(
                    provider=locked_provider,
                    leave_date=serializer.validated_data["leave_date"],
                    status="Pending",
                ).exists()

                if pending_exists:
                    raise ValidationError({
                        "detail": (
                            "There is already a pending leave request for "
                            "this doctor on that date. Please wait for the "
                            "administrator to review it."
                        )
                    })

                leave_request = serializer.save()

                notify_administrators(
                    notification_type="leave_request_submitted",
                    title="New doctor leave request",
                    message=(
                        f"{get_display_name(request.user)} "
                        f"has submitted a leave request for "
                        f"{leave_request.leave_date.strftime('%d %b %Y')}."
                    ),
                )

        except IntegrityError:
            raise ValidationError({
                "detail": (
                    "A pending leave request already exists for this doctor "
                    "on that date."
                )
            })

        return Response(
            DoctorLeaveRequestSerializer(
                leave_request
            ).data,
            status=status.HTTP_201_CREATED,
        )


class AdminLeaveRequestListView(generics.ListAPIView):
    """
    Administrators can view all doctor leave requests.
    Pending requests appear first.
    """

    serializer_class = DoctorLeaveRequestSerializer
    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def get_queryset(self):
        return (
            DoctorLeaveRequest.objects
            .select_related(
                "doctor",
                "provider",
                "reviewed_by",
            )
            .order_by(
                models_case_pending_first(),
                "-created_at",
            )
        )


class AdminLeaveRequestReviewView(APIView):
    """
    Administrators can approve or reject pending doctor leave requests.

    Approval is blocked if any existing non-cancelled appointment overlaps
    the requested leave period. Existing appointments are never cancelled
    automatically.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        permissions.IsAdminUser,
    ]

    def post(self, request, pk):
        review_serializer = AdminLeaveRequestReviewSerializer(
            data=request.data,
        )

        review_serializer.is_valid(raise_exception=True)
        review_data = review_serializer.validated_data

        with transaction.atomic():
            leave_request = (
                DoctorLeaveRequest.objects
                .select_for_update()
                .select_related(
                    "doctor",
                    "provider",
                )
                .filter(pk=pk)
                .first()
            )

            if leave_request is None:
                return Response(
                    {"detail": "Leave request not found."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if leave_request.status != "Pending":
                return Response(
                    {
                        "detail": (
                            "This leave request has already been reviewed."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            locked_provider = Provider.objects.select_for_update().get(
                pk=leave_request.provider_id,
            )

            new_status = review_data["status"]
            admin_response = review_data.get("admin_response", "")

            if new_status == "Approved":
                conflicting_appointments = (
                    Appointment.objects
                    .filter(
                        provider=locked_provider,
                        preferred_date=leave_request.leave_date,
                        start_time__lt=leave_request.end_time,
                        end_time__gt=leave_request.start_time,
                    )
                    .exclude(status="Cancelled")
                    .select_related("patient")
                    .order_by("start_time")
                )

                if conflicting_appointments.exists():
                    conflicts = [
                        {
                            "appointment_id": appointment.id,
                            "patient_name": get_display_name(
                                appointment.patient
                            ),
                            "start_time": appointment.start_time.strftime(
                                "%H:%M"
                            ),
                            "end_time": appointment.end_time.strftime(
                                "%H:%M"
                            ),
                            "status": appointment.status,
                        }
                        for appointment in conflicting_appointments
                    ]

                    return Response(
                        {
                            "detail": (
                                "This leave request cannot be approved because "
                                "existing appointments overlap the requested "
                                "leave period. Please resolve those appointments "
                                "first."
                            ),
                            "conflicting_appointments": conflicts,
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            leave_request.status = new_status
            leave_request.admin_response = admin_response
            leave_request.reviewed_by = request.user
            leave_request.reviewed_at = timezone.now()

            leave_request.save(
                update_fields=[
                    "status",
                    "admin_response",
                    "reviewed_by",
                    "reviewed_at",
                    "updated_at",
                ]
            )

            create_notification(
                recipient=leave_request.doctor,
                notification_type="leave_request_reviewed",
                title="Leave request reviewed",
                message=(
                    f"Your leave request for "
                    f"{leave_request.leave_date.strftime('%d %b %Y')} "
                    f"has been {new_status.lower()}."
                    + (
                        f" Administrator response: {admin_response}"
                        if admin_response
                        else ""
                    )
                ),
            )

        return Response(
            DoctorLeaveRequestSerializer(
                leave_request
            ).data,
            status=status.HTTP_200_OK,
        )


# ============================================================
# APPOINTMENT RESCHEDULING
# ============================================================

def validate_reschedule_slot(reschedule_request, appointment):
    """
    Recheck a requested slot immediately before it is approved.

    The provider must already be locked by the calling transaction.
    """
    validate_provider_appointment_slot(
        provider=appointment.provider,
        selected_date=reschedule_request.requested_date,
        start_time=reschedule_request.requested_start_time,
        end_time=reschedule_request.requested_end_time,
        exclude_appointment_id=appointment.pk,
    )


class PatientRescheduleRequestListCreateView(generics.ListCreateAPIView):
    """
    Patients can submit and view their own appointment reschedule requests.
    """

    permission_classes = [
        permissions.IsAuthenticated,
        PatientOnly,
    ]

    def get_queryset(self):
        return AppointmentRescheduleRequest.objects.filter(
            appointment__patient=self.request.user,
        ).select_related(
            "appointment",
            "appointment__patient",
            "appointment__provider",
            "reviewed_by",
        ).order_by("-created_at")

    def get_serializer_class(self):
        if self.request.method == "POST":
            return AppointmentRescheduleRequestCreateSerializer
        return AppointmentRescheduleRequestSerializer

    def perform_create(self, serializer):
        submitted_appointment = serializer.validated_data["appointment"]

        requested_date = serializer.validated_data["requested_date"]
        requested_start = serializer.validated_data["requested_start_time"]
        requested_end = serializer.validated_data["requested_end_time"]

        try:
            with transaction.atomic():
                # All appointment creation and rescheduling operations
                # lock the provider before locking the appointment.
                provider = Provider.objects.select_for_update().get(
                    pk=submitted_appointment.provider_id,
                    is_active=True,
                )

                appointment = Appointment.objects.select_for_update().get(
                    pk=submitted_appointment.pk,
                    patient=self.request.user,
                    provider=provider,
                )

                if appointment.status not in ("Pending", "Confirmed"):
                    raise ValidationError({
                        "appointment": "This appointment can no longer be rescheduled."
                    })

                if requested_date == appointment.preferred_date and requested_start == appointment.start_time:
                    raise ValidationError({
                        "requested_start_time": "Please choose a different appointment time."
                    })

                # Recheck the target slot against the latest locked
                # provider schedule and current appointment records.
                validate_provider_appointment_slot(
                    provider=provider,
                    selected_date=requested_date,
                    start_time=requested_start,
                    end_time=requested_end,
                    exclude_appointment_id=appointment.pk,
                )

                pending_exists = AppointmentRescheduleRequest.objects.filter(
                    appointment=appointment,
                    status="Pending",
                ).exists()

                if pending_exists:
                    raise ValidationError({
                        "appointment": (
                            "A pending rescheduling request already exists "
                            "for this appointment."
                        )
                    })

                reschedule_request = serializer.save(
    appointment=appointment,
    original_date=appointment.preferred_date,
    original_start_time=appointment.start_time,
    original_end_time=appointment.end_time,
)
                doctor_user = get_doctor_user(provider)

                request_message = (
                    f"{get_display_name(self.request.user)} requested to move "
                    f"an appointment to {requested_date.strftime('%d %b %Y')} "
                    f"at {requested_start.strftime('%H:%M')}."
                )

                create_notification(
                    recipient=doctor_user,
                    notification_type="appointment_reschedule_requested",
                    title="Appointment reschedule requested",
                    message=request_message,
                    appointment=appointment,
                )

                notify_administrators(
                    notification_type="appointment_reschedule_requested",
                    title="Appointment reschedule requested",
                    message=(
                        f"A patient has requested a new time for appointment "
                        f"#{appointment.pk} with {provider.name}: "
                        f"{requested_date.strftime('%d %b %Y')} at "
                        f"{requested_start.strftime('%H:%M')}."
                    ),
                )

        except Provider.DoesNotExist:
            raise ValidationError({
                "appointment": "This doctor is no longer available."
            })

        except IntegrityError:
            raise ValidationError({
                "appointment": (
                    "A pending rescheduling request already exists for "
                    "this appointment."
                )
            })


class DoctorAdminRescheduleRequestListView(generics.ListAPIView):
    """
    Doctors see requests for their provider; administrators see all requests.
    """

    serializer_class = AppointmentRescheduleRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user

        if not user.is_active:
            return AppointmentRescheduleRequest.objects.none()

        queryset = AppointmentRescheduleRequest.objects.select_related(
            "appointment",
            "appointment__patient",
            "appointment__provider",
            "reviewed_by",
        )

        if user.is_staff or user.is_superuser:
            pass
        else:
            doctor = get_active_doctor_profile(user)

            if doctor is None:
                raise PermissionDenied(
                    "Only doctors and administrators can view reschedule requests."
                )

            queryset = queryset.filter(
                appointment__provider=doctor.provider,
            )

        request_status = self.request.query_params.get("status")

        if request_status in ("Pending", "Approved", "Rejected"):
            queryset = queryset.filter(status=request_status)

        return queryset.order_by("status", "-created_at")


class RescheduleRequestReviewView(APIView):
    """
    Assigned doctors or administrators approve/reject a reschedule request.

    Approving a reschedule also confirms the appointment if it was Pending.
    An appointment that was already Confirmed remains Confirmed.

    Database locks are acquired in provider -> appointment -> request order
    to stay consistent with appointment booking and reschedule submission.
    """

    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, pk):
        user = request.user

        if not user.is_active:
            raise PermissionDenied("An active account is required.")

        is_admin = user.is_staff or user.is_superuser

        doctor = (
            None
            if is_admin
            else get_active_doctor_profile(user)
        )

        if not is_admin and doctor is None:
            raise PermissionDenied(
                "Only the assigned doctor or an administrator can review this request."
            )

        review_serializer = AppointmentRescheduleReviewSerializer(
            data=request.data
        )

        review_serializer.is_valid(raise_exception=True)

        new_status = review_serializer.validated_data["status"]
        admin_response = review_serializer.validated_data.get(
            "admin_response",
            "",
        )

        try:
            with transaction.atomic():
                # First obtain the appointment ID without locking the request.
                request_reference = (
                    AppointmentRescheduleRequest.objects
                    .filter(pk=pk)
                    .values("appointment_id")
                    .first()
                )

                if request_reference is None:
                    return Response(
                        {"detail": "Reschedule request not found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                appointment_reference = (
                    Appointment.objects
                    .filter(pk=request_reference["appointment_id"])
                    .values("provider_id")
                    .first()
                )

                if appointment_reference is None:
                    return Response(
                        {"detail": "The associated appointment could not be found."},
                        status=status.HTTP_404_NOT_FOUND,
                    )

                # Keep lock order consistent with booking and submission.
                provider = Provider.objects.select_for_update().get(
                    pk=appointment_reference["provider_id"],
                )

                appointment = Appointment.objects.select_for_update().get(
                    pk=request_reference["appointment_id"],
                )

                reschedule_request = (
                    AppointmentRescheduleRequest.objects
                    .select_for_update()
                    .get(pk=pk)
                )

                if reschedule_request.appointment_id != appointment.pk:
                    raise ValidationError({
                        "appointment": "The reschedule request has changed. Please try again."
                    })

                if not is_admin and appointment.provider_id != doctor.provider_id:
                    raise PermissionDenied(
                        "You can only review requests for your own patients."
                    )

                if reschedule_request.status != "Pending":
                    raise ValidationError({
                        "status": "This rescheduling request has already been reviewed."
                    })

                if new_status == "Approved":
                    if not provider.is_active:
                        raise ValidationError({
                            "appointment": "This doctor is no longer available."
                        })

                    if appointment.status not in ("Pending", "Confirmed"):
                        raise ValidationError({
                            "appointment": (
                                "This appointment can no longer be rescheduled."
                            )
                        })

                    # Preserve the appointment's previous status so we can
                    # record a real status transition in appointment history.
                    old_appointment_status = appointment.status

                    validate_reschedule_slot(
                        reschedule_request,
                        appointment,
                    )

                    appointment.preferred_date = (
                        reschedule_request.requested_date
                    )

                    appointment.start_time = (
                        reschedule_request.requested_start_time
                    )

                    appointment.end_time = (
                        reschedule_request.requested_end_time
                    )

                    # Approval of the reschedule is also the final
                    # confirmation when the original appointment was Pending.
                    if old_appointment_status == "Pending":
                        appointment.status = "Confirmed"

                    appointment.save(
                        update_fields=[
                            "preferred_date",
                            "start_time",
                            "end_time",
                            "status",
                            "updated_at",
                        ]
                    )

                    # Record Pending -> Confirmed in the appointment history.
                    # No history entry is needed if it was already Confirmed.
                    if old_appointment_status != appointment.status:
                        AppointmentStatusHistory.objects.create(
                            appointment=appointment,
                            old_status=old_appointment_status,
                            new_status=appointment.status,
                            changed_by=user,
                        )

                reschedule_request.status = new_status
                reschedule_request.admin_response = admin_response
                reschedule_request.reviewed_by = user
                reschedule_request.reviewed_at = timezone.now()

                reschedule_request.save(
                    update_fields=[
                        "status",
                        "admin_response",
                        "reviewed_by",
                        "reviewed_at",
                        "updated_at",
                    ]
                )

                patient = appointment.patient
                doctor_user = get_doctor_user(provider)

                if new_status == "Approved":
                    notification_type = "appointment_reschedule_approved"
                    title = "Appointment rescheduled and confirmed"

                    message = (
                        f"Your appointment with {provider.name} has been "
                        f"rescheduled and confirmed for "
                        f"{appointment.preferred_date.strftime('%d %b %Y')} "
                        f"at {appointment.start_time.strftime('%H:%M')}."
                    )

                else:
                    notification_type = "appointment_reschedule_rejected"
                    title = "Reschedule request declined"

                    message = (
                        f"Your request to reschedule the appointment with "
                        f"{provider.name} was declined. "
                        f"Reason: {admin_response}"
                    )

                create_notification(
                    recipient=patient,
                    notification_type=notification_type,
                    title=title,
                    message=message,
                    appointment=appointment,
                )

                if doctor_user and doctor_user.pk != user.pk:
                    create_notification(
                        recipient=doctor_user,
                        notification_type=notification_type,
                        title=title,
                        message=(
                            f"The reschedule request for "
                            f"{get_display_name(patient)} was "
                            f"{new_status.lower()}. "
                            + (
                                (
                                    "The appointment has been rescheduled "
                                    "and confirmed."
                                )
                                if new_status == "Approved"
                                else message
                            )
                        ),
                        appointment=appointment,
                    )

                return Response(
                    AppointmentRescheduleRequestSerializer(
                        reschedule_request
                    ).data,
                    status=status.HTTP_200_OK,
                )

        except Provider.DoesNotExist:
            raise ValidationError({
                "appointment": "The doctor associated with this appointment could not be found."
            })

        except Appointment.DoesNotExist:
            raise ValidationError({
                "appointment": "The associated appointment could not be found."
            })

        except AppointmentRescheduleRequest.DoesNotExist:
            raise ValidationError({
                "detail": "The reschedule request could not be found."
            })

        except IntegrityError:
            raise ValidationError({
                "requested_start_time": (
                    "This slot has just become unavailable. "
                    "The appointment was not changed."
                )
            })
