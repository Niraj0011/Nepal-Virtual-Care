
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
)
from .serializers import EmailTokenObtainPairSerializer


class EmailTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailTokenObtainPairSerializer
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("verify-email/", VerifyEmailView.as_view(), name="verify-email"),
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
    path("token/", EmailTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("verify-otp/", EmailOTPVerifyView.as_view(), name="verify-otp"),
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
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("consent/", ConsentView.as_view(), name="consent"),
]
