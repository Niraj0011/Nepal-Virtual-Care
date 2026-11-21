from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import (
    Appointment,
    DoctorProfile,
    PatientHealthHistory,
)
from .serializers import PatientHealthHistorySerializer


User = get_user_model()


class PatientHealthHistoryView(APIView):
    """
    Allows a patient to view and update their own health history.
    Doctors and administrators cannot use this endpoint to edit it.
    """

    permission_classes = [IsAuthenticated]

    def get_patient(self, request):
        user = request.user

        if user.is_staff or user.is_superuser:
            return None

        if DoctorProfile.objects.filter(user=user).exists():
            return None

        return user

    def get(self, request):
        patient = self.get_patient(request)

        if patient is None:
            return Response(
                {"detail": "Only patients can access their own health history here."},
                status=status.HTTP_403_FORBIDDEN,
            )

        history, created = PatientHealthHistory.objects.get_or_create(
            patient=patient
        )

        serializer = PatientHealthHistorySerializer(history)

        response = Response(serializer.data)
        response["Cache-Control"] = "private, no-store"
        return response

    def put(self, request):
        patient = self.get_patient(request)

        if patient is None:
            return Response(
                {"detail": "Only patients can update their own health history."},
                status=status.HTTP_403_FORBIDDEN,
            )

        history, created = PatientHealthHistory.objects.get_or_create(
            patient=patient
        )

        serializer = PatientHealthHistorySerializer(
            history,
            data=request.data,
            partial=True,
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        response = Response(serializer.data)
        response["Cache-Control"] = "private, no-store"
        return response

    def patch(self, request):
        return self.put(request)


class DoctorPatientHealthHistoryView(APIView):
    """
    Allows an active doctor to view a patient's health history
    only when the patient has a confirmed or completed appointment
    with that doctor's provider.

    Doctors cannot edit patient health history.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request, patient_id):
        doctor_profile = (
            DoctorProfile.objects.filter(
                user=request.user,
                is_active=True,
                user__is_active=True,
                provider__is_active=True,
            )
            .select_related("provider")
            .first()
        )

        if doctor_profile is None:
            return Response(
                {"detail": "An active doctor account is required."},
                status=status.HTTP_403_FORBIDDEN,
            )

        patient = get_object_or_404(User, pk=patient_id)

        authorized = Appointment.objects.filter(
            patient=patient,
            provider=doctor_profile.provider,
            status__in=["Confirmed", "Completed"],
        ).exists()

        if not authorized:
            return Response(
                {
                    "detail": (
                        "You are not authorized to view this patient's "
                        "health history."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        history, created = PatientHealthHistory.objects.get_or_create(
            patient=patient
        )

        serializer = PatientHealthHistorySerializer(history)

        response = Response(serializer.data)
        response["Cache-Control"] = "private, no-store"
        return response