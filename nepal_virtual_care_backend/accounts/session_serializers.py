
from django.utils import timezone

from rest_framework.exceptions import AuthenticationFailed

from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from .models import AccountSession


class SessionTokenRefreshSerializer(TokenRefreshSerializer):
    """
    Allow token refresh only when the associated account session is active.
    """

    def validate(self, attrs):
        refresh_token_string = attrs.get("refresh")

        try:
            refresh_token = RefreshToken(refresh_token_string)
        except TokenError:
            raise AuthenticationFailed(
                "Your refresh token is invalid or expired. "
                "Please sign in again.",
                code="refresh_invalid",
            )

        session_id = refresh_token.get("sid")
        user_id = refresh_token.get("user_id")

        if not session_id or not user_id:
            raise AuthenticationFailed(
                "Your login session is no longer valid. "
                "Please sign in again.",
                code="session_missing",
            )

        try:
            AccountSession.objects.get(
                id=session_id,
                user_id=user_id,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
                user__is_active=True,
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

        return super().validate(attrs)
