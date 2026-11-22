
from datetime import timedelta

from django.utils import timezone

from rest_framework.exceptions import AuthenticationFailed

from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import AccountSession


class SessionJWTAuthentication(JWTAuthentication):
    """
    JWT authentication that verifies the associated account session.

    A token is accepted only when its session:
    - Exists.
    - Belongs to the authenticated user.
    - Has not been revoked.
    - Has not expired.
    """

    def authenticate(self, request):
        result = super().authenticate(request)

        if result is None:
            return None

        user, validated_token = result

        session_id = validated_token.get("sid")

        if not session_id:
            raise AuthenticationFailed(
                "Your login session is no longer valid. "
                "Please sign in again.",
                code="session_missing",
            )

        now = timezone.now()

        try:
            account_session = AccountSession.objects.get(
                id=session_id,
                user=user,
                revoked_at__isnull=True,
                expires_at__gt=now,
            )
        except (
            AccountSession.DoesNotExist,
            ValueError,
            TypeError,
        ):
            raise AuthenticationFailed(
                "Your login session has expired or been revoked. "
                "Please sign in again.",
                code="session_invalid",
            )

        # Update last activity at most once per minute.
        if account_session.last_activity_at <= now - timedelta(seconds=60):
            AccountSession.objects.filter(
                id=account_session.id,
                revoked_at__isnull=True,
            ).update(last_activity_at=now)

            account_session.last_activity_at = now

        request.account_session = account_session

        return user, validated_token
