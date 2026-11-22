
import hashlib
import ipaddress
import secrets
import re

from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone

from geoip2.database import Reader
from geoip2.errors import AddressNotFoundError

from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

from care.models import Notification

from .models import AccountSession


def get_device_metadata(request):
    user_agent = request.META.get("HTTP_USER_AGENT", "")[:1000]

    # Browser detection.
    if "Edg/" in user_agent:
        browser = "Microsoft Edge"
    elif "OPR/" in user_agent:
        browser = "Opera"
    elif "Chrome/" in user_agent:
        browser = "Google Chrome"
    elif "Firefox/" in user_agent:
        browser = "Mozilla Firefox"
    elif "Safari/" in user_agent and "Chrome/" not in user_agent:
        browser = "Safari"
    else:
        browser = "Unknown browser"

    # Operating system detection.
    if "Windows" in user_agent:
        operating_system = "Windows"
    elif "Android" in user_agent:
        operating_system = "Android"
    elif "iPhone" in user_agent or "iPad" in user_agent:
        operating_system = "iOS"
    elif "Mac OS X" in user_agent or "Macintosh" in user_agent:
        operating_system = "macOS"
    elif "Linux" in user_agent:
        operating_system = "Linux"
    else:
        operating_system = "Unknown operating system"

    # Device type detection.
    if re.search(r"iPad|Tablet", user_agent, re.IGNORECASE):
        device_type = "Tablet"
    elif re.search(
        r"Mobile|Android|iPhone|iPod",
        user_agent,
        re.IGNORECASE,
    ):
        device_type = "Mobile"
    else:
        device_type = "Desktop"

    device_label = f"{browser} on {operating_system}"

    return {
        "browser_name": browser,
        "operating_system": operating_system,
        "device_type": device_type,
        "device_label": device_label[:255],
    }


def get_client_ip(request):
    """
    Use the direct connection address.

    Forwarded IP headers are intentionally not trusted unless a
    trusted-proxy configuration is introduced.
    """
    return request.META.get("REMOTE_ADDR") or None


def get_ip_location(ip_address):
    """
    Resolve an IP address to an approximate location using a local
    GeoLite2 City database.

    No external geolocation service is contacted.

    Private, loopback, reserved, and otherwise non-public addresses
    return "Location unavailable".
    """

    if not ip_address:
        return "Location unavailable"

    try:
        parsed_ip = ipaddress.ip_address(ip_address)

        if not parsed_ip.is_global:
            return "Location unavailable"

        database_path = getattr(
            settings,
            "GEOIP_CITY_DATABASE",
            Path(settings.BASE_DIR) / "geoip" / "GeoLite2-City.mmdb",
        )

        database_path = Path(database_path)

        if not database_path.is_file():
            return "Location unavailable"

        with Reader(str(database_path)) as reader:
            response = reader.city(str(parsed_ip))

        location_parts = [
            response.city.name,
            response.subdivisions.most_specific.name,
            response.country.name,
        ]

        # Remove missing and duplicate location components.
        unique_parts = []
        for part in location_parts:
            if part and part not in unique_parts:
                unique_parts.append(part)

        if not unique_parts:
            return "Location unavailable"

        return ", ".join(unique_parts)[:150]

    except (
        AddressNotFoundError,
        ValueError,
        OSError,
    ):
        return "Location unavailable"

    except Exception:
        # A GeoIP lookup failure must never prevent a user from logging in.
        return "Location unavailable"


def create_session_tokens(user, request):
    """
    Create an account session and issue session-linked JWT tokens.

    The browser identifier is received through X-Device-ID.
    Only its SHA-256 hash is stored.
    """

    raw_device_id = request.headers.get("X-Device-ID", "").strip()

    # Temporary fallback until the frontend sends its persistent ID.
    if not raw_device_id:
        raw_device_id = secrets.token_urlsafe(32)

    if len(raw_device_id) > 255:
        raw_device_id = raw_device_id[:255]

    device_id_hash = hashlib.sha256(
        raw_device_id.encode("utf-8")
    ).hexdigest()

    metadata = get_device_metadata(request)
    now = timezone.now()

    refresh_lifetime = settings.SIMPLE_JWT.get(
        "REFRESH_TOKEN_LIFETIME",
        timedelta(days=7),
    )

    expires_at = now + refresh_lifetime

    # A previously seen browser identifier is not treated as a new device.
    previously_seen = AccountSession.objects.filter(
        user=user,
        device_id_hash=device_id_hash,
    ).exists()

    ip_address = get_client_ip(request)
    location_label = get_ip_location(ip_address)

    account_session = AccountSession.objects.create(
        user=user,
        device_id_hash=device_id_hash,
        device_label=metadata["device_label"],
        browser_name=metadata["browser_name"],
        operating_system=metadata["operating_system"],
        device_type=metadata["device_type"],
        ip_address=ip_address,
        location_label=location_label,
        last_activity_at=now,
        expires_at=expires_at,
    )

    refresh = RefreshToken.for_user(user)

    # Attach the account session identifier to the refresh token.
    refresh["sid"] = str(account_session.id)

    # IMPORTANT:
    # RefreshToken.for_user() registers the token in OutstandingToken
    # before the sid claim is added. Update the stored token so
    # individual session revocation can find it by its sid.
    OutstandingToken.objects.filter(
        jti=refresh["jti"],
        user=user,
    ).update(
        token=str(refresh),
    )

    tokens = {
        "refresh": str(refresh),
        "access": str(refresh.access_token),
        "session_id": str(account_session.id),
    }

    if not previously_seen:
        create_new_login_alert(
            user=user,
            account_session=account_session,
            request=request,
        )

    return tokens


def create_new_login_alert(user, account_session, request):
    """
    Create an in-app security notification and send a login email.
    """

    browser = account_session.browser_name
    operating_system = account_session.operating_system
    device_label = account_session.device_label

    login_time = timezone.localtime(
        account_session.created_at
    ).strftime("%Y-%m-%d %I:%M %p")

    ip_address = account_session.ip_address or "Unavailable"
    location = account_session.location_label or "Location unavailable"

    message = (
        "A new login to your Nepal Virtual Care account was detected.\n\n"
        f"Browser: {browser}\n"
        f"Operating system: {operating_system}\n"
        f"Device: {device_label}\n"
        f"IP address: {ip_address}\n"
        f"Location: {location}\n"
        f"Login time: {login_time}\n\n"
        "Was this you? If you do not recognize this login, "
        "secure your account by changing your password and "
        "revoking unfamiliar sessions."
    )

    Notification.objects.create(
        recipient=user,
        notification_type="general",
        title="Security alert: New account login",
        message=message,
    )

    email_message = (
        f"Hello {user.first_name or 'there'},\n\n"
        "A new login to your Nepal Virtual Care account was detected.\n\n"
        f"Browser: {browser}\n"
        f"Operating system: {operating_system}\n"
        f"Device: {device_label}\n"
        f"IP address: {ip_address}\n"
        f"Location: {location}\n"
        f"Login time: {login_time}\n\n"
        "Was this you?\n\n"
        "If you do not recognize this login, change your password "
        "and revoke unfamiliar active sessions immediately.\n\n"
        "Nepal Virtual Care"
    )

    transaction.on_commit(
        lambda: send_mail(
            subject="Security alert: New login to your Nepal Virtual Care account",
            message=email_message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=True,
        )
    )
