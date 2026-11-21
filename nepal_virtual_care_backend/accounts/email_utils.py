
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.core.mail import send_mail
from django.utils import timezone

from .models import EmailVerification, EmailOTPChallenge


def hash_verification_token(raw_token):
    return hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()


def create_email_verification(user):
    # Generate a cryptographically secure random token.
    raw_token = secrets.token_urlsafe(32)

    # Store only the SHA-256 hash in the database.
    token_hash = hash_verification_token(raw_token)

    expires_at = timezone.now() + timedelta(
        hours=settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS
    )

    # Replace any previous verification record for this user.
    EmailVerification.objects.update_or_create(
        user=user,
        defaults={
            "token_hash": token_hash,
            "expires_at": expires_at,
            "verified_at": None,
        },
    )

    verification_url = (
        f"{settings.FRONTEND_URL}/verify-email"
        f"?token={raw_token}"
    )

    subject = "Verify your Nepal Virtual Care account"

    message = (
        f"Hello {user.first_name or 'there'},\n\n"
        "Thank you for registering with Nepal Virtual Care.\n\n"
        "Please verify your email address by opening this link:\n\n"
        f"{verification_url}\n\n"
        "This verification link expires in "
        f"{settings.EMAIL_VERIFICATION_TOKEN_TTL_HOURS} hours.\n\n"
        "If you did not create this account, you can ignore this email.\n\n"
        "Nepal Virtual Care"
    )

    send_mail(
        subject=subject,
        message=message,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[user.email],
        fail_silently=False,
    )

    return True


def create_email_otp(user):
    # Generate a secure six-digit OTP and a separate challenge token.
    otp_code = f"{secrets.randbelow(1_000_000):06d}"
    raw_challenge = secrets.token_urlsafe(32)

    challenge_hash = hashlib.sha256(
        raw_challenge.encode("utf-8")
    ).hexdigest()

    code_hash = hashlib.sha256(
        otp_code.encode("utf-8")
    ).hexdigest()

    otp_ttl_minutes = getattr(
        settings,
        "EMAIL_OTP_TTL_MINUTES",
        5,
    )

    expires_at = timezone.now() + timedelta(
        minutes=otp_ttl_minutes
    )

    # Replace any previous OTP challenge for this user.
    EmailOTPChallenge.objects.update_or_create(
        user=user,
        defaults={
            "challenge_hash": challenge_hash,
            "code_hash": code_hash,
            "expires_at": expires_at,
            "attempts": 0,
            "consumed_at": None,
        },
    )

    subject = "Your Nepal Virtual Care login verification code"

    message = (
        f"Hello {user.first_name or 'there'},\n\n"
        "A login attempt was made for your Nepal Virtual Care account.\n\n"
        f"Your verification code is: {otp_code}\n\n"
        f"This code expires in {otp_ttl_minutes} minutes "
        "and can only be used once.\n\n"
        "If you did not attempt to sign in, please secure your account "
        "and contact Nepal Virtual Care.\n\n"
        "Nepal Virtual Care"
    )

    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
    except Exception:
        EmailOTPChallenge.objects.filter(
            user=user,
            challenge_hash=challenge_hash,
        ).delete()
        raise

    # The raw challenge is returned to the login flow, never the OTP.
    return raw_challenge
