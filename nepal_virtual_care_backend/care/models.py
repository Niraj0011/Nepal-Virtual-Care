
from django.conf import settings
from django.db import models
from django.db.models import F, Q


class Provider(models.Model):
    name = models.CharField(max_length=160)
    specialty = models.CharField(max_length=120)
    city = models.CharField(max_length=100)
    availability = models.CharField(max_length=120, blank=True)
    initials = models.CharField(max_length=8, blank=True)
    color = models.CharField(max_length=30, default="mint")
    rating = models.DecimalField(max_digits=2, decimal_places=1, default=0)
    experience = models.CharField(max_length=40, blank=True)
    languages = models.CharField(max_length=160, blank=True)
    is_active = models.BooleanField(default=True)
    is_demo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} — {self.specialty}"


class Appointment(models.Model):
    CONSULTATION_TYPES = [
        ("Video consultation", "Video consultation"),
        ("Audio consultation", "Audio consultation"),
        ("In-person visit", "In-person visit"),
    ]

    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Confirmed", "Confirmed"),
        ("Completed", "Completed"),
        ("Cancelled", "Cancelled"),
    ]

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="appointments",
    )
    provider = models.ForeignKey(
        Provider,
        on_delete=models.PROTECT,
        related_name="appointments",
    )
    preferred_date = models.DateField()
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    consultation_type = models.CharField(
        max_length=40,
        choices=CONSULTATION_TYPES,
    )
    reason = models.TextField()
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )

    # A follow-up is a normal appointment linked to its original consultation.
    # Ordinary appointments leave this field empty.
    follow_up_of = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="follow_up_appointments",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "preferred_date", "start_time"],
                condition=(
                    Q(start_time__isnull=False)
                    & ~Q(status="Cancelled")
                ),
                name="unique_active_provider_appointment_slot",
            ),
            models.CheckConstraint(
                condition=(
                    Q(start_time__isnull=True, end_time__isnull=True)
                    | (
                        Q(
                            start_time__isnull=False,
                            end_time__isnull=False,
                        )
                        & Q(end_time__gt=F("start_time"))
                    )
                ),
                name="appointment_times_must_be_valid",
            ),
        ]

    def __str__(self):
        return (
            f"{self.patient} — {self.provider} — "
            f"{self.preferred_date}"
        )


class AppointmentStatusHistory(models.Model):
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name="status_history",
    )
    old_status = models.CharField(
        max_length=20,
        choices=Appointment.STATUS_CHOICES,
    )
    new_status = models.CharField(
        max_length=20,
        choices=Appointment.STATUS_CHOICES,
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="appointment_status_changes",
    )
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-changed_at"]

    def __str__(self):
        return (
            f"Appointment #{self.appointment_id}: "
            f"{self.old_status} → {self.new_status}"
        )


class AppointmentRescheduleRequest(models.Model):
    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("Rejected", "Rejected"),
    ]

    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.CASCADE,
        related_name="reschedule_requests",
    )

    # Snapshot of the appointment date and time when the request is submitted.
    # These fields preserve the original details after an approved reschedule
    # changes the related Appointment record.
    original_date = models.DateField(
        null=True,
        blank=True,
    )
    original_start_time = models.TimeField(
        null=True,
        blank=True,
    )
    original_end_time = models.TimeField(
        null=True,
        blank=True,
    )

    requested_date = models.DateField()
    requested_start_time = models.TimeField()
    requested_end_time = models.TimeField()
    reason = models.TextField(max_length=1000)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )
    admin_response = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_reschedule_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["appointment"],
                condition=Q(status="Pending"),
                name="one_pending_reschedule_per_appointment",
            ),
            models.CheckConstraint(
                condition=Q(requested_end_time__gt=F("requested_start_time")),
                name="reschedule_times_must_be_valid",
            ),
        ]
        indexes = [
            models.Index(
                fields=["status", "-created_at"],
                name="reschedule_status_date_idx",
            ),
            models.Index(
                fields=["appointment", "-created_at"],
                name="reschedule_appt_date_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Reschedule request for appointment #{self.appointment_id} "
            f"— {self.requested_date} — {self.status}"
        )


class DoctorProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="doctor_profile",
    )
    provider = models.OneToOneField(
        Provider,
        on_delete=models.PROTECT,
        related_name="doctor_profile",
    )
    profile_photo = models.ImageField(
        upload_to="profile_photos/doctors/%Y/%m/",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return (
            f"Doctor account: {self.user.username} - "
            f"{self.provider.name}"
        )


class DoctorAvailability(models.Model):
    WEEKDAYS = [
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    ]

    provider = models.ForeignKey(
        Provider,
        on_delete=models.CASCADE,
        related_name="weekly_availability",
    )
    weekday = models.PositiveSmallIntegerField(choices=WEEKDAYS)
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    slot_duration = models.PositiveSmallIntegerField(default=30)
    is_available = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["weekday"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "weekday"],
                name="unique_provider_weekday_availability",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        is_available=False,
                        start_time__isnull=True,
                        end_time__isnull=True,
                    )
                    | (
                        Q(
                            is_available=True,
                            start_time__isnull=False,
                            end_time__isnull=False,
                        )
                        & Q(end_time__gt=F("start_time"))
                    )
                ),
                name="doctor_availability_times_must_be_valid",
            ),
            models.CheckConstraint(
                condition=Q(slot_duration__gt=0),
                name="doctor_slot_duration_must_be_positive",
            ),
        ]

    def __str__(self):
        day = self.get_weekday_display()

        if not self.is_available:
            return f"{self.provider.name} — {day}: Unavailable"

        return (
            f"{self.provider.name} — {day}: "
            f"{self.start_time} to {self.end_time}"
        )


class DoctorScheduleChangeRequest(models.Model):
    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("Rejected", "Rejected"),
    ]

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="schedule_change_requests",
    )
    provider = models.ForeignKey(
        Provider,
        on_delete=models.CASCADE,
        related_name="schedule_change_requests",
    )
    requested_schedule = models.JSONField()
    reason = models.TextField(max_length=1000)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )
    admin_response = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_schedule_change_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider"],
                condition=Q(status="Pending"),
                name="one_pending_schedule_request_per_provider",
            ),
        ]

    def __str__(self):
        return (
            f"Schedule change request: {self.provider.name} "
            f"— {self.status}"
        )


class DoctorLeaveRequest(models.Model):
    LEAVE_TYPE_CHOICES = [
        ("Full day", "Full day"),
        ("Morning", "Morning half-day"),
        ("Afternoon", "Afternoon half-day"),
        ("Custom", "Custom hours"),
    ]

    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("Rejected", "Rejected"),
    ]

    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    provider = models.ForeignKey(
        Provider,
        on_delete=models.CASCADE,
        related_name="leave_requests",
    )
    leave_date = models.DateField()
    leave_type = models.CharField(
        max_length=20,
        choices=LEAVE_TYPE_CHOICES,
    )
    start_time = models.TimeField(null=True, blank=True)
    end_time = models.TimeField(null=True, blank=True)
    reason = models.TextField(max_length=1000)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )
    admin_response = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_leave_requests",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "leave_date"],
                condition=Q(status="Pending"),
                name="one_pending_leave_request_per_day",
            ),
            models.CheckConstraint(
                condition=(
                    Q(
                        start_time__isnull=False,
                        end_time__isnull=False,
                    )
                    & Q(end_time__gt=F("start_time"))
                ),
                name="leave_request_times_must_be_valid",
            ),
        ]
        indexes = [
            models.Index(
                fields=["provider", "leave_date", "status"],
                name="leave_provider_date_status_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Leave request: {self.provider.name} — "
            f"{self.leave_date} — {self.leave_type} — {self.status}"
        )


class MedicalDocument(models.Model):
    DOCUMENT_TYPES = [
        ("Prescription", "Prescription"),
        ("Lab Report", "Lab Report"),
        ("Medical Certificate", "Medical Certificate"),
        ("Imaging Report", "Imaging Report"),
        ("Other", "Other"),
    ]

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="medical_documents",
    )
    title = models.CharField(max_length=160)
    document_type = models.CharField(
        max_length=40,
        choices=DOCUMENT_TYPES,
    )
    file = models.FileField(upload_to="medical_documents/%Y/%m/")
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self):
        return f"{self.title} — {self.patient.username}"


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ("appointment_booked", "Appointment booked"),
        ("appointment_confirmed", "Appointment confirmed"),
        ("appointment_cancelled", "Appointment cancelled"),
        ("appointment_completed", "Appointment completed"),
        ("appointment_reminder", "Appointment reminder"),
        ("appointment_reschedule_requested", "Appointment reschedule requested"),
        ("appointment_reschedule_approved", "Appointment reschedule approved"),
        ("appointment_reschedule_rejected", "Appointment reschedule rejected"),
        ("schedule_request_submitted", "Schedule request submitted"),
        ("schedule_request_reviewed", "Schedule request reviewed"),
        ("leave_request_submitted", "Leave request submitted"),
        ("leave_request_reviewed", "Leave request reviewed"),
        ("general", "General notification"),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=40,
        choices=NOTIFICATION_TYPES,
        default="general",
    )
    title = models.CharField(max_length=160)
    message = models.TextField()
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(
                fields=["recipient", "is_read", "-created_at"],
                name="notif_recipient_read_idx",
            ),
            models.Index(
                fields=["recipient", "-created_at"],
                name="notif_recipient_date_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["recipient", "appointment", "notification_type"],
                condition=(
                    Q(
                        notification_type="appointment_reminder",
                        appointment__isnull=False,
                    )
                ),
                name="unique_appointment_reminder",
            ),
        ]

    def __str__(self):
        return (
            f"{self.title} — {self.recipient.username} "
            f"({'Read' if self.is_read else 'Unread'})"
        )


class VideoConsultation(models.Model):
    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name="video_consultation",
    )
    room_id = models.CharField(
        max_length=100,
        unique=True,
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Video consultation for appointment #{self.appointment_id}"


# =========================================
# DIGITAL PRESCRIPTIONS
# =========================================

class Prescription(models.Model):
    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="digital_prescriptions",
    )
    doctor = models.ForeignKey(
        DoctorProfile,
        on_delete=models.PROTECT,
        related_name="prescriptions",
    )
    appointment = models.ForeignKey(
        Appointment,
        on_delete=models.PROTECT,
        related_name="prescriptions",
    )
    diagnosis = models.TextField()
    clinical_notes = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    replaces = models.ForeignKey(
        "self",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="replacements",
    )
    issued_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-issued_at"]
        indexes = [
            models.Index(
                fields=["patient", "-issued_at"],
                name="prescription_patient_date_idx",
            ),
            models.Index(
                fields=["doctor", "-issued_at"],
                name="prescription_doctor_date_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Prescription #{self.pk} — "
            f"{self.patient.username} — {self.issued_at:%Y-%m-%d}"
        )


class PrescriptionItem(models.Model):
    prescription = models.ForeignKey(
        Prescription,
        on_delete=models.CASCADE,
        related_name="items",
    )
    medicine_name = models.CharField(max_length=160)
    strength = models.CharField(max_length=80, blank=True)
    dosage = models.CharField(max_length=120)
    route = models.CharField(max_length=60, blank=True)
    frequency = models.CharField(max_length=120)
    duration = models.CharField(max_length=100)
    quantity = models.CharField(max_length=60, blank=True)
    instructions = models.TextField(blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["sort_order", "id"]

    def __str__(self):
        return (
            f"{self.medicine_name} — "
            f"{self.dosage} — {self.frequency}"
        )


# =========================================
# PATIENT HEALTH HISTORY
# =========================================

class PatientHealthHistory(models.Model):
    patient = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="health_history",
    )
    medical_conditions = models.TextField(blank=True)
    allergies = models.TextField(blank=True)
    current_medications = models.TextField(blank=True)
    past_surgeries = models.TextField(blank=True)
    family_medical_history = models.TextField(blank=True)
    additional_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Patient health history"
        verbose_name_plural = "Patient health histories"

    def __str__(self):
        return f"Health history — {self.patient.username}"


# =========================================
# DOCTOR RATINGS AND PATIENT REVIEWS
# =========================================

class DoctorReview(models.Model):
    MODERATION_STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Approved", "Approved"),
        ("Rejected", "Rejected"),
    ]

    patient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="doctor_reviews",
    )
    provider = models.ForeignKey(
        Provider,
        on_delete=models.PROTECT,
        related_name="reviews",
    )
    appointment = models.OneToOneField(
        Appointment,
        on_delete=models.CASCADE,
        related_name="doctor_review",
    )
    rating = models.PositiveSmallIntegerField()
    comment = models.TextField(
        max_length=2000,
        blank=True,
    )
    moderation_status = models.CharField(
        max_length=20,
        choices=MODERATION_STATUS_CHOICES,
        default="Approved",
    )
    moderation_note = models.TextField(blank=True)
    moderated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderated_doctor_reviews",
    )
    moderated_at = models.DateTimeField(
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(rating__gte=1, rating__lte=5),
                name="doctor_review_rating_between_1_and_5",
            ),
        ]
        indexes = [
            models.Index(
                fields=["provider", "moderation_status", "-created_at"],
                name="rev_prov_status_date_idx",
            ),
            models.Index(
                fields=["moderation_status", "-created_at"],
                name="review_status_date_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Review for {self.provider.name} — "
            f"{self.rating}/5 — {self.moderation_status}"
        )


class DoctorReviewReport(models.Model):
    STATUS_CHOICES = [
        ("Pending", "Pending"),
        ("Reviewed", "Reviewed"),
    ]

    review = models.ForeignKey(
        DoctorReview,
        on_delete=models.CASCADE,
        related_name="reports",
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="doctor_review_reports",
    )
    reason = models.TextField(max_length=1000)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="Pending",
    )
    admin_note = models.TextField(blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_doctor_review_reports",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["review", "reporter"],
                name="unique_review_report_per_patient",
            ),
        ]
        indexes = [
            models.Index(
                fields=["status", "-created_at"],
                name="review_report_status_date_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Report for review #{self.review_id} "
            f"by {self.reporter.username} — {self.status}"
        )
