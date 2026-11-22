
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class PatientProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="patient_profile",
    )
    phone = models.CharField(max_length=30, blank=True)
    city = models.CharField(max_length=100, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)

    profile_photo = models.ImageField(
        upload_to="profile_photos/patients/%Y/%m/",
        null=True,
        blank=True,
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Patient profile: {self.user.username}"


class ConsentPreference(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="consent_preference",
    )
    information_sharing = models.BooleanField(default=False)
    understood_demo_notice = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]

    def __str__(self):
        return f"Consent preferences: {self.user.username}"


class EmailVerification(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_verification",
    )
    token_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Email verification: {self.user.email}"

    @property
    def is_verified(self):
        return self.verified_at is not None


class EmailOTPChallenge(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="email_otp_challenge",
    )
    challenge_hash = models.CharField(max_length=64)
    code_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    consumed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Email OTP challenge: {self.user.email}"

    @property
    def is_consumed(self):
        return self.consumed_at is not None


class TrustedDevice(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="trusted_devices",
    )
    token_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    device_label = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"Trusted device: {self.user.email}"

    @property
    def is_valid(self):
        return (
            self.revoked_at is None
            and self.expires_at > timezone.now()
            and self.user.is_active
        )


class AccountSession(models.Model):
    """
    Represents one authenticated login session.

    A session is separate from a TrustedDevice:
    - AccountSession tracks an authenticated login.
    - TrustedDevice controls whether email OTP can be skipped.
    """

    id = models.UUIDField(
        primary_key=True,
        default=uuid.uuid4,
        editable=False,
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="account_sessions",
    )

    # SHA-256 hash of the persistent browser identifier.
    # The original identifier is never stored here.
    device_id_hash = models.CharField(max_length=64)

    device_label = models.CharField(
        max_length=255,
        blank=True,
        default="Unknown device",
    )

    browser_name = models.CharField(
        max_length=100,
        blank=True,
        default="Unknown browser",
    )

    operating_system = models.CharField(
        max_length=100,
        blank=True,
        default="Unknown operating system",
    )

    device_type = models.CharField(
        max_length=40,
        blank=True,
        default="Unknown device",
    )

    ip_address = models.GenericIPAddressField(
        null=True,
        blank=True,
    )

    location_label = models.CharField(
        max_length=150,
        blank=True,
        default="Unavailable",
    )

    created_at = models.DateTimeField(auto_now_add=True)

    last_activity_at = models.DateTimeField(
        default=timezone.now,
    )

    expires_at = models.DateTimeField()

    revoked_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    revoked_reason = models.CharField(
        max_length=40,
        blank=True,
        default="",
    )

    # None means the user has not answered "Was this you?"
    login_confirmed = models.BooleanField(
        null=True,
        blank=True,
        default=None,
    )

    # Set when the user reports an unfamiliar login.
    security_reported_at = models.DateTimeField(
        null=True,
        blank=True,
    )

    class Meta:
        ordering = ["-last_activity_at"]
        indexes = [
            models.Index(
                fields=["user", "revoked_at", "expires_at"],
                name="acct_sess_active_idx",
            ),
            models.Index(
                fields=["user", "device_id_hash"],
                name="acct_sess_device_idx",
            ),
        ]

    def __str__(self):
        return (
            f"Session for {self.user.email} "
            f"({self.device_label or 'Unknown device'})"
        )

    @property
    def is_active(self):
        return (
            self.revoked_at is None
            and self.expires_at > timezone.now()
            and self.user.is_active
        )
