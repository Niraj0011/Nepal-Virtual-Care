
import os

from datetime import datetime, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.db.models import Avg, Count
from django.utils import timezone

from rest_framework import serializers

from .models import (
    Provider,
    Appointment,
    DoctorProfile,
    DoctorAvailability,
    DoctorScheduleChangeRequest,
    DoctorLeaveRequest,
    MedicalDocument,
    Notification,
    Prescription,
    PrescriptionItem,
    PatientHealthHistory,
    DoctorReview,
    DoctorReviewReport,
    AppointmentRescheduleRequest,
)


User = get_user_model()


class ProviderSerializer(serializers.ModelSerializer):
    average_rating = serializers.SerializerMethodField()
    review_count = serializers.SerializerMethodField()

    class Meta:
        model = Provider
        fields = (
            "id", "name", "specialty", "city", "availability",
            "initials", "color", "rating", "average_rating",
            "review_count", "experience", "languages", "is_demo",
        )

    def get_approved_review_stats(self, obj):
        if not hasattr(obj, "_approved_review_stats"):
            obj._approved_review_stats = obj.reviews.filter(
                moderation_status="Approved"
            ).aggregate(
                average=Avg("rating"),
                count=Count("id"),
            )

        return obj._approved_review_stats

    def get_average_rating(self, obj):
        stats = self.get_approved_review_stats(obj)
        average = stats["average"]
        return round(average, 1) if average is not None else None

    def get_review_count(self, obj):
        stats = self.get_approved_review_stats(obj)
        return stats["count"] or 0


class DoctorAvailabilitySerializer(serializers.ModelSerializer):
    weekday_name = serializers.CharField(
        source="get_weekday_display",
        read_only=True,
    )

    class Meta:
        model = DoctorAvailability
        fields = (
            "id", "weekday", "weekday_name", "start_time",
            "end_time", "slot_duration", "is_available", "updated_at",
        )
        read_only_fields = ("id", "updated_at")

    def validate(self, attrs):
        is_available = attrs.get(
            "is_available",
            getattr(self.instance, "is_available", True),
        )
        start_time = attrs.get(
            "start_time",
            getattr(self.instance, "start_time", None),
        )
        end_time = attrs.get(
            "end_time",
            getattr(self.instance, "end_time", None),
        )
        slot_duration = attrs.get(
            "slot_duration",
            getattr(self.instance, "slot_duration", 30),
        )

        if not isinstance(slot_duration, int) or not 1 <= slot_duration <= 240:
            raise serializers.ValidationError({
                "slot_duration": (
                    "Appointment duration must be between 1 and 240 minutes."
                )
            })

        if is_available:
            if start_time is None or end_time is None:
                raise serializers.ValidationError(
                    "Start time and end time are required for an available day."
                )

            if end_time <= start_time:
                raise serializers.ValidationError(
                    "End time must be later than start time."
                )

            total_minutes = (
                end_time.hour * 60 + end_time.minute
                - start_time.hour * 60 - start_time.minute
            )

            if total_minutes < slot_duration:
                raise serializers.ValidationError(
                    "Working hours must be at least one appointment slot long."
                )
        else:
            attrs["start_time"] = None
            attrs["end_time"] = None

        return attrs


class AppointmentSerializer(serializers.ModelSerializer):
    provider = serializers.PrimaryKeyRelatedField(
        queryset=Provider.objects.filter(is_active=True)
    )
    provider_name = serializers.CharField(
        source="provider.name",
        read_only=True,
    )
    specialty = serializers.CharField(
        source="provider.specialty",
        read_only=True,
    )
    patient_id = serializers.IntegerField(read_only=True)
    patient_name = serializers.SerializerMethodField()
    patient_email = serializers.EmailField(
        source="patient.email",
        read_only=True,
    )
    patient_photo = serializers.SerializerMethodField()
    end_time = serializers.TimeField(read_only=True)

    class Meta:
        model = Appointment
        fields = (
            "id", "provider", "provider_name", "specialty",
            "patient_id", "patient_name", "patient_email",
            "patient_photo",
            "preferred_date", "start_time", "end_time",
            "consultation_type", "reason", "status", "created_at",
        )
        read_only_fields = (
            "id", "patient_id", "end_time", "status", "created_at",
            "provider_name", "specialty", "patient_name", "patient_email",
            "patient_photo",
        )

    def get_patient_name(self, obj):
        full_name = obj.patient.get_full_name().strip()
        return full_name or obj.patient.username

    def get_patient_photo(self, obj):
        patient_profile = getattr(
            obj.patient,
            "patient_profile",
            None,
        )

        if not patient_profile or not patient_profile.profile_photo:
            return None

        photo_url = patient_profile.profile_photo.url
        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(photo_url)

        return photo_url

    def validate_preferred_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "Preferred date cannot be in the past."
            )

        return value

    def validate(self, attrs):
        if self.instance is not None:
            return attrs

        provider = attrs.get("provider")
        preferred_date = attrs.get("preferred_date")
        start_time = attrs.get("start_time")

        if not provider or not preferred_date:
            return attrs

        if start_time is None:
            raise serializers.ValidationError({
                "start_time": "Please select an appointment time."
            })

        if not provider.is_active:
            raise serializers.ValidationError({
                "provider": "This doctor is currently unavailable."
            })

        availability = DoctorAvailability.objects.filter(
            provider=provider,
            weekday=preferred_date.weekday(),
            is_available=True,
        ).first()

        if availability is None:
            raise serializers.ValidationError({
                "start_time": (
                    "This doctor is not available on the selected day."
                )
            })

        if not availability.start_time or not availability.end_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The doctor's working hours are not configured."
                )
            })

        if start_time < availability.start_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The selected time is before the doctor's working hours."
                )
            })

        if start_time >= availability.end_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The selected time is outside the doctor's working hours."
                )
            })

        slot_duration = availability.slot_duration

        if not isinstance(slot_duration, int) or slot_duration <= 0:
            raise serializers.ValidationError({
                "start_time": (
                    "The doctor's appointment slot configuration is invalid."
                )
            })

        start_minutes = start_time.hour * 60 + start_time.minute
        opening_minutes = (
            availability.start_time.hour * 60
            + availability.start_time.minute
        )

        if (start_minutes - opening_minutes) % slot_duration != 0:
            raise serializers.ValidationError({
                "start_time": "Please select a valid appointment slot."
            })

        appointment_start = datetime.combine(
            preferred_date,
            start_time,
        )

        appointment_end = appointment_start + timedelta(
            minutes=slot_duration
        )

        end_time = appointment_end.time()

        if appointment_end.date() != preferred_date or end_time > availability.end_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The appointment would extend beyond the doctor's working hours."
                )
            })

        current_datetime = timezone.localtime()

        if preferred_date == current_datetime.date():
            if start_time <= current_datetime.time():
                raise serializers.ValidationError({
                    "start_time": (
                        "Please select a future appointment time."
                    )
                })

        approved_leave = DoctorLeaveRequest.objects.filter(
            provider=provider,
            leave_date=preferred_date,
            status="Approved",
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exists()

        if approved_leave:
            raise serializers.ValidationError({
                "start_time": (
                    "This time overlaps with the doctor's approved leave. "
                    "Please choose another slot."
                )
            })

        overlapping_appointments = Appointment.objects.filter(
            provider=provider,
            preferred_date=preferred_date,
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exclude(
            status="Cancelled"
        )

        if overlapping_appointments.exists():
            raise serializers.ValidationError({
                "start_time": (
                    "This appointment slot is already booked. "
                    "Please choose another time."
                )
            })

        attrs["end_time"] = end_time

        return attrs


class AppointmentStatusSerializer(serializers.ModelSerializer):
    ALLOWED_TRANSITIONS = {
        "Pending": {"Confirmed", "Cancelled"},
        "Confirmed": {"Completed", "Cancelled"},
        "Completed": set(),
        "Cancelled": set(),
    }

    class Meta:
        model = Appointment
        fields = ("id", "status")
        read_only_fields = ("id",)

    def validate_status(self, value):
        if not self.instance:
            raise serializers.ValidationError(
                "An existing appointment is required."
            )

        current_status = self.instance.status

        if value == current_status:
            return value

        allowed_statuses = self.ALLOWED_TRANSITIONS.get(
            current_status,
            set(),
        )

        if value not in allowed_statuses:
            raise serializers.ValidationError(
                f"An appointment cannot move from "
                f"{current_status} to {value}."
            )

        return value


class DoctorScheduleChangeRequestCreateSerializer(serializers.ModelSerializer):
    requested_schedule = serializers.JSONField()

    class Meta:
        model = DoctorScheduleChangeRequest
        fields = ("requested_schedule", "reason")

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Please explain why you need to change your schedule."
            )

        if len(value) > 1000:
            raise serializers.ValidationError(
                "The reason cannot exceed 1000 characters."
            )

        return value

    def validate_requested_schedule(self, value):
        if not isinstance(value, list) or len(value) != 7:
            raise serializers.ValidationError(
                "The requested schedule must be a list of seven days."
            )

        schedule_serializer = DoctorAvailabilitySerializer(
            data=value,
            many=True,
        )

        schedule_serializer.is_valid(raise_exception=True)
        validated_schedule = schedule_serializer.validated_data

        weekdays = [
            day["weekday"]
            for day in validated_schedule
        ]

        if len(set(weekdays)) != 7 or set(weekdays) != set(range(7)):
            raise serializers.ValidationError(
                "The schedule must contain each weekday exactly once."
            )

        return [
            {
                "weekday": day["weekday"],
                "start_time": (
                    day["start_time"].strftime("%H:%M:%S")
                    if day.get("start_time") else None
                ),
                "end_time": (
                    day["end_time"].strftime("%H:%M:%S")
                    if day.get("end_time") else None
                ),
                "slot_duration": day.get("slot_duration", 30),
                "is_available": day.get("is_available", True),
            }
            for day in validated_schedule
        ]

    def create(self, validated_data):
        return DoctorScheduleChangeRequest.objects.create(
            doctor=self.context["request"].user,
            provider=self.context["provider"],
            **validated_data,
        )


class DoctorScheduleChangeRequestSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    provider_name = serializers.CharField(
        source="provider.name",
        read_only=True,
    )

    class Meta:
        model = DoctorScheduleChangeRequest
        fields = (
            "id", "doctor", "doctor_name", "provider", "provider_name",
            "requested_schedule", "reason", "status", "admin_response",
            "reviewed_by", "created_at", "reviewed_at", "updated_at",
        )
        read_only_fields = fields

    def get_doctor_name(self, obj):
        full_name = obj.doctor.get_full_name().strip()
        return full_name or obj.doctor.username


class AdminScheduleChangeReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorScheduleChangeRequest
        fields = ("status", "admin_response")

    def validate_status(self, value):
        if value not in ("Approved", "Rejected"):
            raise serializers.ValidationError(
                "A schedule change request can only be approved or rejected."
            )

        return value

    def validate(self, attrs):
        status_value = attrs.get("status")
        admin_response = attrs.get("admin_response", "").strip()

        if status_value == "Rejected" and not admin_response:
            raise serializers.ValidationError({
                "admin_response": (
                    "Please explain why this schedule change request "
                    "is being rejected."
                )
            })

        attrs["admin_response"] = admin_response

        return attrs


class DoctorLeaveRequestCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorLeaveRequest
        fields = (
            "leave_date", "leave_type", "start_time", "end_time", "reason",
        )
        extra_kwargs = {
            "start_time": {"required": False, "allow_null": True},
            "end_time": {"required": False, "allow_null": True},
        }

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Please provide a reason for your leave request."
            )

        if len(value) > 1000:
            raise serializers.ValidationError(
                "The reason cannot exceed 1000 characters."
            )

        return value

    def validate_leave_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "Leave date cannot be in the past."
            )

        return value

    def validate(self, attrs):
        provider = self.context["provider"]
        leave_date = attrs["leave_date"]
        leave_type = attrs["leave_type"]

        availability = DoctorAvailability.objects.filter(
            provider=provider,
            weekday=leave_date.weekday(),
            is_available=True,
        ).first()

        if not availability:
            raise serializers.ValidationError({
                "leave_date": (
                    "You do not have working hours configured for this day."
                )
            })

        opening = availability.start_time
        closing = availability.end_time

        if not opening or not closing:
            raise serializers.ValidationError(
                "Your working hours are not configured for this day."
            )

        if leave_type in ("Full day", "Morning", "Afternoon"):
            if attrs.get("start_time") or attrs.get("end_time"):
                raise serializers.ValidationError({
                    "start_time": (
                        "Start and end times are calculated automatically "
                        "for full-day and half-day leave."
                    )
                })

            opening_minutes = opening.hour * 60 + opening.minute
            closing_minutes = closing.hour * 60 + closing.minute
            total_minutes = closing_minutes - opening_minutes

            if leave_type == "Full day":
                start_minutes = opening_minutes
                end_minutes = closing_minutes
            elif leave_type == "Morning":
                start_minutes = opening_minutes
                end_minutes = opening_minutes + total_minutes // 2
            else:
                start_minutes = opening_minutes + total_minutes // 2
                end_minutes = closing_minutes

            attrs["start_time"] = (
                datetime.min + timedelta(minutes=start_minutes)
            ).time()

            attrs["end_time"] = (
                datetime.min + timedelta(minutes=end_minutes)
            ).time()

        elif leave_type == "Custom":
            start_time = attrs.get("start_time")
            end_time = attrs.get("end_time")

            if not start_time or not end_time:
                raise serializers.ValidationError({
                    "start_time": (
                        "Please provide both start and end times for custom leave."
                    )
                })

            if end_time <= start_time:
                raise serializers.ValidationError({
                    "end_time": "End time must be later than start time."
                })

            if start_time < opening or end_time > closing:
                raise serializers.ValidationError({
                    "start_time": (
                        "Custom leave must fall within your working hours."
                    )
                })

        else:
            raise serializers.ValidationError({
                "leave_type": "Please select a valid leave type."
            })

        if leave_date == timezone.localdate():
            if attrs["start_time"] <= timezone.localtime().time():
                raise serializers.ValidationError({
                    "start_time": (
                        "The requested leave period must not have already started."
                    )
                })

        return attrs

    def create(self, validated_data):
        return DoctorLeaveRequest.objects.create(
            doctor=self.context["request"].user,
            provider=self.context["provider"],
            **validated_data,
        )


class DoctorLeaveRequestSerializer(serializers.ModelSerializer):
    doctor_name = serializers.SerializerMethodField()
    provider_name = serializers.CharField(
        source="provider.name",
        read_only=True,
    )
    leave_type_display = serializers.CharField(
        source="get_leave_type_display",
        read_only=True,
    )
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = DoctorLeaveRequest
        fields = (
            "id", "doctor", "doctor_name", "provider", "provider_name",
            "leave_date", "leave_type", "leave_type_display",
            "start_time", "end_time", "reason", "status",
            "admin_response", "reviewed_by", "reviewed_by_name",
            "created_at", "reviewed_at", "updated_at",
        )
        read_only_fields = fields

    def get_doctor_name(self, obj):
        full_name = obj.doctor.get_full_name().strip()
        return full_name or obj.doctor.username

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None

        full_name = obj.reviewed_by.get_full_name().strip()
        return full_name or obj.reviewed_by.username


class AdminLeaveRequestReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorLeaveRequest
        fields = ("status", "admin_response")

    def validate_status(self, value):
        if value not in ("Approved", "Rejected"):
            raise serializers.ValidationError(
                "A leave request can only be approved or rejected."
            )

        return value

    def validate(self, attrs):
        status_value = attrs.get("status")
        admin_response = attrs.get("admin_response", "").strip()

        if status_value == "Rejected" and not admin_response:
            raise serializers.ValidationError({
                "admin_response": (
                    "Please explain why this leave request is being rejected."
                )
            })

        attrs["admin_response"] = admin_response

        return attrs


class DoctorAccountSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    provider = serializers.PrimaryKeyRelatedField(
        queryset=Provider.objects.filter(is_active=True)
    )

    def validate_email(self, value):
        email = value.strip().lower()

        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        if User.objects.filter(username__iexact=email).exists():
            raise serializers.ValidationError(
                "This email is already being used as a username."
            )

        return email

    def validate_password(self, value):
        validate_password(value)
        return value

    def validate_provider(self, value):
        if DoctorProfile.objects.filter(provider=value).exists():
            raise serializers.ValidationError(
                "This provider is already linked to a doctor account."
            )

        return value

    @transaction.atomic
    def create(self, validated_data):
        email = validated_data["email"]

        doctor_user = User.objects.create_user(
            username=email,
            email=email,
            first_name=validated_data["first_name"],
            last_name=validated_data["last_name"],
            password=validated_data["password"],
        )

        DoctorProfile.objects.create(
            user=doctor_user,
            provider=validated_data["provider"],
            is_active=True,
        )

        return doctor_user


class DoctorListSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(
        source="user.email",
        read_only=True,
    )
    first_name = serializers.CharField(
        source="user.first_name",
        max_length=150,
    )
    last_name = serializers.CharField(
        source="user.last_name",
        max_length=150,
    )
    provider_name = serializers.CharField(
        source="provider.name",
        read_only=True,
    )
    specialty = serializers.CharField(
        source="provider.specialty",
        read_only=True,
    )
    city = serializers.CharField(
        source="provider.city",
        read_only=True,
    )

    class Meta:
        model = DoctorProfile
        fields = (
            "id", "email", "first_name", "last_name", "provider",
            "provider_name", "specialty", "city", "is_active",
        )
        read_only_fields = (
            "id", "email", "provider_name", "specialty", "city",
        )

    def validate_provider(self, value):
        doctor_profile = self.instance

        existing_assignment = DoctorProfile.objects.filter(
            provider=value
        )

        if doctor_profile:
            existing_assignment = existing_assignment.exclude(
                id=doctor_profile.id
            )

        if existing_assignment.exists():
            raise serializers.ValidationError(
                "This provider is already linked to another doctor account."
            )

        if not value.is_active:
            raise serializers.ValidationError(
                "You cannot assign an inactive provider."
            )

        return value

    @transaction.atomic
    def update(self, instance, validated_data):
        user_data = validated_data.pop("user", {})
        user_fields_to_update = []

        if "first_name" in user_data:
            instance.user.first_name = user_data["first_name"]
            user_fields_to_update.append("first_name")

        if "last_name" in user_data:
            instance.user.last_name = user_data["last_name"]
            user_fields_to_update.append("last_name")

        if "is_active" in validated_data:
            instance.user.is_active = validated_data["is_active"]
            user_fields_to_update.append("is_active")

        if user_fields_to_update:
            instance.user.save(
                update_fields=user_fields_to_update
            )

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        instance.save()

        return instance


class PatientManagementSerializer(serializers.ModelSerializer):
    appointments_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id", "username", "email", "first_name", "last_name",
            "date_joined", "is_active", "appointments_count",
        )
        read_only_fields = (
            "id", "username", "email", "date_joined",
            "appointments_count",
        )

    def get_appointments_count(self, obj):
        return obj.appointments.count()


class MedicalDocumentSerializer(serializers.ModelSerializer):
    file = serializers.FileField(write_only=True)
    file_name = serializers.SerializerMethodField()

    class Meta:
        model = MedicalDocument
        fields = (
            "id", "title", "document_type", "file",
            "file_name", "uploaded_at",
        )
        read_only_fields = ("id", "file_name", "uploaded_at")

    def get_file_name(self, obj):
        return os.path.basename(obj.file.name)

    def validate_file(self, value):
        allowed_signatures = {
            ".pdf": (b"%PDF-",),
            ".jpg": (b"\xff\xd8\xff",),
            ".jpeg": (b"\xff\xd8\xff",),
            ".png": (b"\x89PNG\r\n\x1a\n",),
        }

        extension = os.path.splitext(value.name)[1].lower()

        if extension not in allowed_signatures:
            raise serializers.ValidationError(
                "Only PDF, JPG, JPEG and PNG files are allowed."
            )

        if value.size <= 0:
            raise serializers.ValidationError(
                "The uploaded file is empty."
            )

        if value.size > 5 * 1024 * 1024:
            raise serializers.ValidationError(
                "File size cannot exceed 5 MB."
            )

        value.seek(0)
        file_header = value.read(1024)
        value.seek(0)

        valid_signature = any(
            signature in file_header
            if extension == ".pdf"
            else file_header.startswith(signature)
            for signature in allowed_signatures[extension]
        )

        if not valid_signature:
            raise serializers.ValidationError(
                "The file content does not match its file extension."
            )

        return value


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = (
            "id", "notification_type", "title", "message",
            "appointment", "is_read", "created_at",
        )
        read_only_fields = fields


class PrescriptionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PrescriptionItem
        fields = (
            "id", "medicine_name", "strength", "dosage", "route",
            "frequency", "duration", "quantity", "instructions",
            "sort_order",
        )
        read_only_fields = ("id",)

    def validate_medicine_name(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Medicine name is required."
            )

        return value

    def validate_dosage(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Dosage is required."
            )

        return value

    def validate_frequency(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Medicine frequency is required."
            )

        return value

    def validate_duration(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Medicine duration is required."
            )

        return value


class PrescriptionCreateSerializer(serializers.ModelSerializer):
    appointment = serializers.PrimaryKeyRelatedField(
        queryset=Appointment.objects.all()
    )
    replaces = serializers.PrimaryKeyRelatedField(
        queryset=Prescription.objects.all(),
        required=False,
        allow_null=True,
    )
    items = PrescriptionItemSerializer(many=True)

    class Meta:
        model = Prescription
        fields = (
            "appointment", "diagnosis", "clinical_notes",
            "instructions", "replaces", "items",
        )

    def validate_diagnosis(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "A diagnosis is required."
            )

        return value

    def validate(self, attrs):
        appointment = attrs["appointment"]
        request = self.context["request"]

        doctor_profile = DoctorProfile.objects.filter(
            user=request.user,
            is_active=True,
            user__is_active=True,
            provider__is_active=True,
        ).select_related("provider").first()

        if doctor_profile is None:
            raise serializers.ValidationError(
                "An active doctor account is required to issue prescriptions."
            )

        if appointment.provider_id != doctor_profile.provider_id:
            raise serializers.ValidationError({
                "appointment": (
                    "You can only issue prescriptions for your own patients."
                )
            })

        if appointment.status not in ("Confirmed", "Completed"):
            raise serializers.ValidationError({
                "appointment": (
                    "Prescriptions can only be issued for confirmed "
                    "or completed appointments."
                )
            })

        replaces = attrs.get("replaces")

        if replaces:
            if replaces.appointment_id != appointment.id:
                raise serializers.ValidationError({
                    "replaces": (
                        "A replacement must belong to the same appointment."
                    )
                })

            if replaces.doctor_id != doctor_profile.id:
                raise serializers.ValidationError({
                    "replaces": (
                        "You can only replace a prescription you issued."
                    )
                })

            if replaces.patient_id != appointment.patient_id:
                raise serializers.ValidationError({
                    "replaces": (
                        "The original prescription belongs to a different patient."
                    )
                })

            if replaces.replacements.exists():
                raise serializers.ValidationError({
                    "replaces": (
                        "This prescription has already been replaced."
                    )
                })

        items = attrs.get("items", [])

        if not items:
            raise serializers.ValidationError({
                "items": "Please add at least one medicine."
            })

        if len(items) > 30:
            raise serializers.ValidationError({
                "items": (
                    "A prescription cannot contain more than 30 medicines."
                )
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        items_data = validated_data.pop("items")
        appointment = validated_data.pop("appointment")
        replaces = validated_data.get("replaces")

        request = self.context["request"]

        appointment = Appointment.objects.select_for_update().get(
            pk=appointment.pk
        )

        doctor_profile = DoctorProfile.objects.select_related(
            "provider"
        ).get(
            user=request.user,
            is_active=True,
        )

        if (
            not request.user.is_active
            or not doctor_profile.provider.is_active
            or appointment.provider_id != doctor_profile.provider_id
        ):
            raise serializers.ValidationError(
                "You are not authorized to prescribe for this appointment."
            )

        if appointment.status not in ("Confirmed", "Completed"):
            raise serializers.ValidationError(
                "This appointment is no longer eligible for a prescription."
            )

        if replaces:
            replaces = Prescription.objects.select_for_update().get(
                pk=replaces.pk
            )

            if (
                replaces.appointment_id != appointment.id
                or replaces.doctor_id != doctor_profile.id
                or replaces.patient_id != appointment.patient_id
            ):
                raise serializers.ValidationError({
                    "replaces": (
                        "The original prescription does not match "
                        "this appointment, doctor, or patient."
                    )
                })

            if replaces.replacements.exists():
                raise serializers.ValidationError({
                    "replaces": (
                        "This prescription has already been replaced."
                    )
                })

        prescription = Prescription.objects.create(
            patient=appointment.patient,
            doctor=doctor_profile,
            appointment=appointment,
            **validated_data,
        )

        PrescriptionItem.objects.bulk_create([
            PrescriptionItem(
                prescription=prescription,
                **item_data,
            )
            for item_data in items_data
        ])

        return prescription


class PrescriptionSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(
        many=True,
        read_only=True,
    )
    patient_name = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    provider_name = serializers.CharField(
        source="doctor.provider.name",
        read_only=True,
    )
    specialty = serializers.CharField(
        source="doctor.provider.specialty",
        read_only=True,
    )
    appointment_date = serializers.DateField(
        source="appointment.preferred_date",
        read_only=True,
    )
    appointment_time = serializers.TimeField(
        source="appointment.start_time",
        read_only=True,
    )
    replaces_id = serializers.IntegerField(
        source="replaces.id",
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Prescription
        fields = (
            "id", "patient", "patient_name", "doctor", "doctor_name",
            "provider_name", "specialty", "appointment",
            "appointment_date", "appointment_time", "diagnosis",
            "clinical_notes", "instructions", "replaces",
            "replaces_id", "items", "issued_at",
        )
        read_only_fields = fields

    def get_patient_name(self, obj):
        full_name = obj.patient.get_full_name().strip()
        return full_name or obj.patient.username

    def get_doctor_name(self, obj):
        full_name = obj.doctor.user.get_full_name().strip()
        return full_name or obj.doctor.user.username


class PatientHealthHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientHealthHistory
        fields = (
            "id", "patient", "medical_conditions", "allergies",
            "current_medications", "past_surgeries",
            "family_medical_history", "additional_notes",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "patient", "created_at", "updated_at",
        )

    def validate_medical_conditions(self, value):
        return value.strip()

    def validate_allergies(self, value):
        return value.strip()

    def validate_current_medications(self, value):
        return value.strip()

    def validate_past_surgeries(self, value):
        return value.strip()

    def validate_family_medical_history(self, value):
        return value.strip()

    def validate_additional_notes(self, value):
        return value.strip()


class DoctorReviewCreateUpdateSerializer(serializers.ModelSerializer):
    appointment = serializers.PrimaryKeyRelatedField(
        queryset=Appointment.objects.all(),
        required=True,
    )
    rating = serializers.IntegerField(min_value=1, max_value=5)

    class Meta:
        model = DoctorReview
        fields = ("appointment", "rating", "comment")

    def validate_comment(self, value):
        value = value.strip()
        if len(value) > 2000:
            raise serializers.ValidationError(
                "Your review cannot exceed 2000 characters."
            )
        return value

    def validate(self, attrs):
        request = self.context["request"]

        if self.instance is not None:
            appointment = self.instance.appointment

            if "appointment" in attrs:
                if attrs["appointment"].id != appointment.id:
                    raise serializers.ValidationError({
                        "appointment": "A review cannot be moved to another appointment."
                    })
        else:
            appointment = attrs.get("appointment")

        if appointment is None:
            raise serializers.ValidationError({
                "appointment": "An appointment is required."
            })

        if appointment.patient_id != request.user.id:
            raise serializers.ValidationError({
                "appointment": "You can only review your own appointments."
            })

        if appointment.status != "Completed":
            raise serializers.ValidationError({
                "appointment": "You can only review a doctor after the appointment has been completed."
            })

        return attrs

    def create(self, validated_data):
        appointment = validated_data["appointment"]

        return DoctorReview.objects.create(
            patient=self.context["request"].user,
            provider=appointment.provider,
            appointment=appointment,
            rating=validated_data["rating"],
            comment=validated_data.get("comment", ""),
            moderation_status="Approved",
        )

    def update(self, instance, validated_data):
        instance.rating = validated_data.get(
            "rating", instance.rating
        )
        instance.comment = validated_data.get(
            "comment", instance.comment
        )

        instance.moderation_status = "Approved"
        instance.moderation_note = ""
        instance.moderated_by = None
        instance.moderated_at = None

        instance.save()
        return instance


class DoctorReviewSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    provider_name = serializers.CharField(
        source="provider.name", read_only=True
    )

    class Meta:
        model = DoctorReview
        fields = (
            "id", "patient", "patient_name", "provider",
            "provider_name", "appointment", "rating", "comment",
            "moderation_status", "moderation_note", "moderated_by",
            "moderated_at", "created_at", "updated_at",
        )
        read_only_fields = fields

    def get_patient_name(self, obj):
        full_name = obj.patient.get_full_name().strip()
        return full_name or obj.patient.username


class DoctorReviewReportCreateSerializer(serializers.ModelSerializer):
    review = serializers.PrimaryKeyRelatedField(
        queryset=DoctorReview.objects.filter(
            moderation_status="Approved"
        )
    )

    class Meta:
        model = DoctorReviewReport
        fields = ("review", "reason")

    def validate_reason(self, value):
        value = value.strip()

        if not value:
            raise serializers.ValidationError(
                "Please explain why you are reporting this review."
            )

        if len(value) > 1000:
            raise serializers.ValidationError(
                "The report reason cannot exceed 1000 characters."
            )

        return value

    def validate_review(self, value):
        if value.patient_id == self.context["request"].user.id:
            raise serializers.ValidationError(
                "You cannot report your own review."
            )
        return value

    def create(self, validated_data):
        return DoctorReviewReport.objects.create(
            reporter=self.context["request"].user,
            **validated_data,
        )


class DoctorReviewReportSerializer(serializers.ModelSerializer):
    reporter_name = serializers.SerializerMethodField()
    review_rating = serializers.IntegerField(
        source="review.rating", read_only=True
    )
    review_comment = serializers.CharField(
        source="review.comment", read_only=True
    )
    provider_name = serializers.CharField(
        source="review.provider.name", read_only=True
    )

    class Meta:
        model = DoctorReviewReport
        fields = (
            "id", "review", "review_rating", "review_comment",
            "provider_name", "reporter", "reporter_name",
            "reason", "status", "admin_note", "reviewed_by",
            "created_at", "reviewed_at",
        )
        read_only_fields = fields

    def get_reporter_name(self, obj):
        full_name = obj.reporter.get_full_name().strip()
        return full_name or obj.reporter.username


class AdminDoctorReviewReportUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorReviewReport
        fields = ("status", "admin_note")

    def validate_status(self, value):
        if value not in ("Pending", "Reviewed"):
            raise serializers.ValidationError(
                "Invalid report status."
            )
        return value

    def validate(self, attrs):
        attrs["admin_note"] = attrs.get(
            "admin_note", ""
        ).strip()
        return attrs


# =========================================
# APPOINTMENT RESCHEDULING
# =========================================

class AppointmentRescheduleRequestCreateSerializer(serializers.ModelSerializer):
    appointment = serializers.PrimaryKeyRelatedField(
        queryset=Appointment.objects.select_related("provider", "patient").all()
    )
    requested_end_time = serializers.TimeField(read_only=True)

    class Meta:
        model = AppointmentRescheduleRequest
        fields = (
            "id",
            "appointment",
            "requested_date",
            "requested_start_time",
            "requested_end_time",
            "reason",
            "status",
            "created_at",
        )
        read_only_fields = ("id", "requested_end_time", "status", "created_at")

    def validate_reason(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError(
                "Please explain why you need to reschedule this appointment."
            )
        if len(value) > 1000:
            raise serializers.ValidationError(
                "The reason cannot exceed 1000 characters."
            )
        return value

    def validate(self, attrs):
        request = self.context["request"]
        appointment = attrs["appointment"]
        requested_date = attrs["requested_date"]
        requested_start_time = attrs["requested_start_time"]

        if appointment.patient_id != request.user.id:
            raise serializers.ValidationError({
                "appointment": "You can only reschedule your own appointments."
            })

        if appointment.status not in ("Pending", "Confirmed"):
            raise serializers.ValidationError({
                "appointment": "Only pending or confirmed appointments can be rescheduled."
            })

        now = timezone.localtime()
        requested_datetime = datetime.combine(
            requested_date, requested_start_time
        )

        if requested_datetime <= now.replace(tzinfo=None):
            raise serializers.ValidationError({
                "requested_start_time": "Please select a future date and time."
            })

        if (
            requested_date == appointment.preferred_date
            and requested_start_time == appointment.start_time
        ):
            raise serializers.ValidationError({
                "requested_start_time": "Please choose a different appointment time."
            })

        availability = DoctorAvailability.objects.filter(
            provider=appointment.provider,
            weekday=requested_date.weekday(),
            is_available=True,
        ).first()

        if availability is None or not availability.start_time or not availability.end_time:
            raise serializers.ValidationError({
                "requested_date": "This doctor is not available on the selected day."
            })

        if requested_start_time < availability.start_time:
            raise serializers.ValidationError({
                "requested_start_time": "The selected time is before the doctor's working hours."
            })

        start_minutes = requested_start_time.hour * 60 + requested_start_time.minute
        opening_minutes = availability.start_time.hour * 60 + availability.start_time.minute

        if (start_minutes - opening_minutes) % availability.slot_duration != 0:
            raise serializers.ValidationError({
                "requested_start_time": "Please select a valid appointment slot."
            })

        requested_end_datetime = requested_datetime + timedelta(
            minutes=availability.slot_duration
        )
        requested_end_time = requested_end_datetime.time()

        if requested_end_time > availability.end_time:
            raise serializers.ValidationError({
                "requested_start_time": "The appointment would extend beyond the doctor's working hours."
            })

        approved_leave = DoctorLeaveRequest.objects.filter(
            provider=appointment.provider,
            leave_date=requested_date,
            status="Approved",
            start_time__lt=requested_end_time,
            end_time__gt=requested_start_time,
        ).exists()

        if approved_leave:
            raise serializers.ValidationError({
                "requested_start_time": "This time overlaps with the doctor's approved leave. Please choose another slot."
            })

        overlapping_appointments = Appointment.objects.filter(
            provider=appointment.provider,
            preferred_date=requested_date,
            start_time__lt=requested_end_time,
            end_time__gt=requested_start_time,
        ).exclude(status="Cancelled").exclude(pk=appointment.pk)

        if overlapping_appointments.exists():
            raise serializers.ValidationError({
                "requested_start_time": "This appointment slot is already booked. Please choose another time."
            })

        if AppointmentRescheduleRequest.objects.filter(
            appointment=appointment, status="Pending"
        ).exists():
            raise serializers.ValidationError({
                "appointment": "You already have a pending rescheduling request for this appointment."
            })

        approved_reschedules = AppointmentRescheduleRequest.objects.filter(
            appointment=appointment,
            status="Approved",
        ).count()

        if approved_reschedules >= 2:
            raise serializers.ValidationError({
                "appointment": (
                    "This appointment has already been rescheduled twice. "
                    "Please contact the clinic if you need another change."
                )
            })

        now = timezone.now()
        original_appointment_start = timezone.make_aware(
            datetime.combine(
                appointment.preferred_date,
                appointment.start_time,
            ),
            timezone.get_current_timezone(),
        )

        if original_appointment_start - now < timedelta(hours=12):
            raise serializers.ValidationError({
                "appointment": (
                    "Rescheduling must be requested at least "
                    "12 hours before your appointment."
                )
            })

        attrs["requested_end_time"] = requested_end_time
        return attrs

    def create(self, validated_data):
        return AppointmentRescheduleRequest.objects.create(**validated_data)


class AppointmentRescheduleRequestSerializer(serializers.ModelSerializer):
    patient_name = serializers.SerializerMethodField()
    patient_photo = serializers.SerializerMethodField()
    doctor_name = serializers.SerializerMethodField()
    provider_name = serializers.CharField(
        source="appointment.provider.name", read_only=True
    )
    appointment_date = serializers.DateField(
        source="appointment.preferred_date", read_only=True
    )
    appointment_start_time = serializers.TimeField(
        source="appointment.start_time", read_only=True
    )
    appointment_end_time = serializers.TimeField(
        source="appointment.end_time", read_only=True
    )

    # Snapshot of the appointment's date and time when this request was created.
    original_date = serializers.DateField(read_only=True)
    original_start_time = serializers.TimeField(read_only=True)
    original_end_time = serializers.TimeField(read_only=True)

    appointment_status = serializers.CharField(
        source="appointment.status", read_only=True
    )
    reviewed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = AppointmentRescheduleRequest
        fields = (
            "id",
            "appointment",
            "patient_name",
            "patient_photo",
            "doctor_name",
            "provider_name",
            "appointment_date",
            "appointment_start_time",
            "appointment_end_time",
            "original_date",
            "original_start_time",
            "original_end_time",
            "appointment_status",
            "requested_date",
            "requested_start_time",
            "requested_end_time",
            "reason",
            "status",
            "admin_response",
            "reviewed_by",
            "reviewed_by_name",
            "created_at",
            "reviewed_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_patient_name(self, obj):
        patient = obj.appointment.patient
        return patient.get_full_name().strip() or patient.username

    def get_patient_photo(self, obj):
        patient = obj.appointment.patient
        patient_profile = getattr(
            patient, "patient_profile", None
        )

        if not patient_profile or not patient_profile.profile_photo:
            return None

        photo_url = patient_profile.profile_photo.url
        request = self.context.get("request")

        if request:
            return request.build_absolute_uri(photo_url)

        return photo_url

    def get_doctor_name(self, obj):
        doctor_profile = DoctorProfile.objects.filter(
            provider=obj.appointment.provider
        ).select_related("user").first()
        if not doctor_profile:
            return obj.appointment.provider.name
        return doctor_profile.user.get_full_name().strip() or doctor_profile.user.username

    def get_reviewed_by_name(self, obj):
        if not obj.reviewed_by:
            return None
        return obj.reviewed_by.get_full_name().strip() or obj.reviewed_by.username


class AppointmentRescheduleReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = AppointmentRescheduleRequest
        fields = ("status", "admin_response")

    def validate_status(self, value):
        if value not in ("Approved", "Rejected"):
            raise serializers.ValidationError(
                "A rescheduling request can only be approved or rejected."
            )
        return value

    def validate(self, attrs):
        status_value = attrs.get("status")
        admin_response = attrs.get("admin_response", "").strip()

        if status_value == "Rejected" and not admin_response:
            raise serializers.ValidationError({
                "admin_response": "Please provide a reason when rejecting a rescheduling request."
            })

        attrs["admin_response"] = admin_response
        return attrs


# =========================================
# DOCTOR-CREATED FOLLOW-UP APPOINTMENTS
# =========================================

class AppointmentFollowUpCreateSerializer(serializers.Serializer):
    original_appointment = serializers.PrimaryKeyRelatedField(
        queryset=Appointment.objects.select_related(
            "patient",
            "provider",
        ).all()
    )
    preferred_date = serializers.DateField()
    start_time = serializers.TimeField()
    reason = serializers.CharField(
        max_length=1000,
        trim_whitespace=True,
    )

    def validate_reason(self, value):
        if not value.strip():
            raise serializers.ValidationError(
                "Please provide a reason for the follow-up appointment."
            )
        return value.strip()

    def validate_preferred_date(self, value):
        if value < timezone.localdate():
            raise serializers.ValidationError(
                "A follow-up appointment cannot be scheduled in the past."
            )
        return value

    def validate(self, attrs):
        request = self.context["request"]
        original_appointment = attrs["original_appointment"]
        preferred_date = attrs["preferred_date"]
        start_time = attrs["start_time"]

        doctor_profile = DoctorProfile.objects.filter(
            user=request.user,
            is_active=True,
            user__is_active=True,
            provider__is_active=True,
        ).select_related("provider").first()

        if doctor_profile is None:
            raise serializers.ValidationError(
                "An active doctor account is required to schedule a follow-up."
            )

        if original_appointment.provider_id != doctor_profile.provider_id:
            raise serializers.ValidationError({
                "original_appointment": (
                    "You can only schedule follow-ups for your own patients."
                )
            })

        if original_appointment.status != "Completed":
            raise serializers.ValidationError({
                "original_appointment": (
                    "Follow-up appointments can only be created "
                    "after the original consultation is completed."
                )
            })

        if preferred_date == timezone.localdate():
            if start_time <= timezone.localtime().time():
                raise serializers.ValidationError({
                    "start_time": "Please select a future appointment time."
                })

        availability = DoctorAvailability.objects.filter(
            provider=original_appointment.provider,
            weekday=preferred_date.weekday(),
            is_available=True,
        ).first()

        if (
            availability is None
            or availability.start_time is None
            or availability.end_time is None
        ):
            raise serializers.ValidationError({
                "preferred_date": (
                    "The doctor is not available on the selected day."
                )
            })

        if start_time < availability.start_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The selected time is before the doctor's working hours."
                )
            })

        if start_time >= availability.end_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The selected time is outside the doctor's working hours."
                )
            })

        start_minutes = start_time.hour * 60 + start_time.minute
        opening_minutes = (
            availability.start_time.hour * 60
            + availability.start_time.minute
        )

        if (
            start_minutes - opening_minutes
        ) % availability.slot_duration != 0:
            raise serializers.ValidationError({
                "start_time": "Please select a valid appointment slot."
            })

        appointment_start = datetime.combine(
            preferred_date,
            start_time,
        )
        appointment_end = appointment_start + timedelta(
            minutes=availability.slot_duration
        )
        end_time = appointment_end.time()

        if end_time > availability.end_time:
            raise serializers.ValidationError({
                "start_time": (
                    "The follow-up would extend beyond the doctor's working hours."
                )
            })

        approved_leave = DoctorLeaveRequest.objects.filter(
            provider=original_appointment.provider,
            leave_date=preferred_date,
            status="Approved",
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exists()

        if approved_leave:
            raise serializers.ValidationError({
                "start_time": (
                    "This time overlaps with the doctor's approved leave. "
                    "Please choose another slot."
                )
            })

        overlapping_appointments = Appointment.objects.filter(
            provider=original_appointment.provider,
            preferred_date=preferred_date,
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exclude(status="Cancelled")

        if overlapping_appointments.exists():
            raise serializers.ValidationError({
                "start_time": (
                    "This appointment slot is already booked. "
                    "Please choose another slot."
                )
            })

        attrs["end_time"] = end_time
        attrs["doctor_profile"] = doctor_profile

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        original_appointment = Appointment.objects.select_for_update().select_related(
            "patient",
            "provider",
        ).get(
            pk=validated_data["original_appointment"].pk
        )

        doctor_profile = DoctorProfile.objects.select_related(
            "provider"
        ).get(
            user=self.context["request"].user,
            is_active=True,
        )

        if original_appointment.status != "Completed":
            raise serializers.ValidationError({
                "original_appointment": (
                    "The original consultation must be completed "
                    "before scheduling a follow-up."
                )
            })

        if original_appointment.provider_id != doctor_profile.provider_id:
            raise serializers.ValidationError(
                "You are not authorized to schedule this follow-up."
            )

        preferred_date = validated_data["preferred_date"]
        start_time = validated_data["start_time"]
        end_time = validated_data["end_time"]

        conflicting_appointment = Appointment.objects.select_for_update().filter(
            provider=original_appointment.provider,
            preferred_date=preferred_date,
            start_time__lt=end_time,
            end_time__gt=start_time,
        ).exclude(status="Cancelled").exists()

        if conflicting_appointment:
            raise serializers.ValidationError({
                "start_time": (
                    "This appointment slot has just been booked. "
                    "Please choose another time."
                )
            })

        follow_up = Appointment.objects.create(
            patient=original_appointment.patient,
            provider=original_appointment.provider,
            preferred_date=preferred_date,
            start_time=start_time,
            end_time=end_time,
            consultation_type=original_appointment.consultation_type,
            reason=validated_data["reason"],
            status="Confirmed",
            follow_up_of=original_appointment,
        )

        return follow_up
