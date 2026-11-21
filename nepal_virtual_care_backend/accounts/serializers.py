
import hashlib

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.utils import timezone

from rest_framework import serializers
from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

from care.models import DoctorProfile
from .models import PatientProfile, ConsentPreference, TrustedDevice
from .email_utils import create_email_otp


User = get_user_model()


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(
        write_only=True,
        validators=[validate_password],
    )

    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "first_name",
            "last_name",
            "email",
            "username",
            "password",
            "password_confirm",
        )
        extra_kwargs = {
            "email": {"required": True},
            "username": {"required": True},
        }

    def validate_email(self, value):
        email = value.strip().lower()

        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                "An account with this email already exists."
            )

        return email

    def validate_username(self, value):
        username = value.strip()

        if User.objects.filter(username__iexact=username).exists():
            raise serializers.ValidationError(
                "This username is already taken."
            )

        return username

    def validate(self, attrs):
        if attrs["password"] != attrs.pop("password_confirm"):
            raise serializers.ValidationError({
                "password_confirm": "Passwords do not match."
            })

        return attrs

    @transaction.atomic
    def create(self, validated_data):
        # New registrations cannot log in until their email
        # address has been verified.
        user = User.objects.create_user(
            **validated_data,
            is_active=False,
        )

        PatientProfile.objects.create(user=user)

        return user


class EmailTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = User.EMAIL_FIELD

    trusted_device = serializers.CharField(
        required=False,
        write_only=True,
        allow_blank=True,
    )

    def validate(self, attrs):
        email = attrs.get(self.username_field)
        password = attrs.get("password")
        trusted_device_token = attrs.get("trusted_device", "").strip()

        user = User.objects.filter(
            email__iexact=email
        ).first()

        if user is None or not user.check_password(password):
            raise AuthenticationFailed(
                "No active account found with the given credentials."
            )

        if not user.is_active:
            raise AuthenticationFailed(
                "Please verify your email address before signing in."
            )

        # Administrators must complete email OTP verification
        # unless this browser has a valid trusted-device token.
        is_admin = user.is_staff or user.is_superuser

        # Check whether this account belongs to a doctor.
        doctor = DoctorProfile.objects.filter(
            user=user
        ).first()

        if is_admin or doctor is not None:

            # Inactive doctor accounts cannot sign in.
            if not is_admin and not doctor.is_active:
                raise AuthenticationFailed(
                    "Your doctor account is inactive. Please contact the administrator."
                )

            # Check whether this browser has a valid trusted-device token.
            if trusted_device_token:
                token_hash = hashlib.sha256(
                    trusted_device_token.encode("utf-8")
                ).hexdigest()

                trusted_device = TrustedDevice.objects.filter(
                    user=user,
                    token_hash=token_hash,
                    revoked_at__isnull=True,
                    expires_at__gt=timezone.now(),
                ).first()

                if trusted_device:
                    trusted_device.last_used_at = timezone.now()
                    trusted_device.save(update_fields=["last_used_at"])

                    refresh = self.get_token(user)

                    return {
                        "refresh": str(refresh),
                        "access": str(refresh.access_token),
                    }

            # No valid trusted device: send an OTP.
            challenge = create_email_otp(user)

            # Do not issue JWT tokens until OTP verification succeeds.
            return {
                "requires_otp": True,
                "challenge": challenge,
                "detail": (
                    "A six-digit verification code has been sent "
                    "to your registered email address."
                ),
            }

        # Patients continue using the normal password-only login.
        refresh = self.get_token(user)

        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }


class UserSerializer(serializers.ModelSerializer):
    phone = serializers.CharField(
        source="patient_profile.phone",
        required=False,
        allow_blank=True,
    )

    city = serializers.CharField(
        source="patient_profile.city",
        required=False,
        allow_blank=True,
    )

    date_of_birth = serializers.DateField(
        source="patient_profile.date_of_birth",
        required=False,
        allow_null=True,
    )

    profile_photo = serializers.ImageField(
        source="patient_profile.profile_photo",
        required=False,
        allow_null=True,
    )

    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "date_joined",
            "phone",
            "city",
            "date_of_birth",
            "profile_photo",
            "role",
        )
        read_only_fields = (
            "id",
            "username",
            "email",
            "date_joined",
            "role",
        )

    def get_role(self, obj):
        if obj.is_superuser or obj.is_staff:
            return "admin"

        try:
            doctor = obj.doctor_profile
        except DoctorProfile.DoesNotExist:
            return "patient"

        if not doctor.is_active or not obj.is_active:
            return "inactive"

        return "doctor"

    @transaction.atomic
    def update(self, instance, validated_data):
        profile_data = validated_data.pop("patient_profile", {})

        for key, value in validated_data.items():
            setattr(instance, key, value)

        instance.save()

        if profile_data:
            try:
                profile = instance.patient_profile
            except PatientProfile.DoesNotExist:
                profile = PatientProfile.objects.create(
                    user=instance
                )

            for key, value in profile_data.items():
                setattr(profile, key, value)

            profile.save()

        return instance


class ConsentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConsentPreference
        fields = (
            "id",
            "information_sharing",
            "understood_demo_notice",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "updated_at",
        )
