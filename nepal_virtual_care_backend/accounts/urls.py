
from django.urls import path
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from .views import (
    RegisterView,
    VerifyEmailView,
    ResendVerificationEmailView,
    PasswordResetRequestView,
    PasswordResetConfirmView,
    EmailOTPVerifyView,
    TrustedDeviceListView,
    TrustedDeviceRevokeView,
    MeView,
    ConsentView,
    LogoutView,
    AccountSessionListView,
    AccountSessionRevokeView,
    LogoutAllSessionsView,
    AccountSessionRecognizeView,
    AccountSessionReportView,
)
from .serializers import EmailTokenObtainPairSerializer
from .session_serializers import SessionTokenRefreshSerializer


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


class SessionTokenRefreshView(TokenRefreshView):
    serializer_class = SessionTokenRefreshSerializer


urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),

    path(
        "verify-email/",
        VerifyEmailView.as_view(),
        name="verify-email",
    ),

    path(
        "resend-verification/",
        ResendVerificationEmailView.as_view(),
        name="resend-verification",
    ),

    path(
        "password-reset/",
        PasswordResetRequestView.as_view(),
        name="password-reset",
    ),

    path(
        "password-reset/confirm/",
        PasswordResetConfirmView.as_view(),
        name="password-reset-confirm",
    ),

    path(
        "token/",
        EmailTokenObtainPairView.as_view(),
        name="token_obtain_pair",
    ),

    path(
        "token/refresh/",
        SessionTokenRefreshView.as_view(),
        name="token_refresh",
    ),

    path(
        "verify-otp/",
        EmailOTPVerifyView.as_view(),
        name="verify-otp",
    ),

    # Trusted devices: email OTP exemption management
    path(
        "trusted-devices/",
        TrustedDeviceListView.as_view(),
        name="trusted-device-list",
    ),

    path(
        "trusted-devices/<int:device_id>/",
        TrustedDeviceRevokeView.as_view(),
        name="trusted-device-revoke",
    ),

    # Active account sessions
    path(
        "sessions/",
        AccountSessionListView.as_view(),
        name="account-session-list",
    ),

    path(
        "sessions/logout-all/",
        LogoutAllSessionsView.as_view(),
        name="account-session-logout-all",
    ),

    path(
        "sessions/<uuid:session_id>/",
        AccountSessionRevokeView.as_view(),
        name="account-session-revoke",
    ),

    # New-login verification
    path(
        "sessions/<uuid:session_id>/recognize/",
        AccountSessionRecognizeView.as_view(),
        name="account-session-recognize",
    ),

    path(
        "sessions/<uuid:session_id>/report/",
        AccountSessionReportView.as_view(),
        name="account-session-report",
    ),

    path("logout/", LogoutView.as_view(), name="logout"),

    path("me/", MeView.as_view(), name="me"),

    path("consent/", ConsentView.as_view(), name="consent"),
]
