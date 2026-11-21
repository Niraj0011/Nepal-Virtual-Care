
import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from rest_framework import generics, permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.throttling import ScopedRateThrottle

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError

from care.models import DoctorProfile

from .email_utils import (
    create_email_verification,
    hash_verification_token,
)
from .models import (
    ConsentPreference,
    EmailVerification,
    EmailOTPChallenge,
    TrustedDevice,
)
from .serializers import (
    RegisterSerializer,
    UserSerializer,
    ConsentSerializer,
)


User = get_user_model()
password_reset_token_generator = PasswordResetTokenGenerator()


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def perform_create(self, serializer):
        # Roll back account creation if email delivery fails.
        with transaction.atomic():
            user = serializer.save()
            create_email_verification(user)


class VerifyEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        raw_token = request.data.get("token", "")

        if not isinstance(raw_token, str) or not raw_token.strip():
            raise ValidationError({
                "token": "A verification token is required."
            })

        token_hash = hash_verification_token(raw_token.strip())

        with transaction.atomic():
            try:
                verification = (
                    EmailVerification.objects
                    .select_for_update()
                    .select_related("user")
                    .get(token_hash=token_hash)
                )
            except EmailVerification.DoesNotExist:
                raise ValidationError({
                    "token": "This verification link is invalid."
                })

            if verification.verified_at is not None:
                raise ValidationError({
                    "token": "This email address has already been verified."
                })

            if verification.expires_at <= timezone.now():
                raise ValidationError({
                    "token": "This verification link has expired."
                })

            user = verification.user

            verification.verified_at = timezone.now()
            verification.save(update_fields=["verified_at"])

            user.is_active = True
            user.save(update_fields=["is_active"])

        return Response(
            {
                "detail": "Your email address has been verified. You can now sign in."
            },
            status=status.HTTP_200_OK,
        )


class ResendVerificationEmailView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "")

        if not isinstance(email, str) or not email.strip():
            raise ValidationError({
                "email": "Please enter your email address."
            })

        email = email.strip()

        # Do not reveal whether an account exists or is verified.
        user = User.objects.filter(
            email__iexact=email,
            is_active=False,
        ).first()

        if user:
            verification = EmailVerification.objects.filter(
                user=user
            ).first()

            # Only resend when the account has not already been verified.
            if verification is None or verification.verified_at is None:
                create_email_verification(user)

        return Response(
            {
                "detail": (
                    "If an account with that email address requires "
                    "verification, a new verification email has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class EmailOTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        raw_challenge = request.data.get("challenge", "")
        otp_code = request.data.get("code", "")
        remember_device = request.data.get("remember_device") is True

        if not isinstance(raw_challenge, str) or not raw_challenge.strip():
            raise ValidationError({
                "challenge": "A login challenge is required."
            })

        if (
            not isinstance(otp_code, str)
            or len(otp_code) != 6
            or not otp_code.isdigit()
        ):
            raise ValidationError({
                "code": "Enter the six-digit verification code."
            })

        challenge_hash = hashlib.sha256(
            raw_challenge.strip().encode("utf-8")
        ).hexdigest()

        code_hash = hashlib.sha256(
            otp_code.encode("utf-8")
        ).hexdigest()

        error_message = None
        tokens = None

        max_attempts = 5

        with transaction.atomic():
            challenge = (
                EmailOTPChallenge.objects
                .select_for_update()
                .select_related("user")
                .filter(challenge_hash=challenge_hash)
                .first()
            )

            if challenge is None:
                error_message = "This login challenge is invalid. Please sign in again."

            elif challenge.consumed_at is not None:
                error_message = "This verification code has already been used."

            elif challenge.expires_at <= timezone.now():
                error_message = "This verification code has expired. Please sign in again."

            elif challenge.attempts >= max_attempts:
                error_message = "Too many incorrect attempts. Please sign in again."

            elif not challenge.user.is_active:
                error_message = "This account is inactive. Please contact support."

            else:
                doctor_profile = DoctorProfile.objects.filter(
                    user=challenge.user
                ).first()

                is_admin = (
                    challenge.user.is_staff
                    or challenge.user.is_superuser
                )

                is_active_doctor = (
                    doctor_profile is not None
                    and doctor_profile.is_active
                )

                if not is_admin and not is_active_doctor:
                    error_message = "This account is not eligible for OTP login."

                elif not hmac.compare_digest(
                    challenge.code_hash,
                    code_hash,
                ):
                    challenge.attempts += 1
                    challenge.save(update_fields=["attempts"])

                    if challenge.attempts >= max_attempts:
                        error_message = (
                            "Too many incorrect attempts. Please sign in again."
                        )
                    else:
                        remaining = max_attempts - challenge.attempts
                        error_message = (
                            f"Incorrect verification code. "
                            f"{remaining} attempts remaining."
                        )

                else:
                    challenge.consumed_at = timezone.now()
                    challenge.save(update_fields=["consumed_at"])

                    refresh = RefreshToken.for_user(challenge.user)

                    tokens = {
                        "refresh": str(refresh),
                        "access": str(refresh.access_token),
                    }

                    # Create a trusted device only when the user
                    # explicitly chooses to remember this browser.
                    if remember_device:
                        raw_device_token = secrets.token_urlsafe(32)

                        device_token_hash = hashlib.sha256(
                            raw_device_token.encode("utf-8")
                        ).hexdigest()

                        device_label = request.META.get(
                            "HTTP_USER_AGENT", ""
                        )[:255]

                        TrustedDevice.objects.create(
                            user=challenge.user,
                            token_hash=device_token_hash,
                            expires_at=(
                                timezone.now() + timedelta(days=30)
                            ),
                            device_label=device_label,
                        )

                        # The raw token is returned once.
                        # Only its hash is stored in the database.
                        tokens["trusted_device"] = raw_device_token

        if error_message:
            raise ValidationError({"detail": error_message})

        return Response(tokens, status=status.HTTP_200_OK)


class TrustedDeviceListView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        devices = TrustedDevice.objects.filter(
            user=request.user,
            revoked_at__isnull=True,
            expires_at__gt=timezone.now(),
        ).order_by("-created_at")

        results = [
            {
                "id": device.id,
                "device_label": device.device_label or "Unknown device",
                "created_at": device.created_at,
                "expires_at": device.expires_at,
                "last_used_at": device.last_used_at,
            }
            for device in devices
        ]

        return Response(results, status=status.HTTP_200_OK)


class TrustedDeviceRevokeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, device_id):
        device = TrustedDevice.objects.filter(
            id=device_id,
            user=request.user,
            revoked_at__isnull=True,
        ).first()

        if device is None:
            return Response(
                {"detail": "Trusted device not found or already revoked."},
                status=status.HTTP_404_NOT_FOUND,
            )

        device.revoked_at = timezone.now()
        device.save(update_fields=["revoked_at"])

        return Response(
            {"detail": "Trusted device revoked successfully."},
            status=status.HTTP_200_OK,
        )


class PasswordResetRequestView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get("email", "")

        if not isinstance(email, str) or not email.strip():
            raise ValidationError({
                "email": "Please enter your email address."
            })

        email = email.strip()

        # Return the same response whether or not the account exists.
        users = User.objects.filter(
            email__iexact=email,
            is_active=True,
        )

        for user in users:
            uid = urlsafe_base64_encode(str(user.pk).encode("utf-8"))
            token = password_reset_token_generator.make_token(user)

            reset_url = (
                f"{settings.FRONTEND_URL}/reset-password"
                f"?uid={uid}&token={token}"
            )

            message = (
                f"Hello {user.first_name or 'there'},\n\n"
                "We received a request to reset your Nepal Virtual Care password.\n\n"
                "Open the following link to choose a new password:\n\n"
                f"{reset_url}\n\n"
                "If you did not request a password reset, you can ignore this email.\n\n"
                "Nepal Virtual Care"
            )

            send_mail(
                subject="Reset your Nepal Virtual Care password",
                message=message,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
            )

        return Response(
            {
                "detail": (
                    "If an active account exists with that email address, "
                    "a password reset link has been sent."
                )
            },
            status=status.HTTP_200_OK,
        )


class PasswordResetConfirmView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid = request.data.get("uid", "")
        token = request.data.get("token", "")
        password = request.data.get("password", "")
        password_confirm = request.data.get("password_confirm", "")

        if not all(
            isinstance(value, str) and value.strip()
            for value in [uid, token, password, password_confirm]
        ):
            raise ValidationError({
                "detail": "Please provide the reset link and both password fields."
            })

        if password != password_confirm:
            raise ValidationError({
                "password_confirm": "The passwords do not match."
            })

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (
            TypeError,
            ValueError,
            OverflowError,
            DjangoValidationError,
            UnicodeDecodeError,
            User.DoesNotExist,
        ):
            raise ValidationError({
                "token": "This password reset link is invalid or has expired."
            })

        if not password_reset_token_generator.check_token(user, token):
            raise ValidationError({
                "token": "This password reset link is invalid or has expired."
            })

        try:
            validate_password(password, user=user)
        except DjangoValidationError as error:
            raise ValidationError({
                "password": list(error.messages)
            })

        with transaction.atomic():
            user.set_password(password)
            user.save(update_fields=["password"])

            # Password reset revokes all previously trusted devices.
            TrustedDevice.objects.filter(
                user=user,
                revoked_at__isnull=True,
            ).update(revoked_at=timezone.now())

        return Response(
            {
                "detail": "Your password has been changed successfully. You can now sign in."
            },
            status=status.HTTP_200_OK,
        )


class MeView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    # Keep JSON support and enable image uploads through multipart form data.
    parser_classes = [
        JSONParser,
        MultiPartParser,
        FormParser,
    ]

    def get_object(self):
        return self.request.user


class ConsentView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        consent, _ = ConsentPreference.objects.get_or_create(
            user=request.user
        )

        return Response(ConsentSerializer(consent).data)

    def put(self, request):
        consent, _ = ConsentPreference.objects.get_or_create(
            user=request.user
        )

        serializer = ConsentSerializer(
            consent,
            data=request.data,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        refresh_token = request.data.get("refresh")

        if not refresh_token:
            raise ValidationError({
                "refresh": "A refresh token is required."
            })

        try:
            token = RefreshToken(refresh_token)

            # Prevent a user from revoking another user's refresh token.
            token_user_id = token.get("user_id")

            if str(token_user_id) != str(request.user.pk):
                raise ValidationError({
                    "refresh": "This refresh token does not belong to your account."
                })

            token.blacklist()

        except TokenError:
            raise ValidationError({
                "refresh": "The refresh token is invalid or has already been revoked."
            })

        return Response(
            {"detail": "Successfully logged out."},
            status=status.HTTP_200_OK,
        )
