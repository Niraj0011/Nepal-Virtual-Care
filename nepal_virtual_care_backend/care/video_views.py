
import json
import logging

from datetime import datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import jwt

from django.conf import settings
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Appointment, DoctorProfile, VideoConsultation


logger = logging.getLogger(__name__)


VIDEOSDK_ROOMS_URL = "https://api.videosdk.live/v2/rooms"

CONSULTATION_EARLY_MINUTES = 15
CONSULTATION_LATE_MINUTES = 30

PARTICIPANT_TOKEN_LIFETIME_MINUTES = 15


def generate_videosdk_server_token():
    """
    Generate a short-lived token for server-side VideoSDK API requests.
    The crawler role is used for room-management API access.
    """
    api_key = settings.VIDEOSDK_API_KEY
    secret = settings.VIDEOSDK_SECRET

    if not api_key or not secret:
        raise RuntimeError("VideoSDK credentials are not configured.")

    now = timezone.now()

    payload = {
        "apikey": api_key,
        "permissions": ["allow_join"],
        "version": 2,
        "roles": ["crawler"],
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }

    return jwt.encode(
        payload,
        secret,
        algorithm="HS256",
    )


def create_videosdk_room():
    """
    Create a private VideoSDK room through its REST API.
    """
    server_token = generate_videosdk_server_token()

    request = Request(
        VIDEOSDK_ROOMS_URL,
        data=json.dumps({}).encode("utf-8"),
        headers={
            "Authorization": server_token,
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))

    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        logger.exception("VideoSDK room creation failed.")
        raise RuntimeError(
            "The video room could not be created. Please try again."
        )

    room_id = result.get("roomId")

    if not room_id:
        logger.error("VideoSDK room creation returned no room ID.")
        raise RuntimeError(
            "VideoSDK did not return a valid room ID."
        )

    return room_id


def get_appointment_participant_role(user, appointment):
    """
    Verify that the authenticated user is either:
    - The patient who owns the appointment.
    - The active doctor assigned to the appointment.

    Administrators and unrelated users cannot join.
    """
    try:
        doctor_profile = user.doctor_profile
    except DoctorProfile.DoesNotExist:
        doctor_profile = None

    if doctor_profile is not None:
        if (
            not doctor_profile.is_active
            or not doctor_profile.user.is_active
            or not doctor_profile.provider.is_active
        ):
            raise PermissionDenied(
                "Your doctor account is not active."
            )

        if doctor_profile.provider_id != appointment.provider_id:
            raise PermissionDenied(
                "You are not the doctor assigned to this appointment."
            )

        return "doctor"

    if appointment.patient_id != user.pk:
        raise PermissionDenied(
            "You do not have permission to join this appointment."
        )

    return "patient"


def get_appointment_end_datetime(appointment):
    """
    Return the appointment's scheduled end as a timezone-aware datetime.
    """
    if not appointment.start_time or not appointment.end_time:
        raise PermissionDenied(
            "This appointment does not have a valid scheduled time."
        )

    appointment_end = datetime.combine(
        appointment.preferred_date,
        appointment.end_time,
    )

    return timezone.make_aware(
        appointment_end,
        timezone.get_current_timezone(),
    )


def get_consultation_window(appointment):
    """
    Return the allowed access window:
    15 minutes before the appointment until
    30 minutes after its scheduled end.
    """
    if not appointment.start_time or not appointment.end_time:
        raise PermissionDenied(
            "This appointment does not have a valid scheduled time."
        )

    appointment_start = datetime.combine(
        appointment.preferred_date,
        appointment.start_time,
    )

    appointment_end = get_appointment_end_datetime(appointment)

    current_timezone = timezone.get_current_timezone()

    appointment_start = timezone.make_aware(
        appointment_start,
        current_timezone,
    )

    allowed_start = appointment_start - timedelta(
        minutes=CONSULTATION_EARLY_MINUTES
    )

    allowed_end = appointment_end + timedelta(
        minutes=CONSULTATION_LATE_MINUTES
    )

    return allowed_start, allowed_end


def generate_participant_token(user, role, room_id):
    """
    Generate a short-lived token restricted to one room
    and one participant.

    Doctors join directly.
    Patients request admission through the waiting lobby.
    """
    api_key = settings.VIDEOSDK_API_KEY
    secret = settings.VIDEOSDK_SECRET

    if not api_key or not secret:
        raise RuntimeError("VideoSDK credentials are not configured.")

    permission = (
        "allow_join"
        if role == "doctor"
        else "ask_join"
    )

    participant_id = f"{role}-{user.pk}"

    now = timezone.now()

    payload = {
        "apikey": api_key,
        "permissions": [permission],
        "version": 2,
        "roomId": room_id,
        "participantId": participant_id,
        "roles": ["rtc"],
        "iat": now,
        "exp": now + timedelta(
            minutes=PARTICIPANT_TOKEN_LIFETIME_MINUTES
        ),
    }

    token = jwt.encode(
        payload,
        secret,
        algorithm="HS256",
    )

    return token, participant_id


class VideoConsultationTokenView(APIView):
    """
    Return the room ID and a participant-specific VideoSDK token.

    Only the assigned active doctor and appointment-owning patient
    may request access.

    Appointment must be confirmed and must be a video consultation.
    Access is limited to the configured consultation time window.
    """

    permission_classes = [IsAuthenticated]

    def post(self, request, appointment_id):
        if not request.user.is_active:
            raise PermissionDenied(
                "Your account is not active."
            )

        appointment = get_object_or_404(
            Appointment.objects.select_related(
                "patient",
                "provider",
            ),
            pk=appointment_id,
        )

        role = get_appointment_participant_role(
            request.user,
            appointment,
        )

        if appointment.status != "Confirmed":
            raise PermissionDenied(
                "Only confirmed appointments can start a video consultation."
            )

        if appointment.consultation_type != "Video consultation":
            raise PermissionDenied(
                "Video access is available only for video appointments."
            )

        if not appointment.provider.is_active:
            raise PermissionDenied(
                "This doctor's account is not currently available."
            )

        allowed_start, allowed_end = get_consultation_window(
            appointment
        )

        appointment_ends_at = get_appointment_end_datetime(
            appointment
        )

        now = timezone.now()

        if now < allowed_start:
            return Response(
                {
                    "detail": (
                        "Your video consultation is not available yet. "
                        "You can join 15 minutes before the scheduled start."
                    ),
                    "available_at": allowed_start.isoformat(),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if now > allowed_end:
            raise PermissionDenied(
                "The video consultation access window has ended."
            )

        try:
            with transaction.atomic():
                locked_appointment = (
                    Appointment.objects
                    .select_for_update()
                    .select_related("provider")
                    .get(pk=appointment.pk)
                )

                if locked_appointment.status != "Confirmed":
                    raise PermissionDenied(
                        "This appointment is no longer confirmed."
                    )

                if (
                    locked_appointment.consultation_type
                    != "Video consultation"
                ):
                    raise PermissionDenied(
                        "Video access is available only for video appointments."
                    )

                if not locked_appointment.provider.is_active:
                    raise PermissionDenied(
                        "This doctor's account is not currently available."
                    )

                locked_allowed_start, locked_allowed_end = (
                    get_consultation_window(locked_appointment)
                )

                locked_appointment_end = (
                    get_appointment_end_datetime(locked_appointment)
                )

                locked_now = timezone.now()

                if locked_now < locked_allowed_start:
                    raise PermissionDenied(
                        "Your video consultation is not available yet."
                    )

                if locked_now > locked_allowed_end:
                    raise PermissionDenied(
                        "The video consultation access window has ended."
                    )

                consultation, _ = (
                    VideoConsultation.objects.get_or_create(
                        appointment=locked_appointment,
                    )
                )

                if not consultation.room_id:
                    consultation.room_id = create_videosdk_room()
                    consultation.save(
                        update_fields=[
                            "room_id",
                            "updated_at",
                        ]
                    )

                room_id = consultation.room_id

                appointment_ends_at = locked_appointment_end
                allowed_end = locked_allowed_end

        except RuntimeError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        try:
            token, participant_id = generate_participant_token(
                request.user,
                role,
                room_id,
            )

        except RuntimeError:
            logger.exception(
                "VideoSDK participant token generation failed."
            )
            return Response(
                {
                    "detail": (
                        "Video consultation access is temporarily unavailable."
                    )
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        return Response(
            {
                "room_id": room_id,
                "token": token,
                "participant_id": participant_id,
                "participant_name": (
                    request.user.get_full_name().strip()
                    or request.user.username
                ),
                "role": role,
                "appointment_id": appointment.id,
                "appointment_ends_at": appointment_ends_at.isoformat(),
                "available_until": allowed_end.isoformat(),
            },
            status=status.HTTP_200_OK,
        )
